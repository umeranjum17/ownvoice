package dev.ownvoice.bridge

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.PixelFormat
import android.graphics.drawable.AnimatedVectorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.LayerDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.view.WindowInsets
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.Toast
import com.facebook.react.ReactApplication
import io.github.umeranjum17.byokit.overlay.ByokitAccessibility
import io.github.umeranjum17.byokit.overlay.ClearRect
import io.github.umeranjum17.byokit.overlay.FieldIdentity
import io.github.umeranjum17.byokit.overlay.FieldNode
import io.github.umeranjum17.byokit.overlay.FieldSelection
import io.github.umeranjum17.byokit.overlay.FocusedFields
import io.github.umeranjum17.byokit.overlay.ForegroundApp
import io.github.umeranjum17.byokit.overlay.InsertCancellation
import io.github.umeranjum17.byokit.overlay.InsertOpts
import io.github.umeranjum17.byokit.overlay.OverlayEvent
import io.github.umeranjum17.byokit.overlay.PrefsSpotStore
import io.github.umeranjum17.byokit.overlay.Size
import io.github.umeranjum17.byokit.overlay.SpotStore
import io.github.umeranjum17.byokit.overlay.Rules
import io.github.umeranjum17.byokit.overlay.ServiceBubble
import kotlin.concurrent.thread
import kotlin.math.roundToInt

internal fun accessibleText(text: CharSequence?, isShowingHintText: Boolean): String? =
  text?.takeUnless { isShowingHintText }?.toString()

internal fun capturedInputText(text: CharSequence?, isShowingHintText: Boolean): String =
  accessibleText(text, isShowingHintText).orEmpty()

internal fun conversationText(text: CharSequence?, hint: Boolean, action: Boolean): String? =
  if (action) null else accessibleText(text, hint)?.trim()?.takeIf { it.isNotEmpty() }

internal fun isControl(buttonAncestor: Boolean, className: String?): Boolean =
  buttonAncestor || className?.endsWith("Button") == true

internal fun includeScreenNode(hasText: Boolean, hasDescription: Boolean, action: Boolean, editable: Boolean, viewId: String? = null): Boolean =
  (!editable || viewId == "com.android.chrome:id/url_bar") && (hasText || action && hasDescription)

/** The typing check looks only at a message worth checking: at least 12 characters and three words. */
internal fun worthChecking(text: String): Boolean = text.trim().let { it.length >= 12 && it.split(Regex("\\s+")).size >= 3 }

// Chromium caps a control's accessibility value at 10000 UTF-8 bytes. Selection may expose
// truncation even when the last whole UTF-8 letter leaves the prefix just below that cap.
internal fun typingTextLimited(app: String, text: String, selection: FieldSelection?): Boolean =
  app == "com.android.chrome" && (text.toByteArray(Charsets.UTF_8).size in 9997..10000 || (selection?.end ?: 0) > text.length)

internal fun includePracticeText(practice: Boolean, action: Boolean, viewId: String?): Boolean =
  !practice || action || viewId?.startsWith("practice-line-") == true

// X's reply box moves and grows once the draft lands, so its bounds change. The same framework
// node with the same view id and package is still the captured field; another node needs every part to match.
internal fun sameInsertField(expected: FieldIdentity?, actual: FieldIdentity?, sameNode: Boolean = false): Boolean =
  expected != null && actual != null && (actual == expected || sameNode && actual.viewId == expected.viewId && actual.app == expected.app)

internal fun insertTextMatches(app: String, text: String, readingApp: String, expected: String): Boolean =
  app == readingApp && text == expected

internal fun insertSelectionSettled(selection: FieldSelection?, expected: String): Boolean =
  selection?.start == expected.length && selection?.end == expected.length

// Gmail's compose body rejects or ignores ACTION_SET_SELECTION, so its caret never settles. An
// unchanged caret only counts once the retries are spent, so an editor that applies the caret
// asynchronously (Chromium) still gets every retry to settle before it is accepted.
internal fun insertCaretIgnored(selectionSet: Boolean, before: FieldSelection?, actual: FieldSelection?, finalAttempt: Boolean): Boolean =
  !selectionSet || (finalAttempt && before != null && actual == before)

class OwnvoiceService : AccessibilityService() {
  companion object {
    const val TAG = "OwnvoiceNative"
    private const val GMAIL = "com.google.android.gm"
    @Volatile var instance: OwnvoiceService? = null
    @Volatile var onApps: Set<String> = emptySet()
    @Volatile var offApps: Set<String> = emptySet()
    // Generated from mobile/src/core/defaultApps.json, also used by the legacy app and JavaScript.
    val DEFAULT_ON = BuildConfig.DEFAULT_ON.toSet()
    @Volatile var paused = false
    /** Set while the setup's "Try it" step is in front, so the bubble works on Ownvoice's own practice chat. Never saved. */
    @Volatile var practice = false
    @Volatile var panelIsOpen = false
    /** The panel or the rewrite sheet came or went. The flag clears even with no service attached, so a stop after an unbind can't keep the bubble hidden. */
    fun panelShown(open: Boolean) {
      panelIsOpen = open
      instance?.panelOpen = open
    }
    @Volatile var onInserted: ((Boolean, Boolean, Boolean) -> Unit)? = null
    @Volatile var onServiceChange: ((String) -> Unit)? = null
    /** "Check my spelling as I type": off unless the person switches it on in Home. */
    @Volatile var typingCheck = false
    /** Set while the JavaScript side listens for typing pauses; a pause with no listener waits in [pendingTyped]. */
    @Volatile var onTyped: ((String, String) -> Unit)? = null
    @Volatile var pendingTyped: Pair<String, String>? = null
    const val PAUSE_MS = 700L
    private const val HOLD_MS = 380L
    private val facts = mutableListOf<TapFact>()
    private const val FACTS = "tapFacts"
    private const val KEEP_MS = 30L * 24 * 60 * 60 * 1000
    private const val DAY_MS = 24L * 60 * 60 * 1000
    private const val TIP = "Tap for reply ideas, or to polish what you wrote."

    private fun factLine(f: TapFact) = listOf(f.at, f.app.replace(Regex("[\\t\\r\\n]"), " "), f.label.replace(Regex("[\\t\\r\\n]"), " "), f.screen, f.typed, f.replying, f.id, f.sent, f.inserted).joinToString("\t")
    // ponytail: If the service never runs, old facts remain until its next start.
    private fun restoreFacts(context: android.content.Context) {
      val prefs = context.getSharedPreferences("ownvoice-native", MODE_PRIVATE)
      if (facts.isEmpty()) prefs.getString(FACTS, "").orEmpty().lineSequence().filter { it.isNotBlank() }.forEach { line ->
        val parts = line.split('\t')
        if (parts.size in 7..9) parts[0].toLongOrNull()?.let { at ->
          facts += TapFact(at, parts[1], parts[2], parts[3].toBoolean(), parts[4].toBoolean(), parts[5].toBoolean(), parts[6], parts.getOrNull(7) == "true", parts.getOrNull(8) == "true")
        }
      }
      val kept = facts.filter { System.currentTimeMillis() - it.at < KEEP_MS }
      if (kept.size != facts.size && prefs.edit().putString(FACTS, kept.joinToString("\n", transform = ::factLine)).commit()) {
        facts.clear(); facts.addAll(kept)
      }
    }
    fun savedFacts(context: android.content.Context): List<TapFact> = synchronized(facts) {
      restoreFacts(context)
      facts.toList()
    }
    private fun setTapSent(context: android.content.Context, id: String, sent: Boolean) = synchronized(facts) {
      restoreFacts(context)
      val index = facts.indexOfFirst { it.id == id }
      check(index >= 0)
      if (facts[index].sent != sent) {
        val updated = facts.toMutableList().also { it[index] = it[index].copy(sent = sent) }
        check(context.getSharedPreferences("ownvoice-native", MODE_PRIVATE).edit().putString(FACTS, updated.joinToString("\n", transform = ::factLine)).commit())
        facts.clear(); facts.addAll(updated)
      }
    }
    private fun markInserted(context: android.content.Context, id: String) = synchronized(facts) {
      restoreFacts(context)
      val updated = facts.map { if (it.id == id) it.copy(inserted = true) else it }
      check(context.getSharedPreferences("ownvoice-native", MODE_PRIVATE).edit()
        .putString(FACTS, updated.joinToString("\n", transform = ::factLine)).commit()) { "The phone could not save the insertion." }
      facts.clear(); facts.addAll(updated)
    }
    fun markTapSent(context: android.content.Context, id: String) = setTapSent(context, id, true)
    fun unmarkTapSent(context: android.content.Context, id: String) = setTapSent(context, id, false)
    fun clearSavedFacts(context: android.content.Context) = synchronized(facts) {
      check(context.getSharedPreferences("ownvoice-native", MODE_PRIVATE).edit().remove(FACTS).commit())
      facts.clear()
    }
  }

  data class TapFact(val at: Long, val app: String, val label: String, val screen: Boolean, val typed: Boolean, val replying: Boolean, val id: String, val sent: Boolean = false, val inserted: Boolean = false)
  data class ScreenText(val text: String, val left: Int, val top: Int, val bottom: Int, val clickable: Boolean, val viewId: String? = null, val description: String? = null)
  data class Capture(val conversation: String, val written: String, val typed: String, val app: String, val label: String, val at: Long, val input: AccessibilityNodeInfo?, val insertField: FieldNode?, val nodes: List<ScreenText>, val fieldTop: Int?, val id: String, val typingLimited: Boolean = false, val opensReply: Boolean = false,
    /** The field's box as it was when the reading was taken, so a note keeps off it after the node has been written to. */
    val fieldBox: ClearRect? = null)
  private val main = Handler(Looper.getMainLooper())
  private var capture: Capture? = null
  private var tapSeq = 0
  private val saver by lazy { java.util.concurrent.Executors.newSingleThreadExecutor() }
  /** The kit's bubble, driven with no JavaScript running so it restores after a reboot or process death. */
  private var bubbles: ServiceBubble? = null
  private var unwatch: (() -> Unit)? = null
  /** The app in front, from window-state events: the kit's poll missed Chrome coming forward. */
  private var frontApp: String? = null
  private val frontListeners = mutableListOf<(String?) -> Unit>()
  private val front = object : ForegroundApp {
    override val current: String? get() = frontApp
    override fun onChange(fn: (String?) -> Unit): () -> Unit {
      frontListeners += fn
      return { frontListeners -= fn }
    }
  }
  private val typingPause = Runnable { typed() }
  private var typedApp: String? = null
  private var checkedText: String? = null
  private var checkedApp: String? = null
  private var pausedAt = 0L
  /** A note said while the panel closes, such as "Copied.", shown once the app it closed over is back: text, how long
   * it shows, when it first showed (0 until then, so the note keeps its whole time on screen; it expires after it), and
   * the boxes of the field and send controls it keeps off. */
  private data class Note(val text: String, val forMs: Long, val shownAt: Long, val clear: List<ClearRect>, val tries: Int = 0)
  private var pendingNote: Note? = null
  private var slipApp: String? = null
  private var slipCount = 0
  private var slipLabel = ""
  @Volatile private var limitedApp: String? = null
  private var insertCancellation: InsertCancellation? = null
  private var pendingInsert: (() -> Unit)? = null
  private var lastPrune = 0L
  private val readCue by lazy { ReadCue(this) }
  private val openPanel = Runnable {
    readCue.stop()
    if (capture != null) startActivity(Intent(this, PanelActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
  }
  private val prefs by lazy { getSharedPreferences("ownvoice-native", MODE_PRIVATE) }
  var panelOpen: Boolean
    get() = panelIsOpen
    // When the panel opens, put idle back (the bubble is hidden then), so closing it never leaves the tap mood on the bubble.
    set(value) { panelIsOpen = value; if (value) restIdle(); refreshBubble(); if (!value) sayPending() }

  private fun px(dp: Int) = (dp * resources.displayMetrics.density).toInt()
  private fun kitRules() = Rules(paused, onApps.toList(), offApps.toList(), DEFAULT_ON.toList())
  /** The bubble shows unless the panel covers it; the setup's practice chat is allowed on top of the kit's
    rules (on top of on/off, but never over pause, the way [allowed] reads it). */
  private fun effectiveRules() = kitRules().copy(
    paused = paused || panelIsOpen,
    on = (if (practice) onApps + packageName else onApps - packageName).toList(),
    off = (if (practice) offApps - packageName else offApps + packageName).toList(),
  )
  private fun allowed(app: String?) = !paused && if (app == packageName) practice else kitRules().shows(app)
  private fun reducedMotion() = Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

  override fun onServiceConnected() {
    super.onServiceConnected()
    serviceInfo = serviceInfo.apply { flags = flags or AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS }
    paused = prefs.getBoolean("paused", false)
    onApps = prefs.getStringSet("on", emptySet()).orEmpty()
    offApps = prefs.getStringSet("off", emptySet()).orEmpty()
    typingCheck = prefs.getBoolean("typingCheck", false)
    synchronized(facts) { restoreFacts(this) }
    lastPrune = System.currentTimeMillis()
    // The kit's window, keyboard inset and focused field ride this service; the front app comes from its window events.
    ByokitAccessibility.attach(this)
    // Bound while Chrome is already in front: no window event has come yet, so read the front app once.
    frontApp = currentApp()
    if (bubbles == null) {
      val spots = PrefsSpotStore(this)
      migrateSpots(spots)
      bubbles = ServiceBubble(::moodDrawable, spots, ::reducedMotion, foregroundNow = { front })
      bubbles?.events?.add { e -> when (e) {
        OverlayEvent.Tap -> onBubbleTap()
        OverlayEvent.Dismissed -> bubbleDismissed()
        else -> {}
      } }
    }
    unwatch?.invoke()
    unwatch = front.onChange { updateBubble() }
    startBubble()
    instance = this
    updateBubble()
    onServiceChange?.invoke("on")
    if (prefs.getBoolean("comeBack", false)) {
      prefs.edit().remove("comeBack").apply()
      // Setup comes back to the front by itself once the service connects (B10), the way Kotlin's
      // service started SetupActivity directly; a deep link reaches the setup screen through the router.
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("ownvoice://setup"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
    }
  }

  /** Ownvoice's saved pixel positions are app data; convert them once into the kit's spot contract. */
  private fun migrateSpots(spots: SpotStore) {
    val wm = getSystemService(WindowManager::class.java)
    val metrics = if (Build.VERSION.SDK_INT >= 30) wm.currentWindowMetrics else null
    val bars = if (Build.VERSION.SDK_INT >= 30) metrics?.windowInsets?.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()) else null
    val status = bars?.top ?: resources.getIdentifier("status_bar_height", "dimen", "android")
      .takeIf { it != 0 }?.let(resources::getDimensionPixelSize) ?: px(24)
    val screen = Size(metrics?.bounds?.width() ?: resources.displayMetrics.widthPixels,
      (metrics?.bounds?.height() ?: resources.displayMetrics.heightPixels) - (bars?.bottom ?: 0))
    val bubble = Size(px(56), px(56))
    prefs.all.forEach { (key, value) ->
      if (key.startsWith("bubble:") && value is String) {
        val app = key.removePrefix("bubble:").takeIf { it.isNotBlank() } ?: return@forEach
        val target = SpotStore.key(true, app)
        if (spots.get(target) == null) legacySpot(value, screen, bubble, status)?.let { spots.put(target, it) }
      }
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent) {
    if (System.currentTimeMillis() - lastPrune >= DAY_MS) {
      synchronized(facts) { restoreFacts(this) }
      lastPrune = System.currentTimeMillis()
    }
    when (event.eventType) {
      AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> windowFronted(event)
      // Any window change re-reads the active app, so a service bound while Chrome was already in front is corrected by the next one.
      AccessibilityEvent.TYPE_WINDOWS_CHANGED -> frontChanged(currentApp())
      AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> textChanged(event)
    }
  }

  /** An app window came to the front. The keyboard, the shade and system dialogs don't count as the app in front. */
  private fun windowFronted(event: AccessibilityEvent) {
    if (windows.any { it.id == event.windowId && it.type == AccessibilityWindowInfo.TYPE_APPLICATION }) frontChanged(event.packageName?.toString())
  }

  private fun frontChanged(app: String?) {
    if (app == null || app == frontApp) return
    frontApp = app
    Log.i(TAG, "front app=$app bubble=${effectiveRules().shows(app)}")
    frontListeners.toList().forEach { it(app) }
  }

  /** The typing check, per keystroke: nothing but re-arming the pause. The box itself is read once, when the pause comes. */
  private fun textChanged(event: AccessibilityEvent) {
    if (!typingCheck || event.isPassword) return
    val app = event.packageName?.toString()?.takeIf(::allowed) ?: return
    typedApp = app
    main.removeCallbacks(typingPause)
    main.postDelayed(typingPause, PAUSE_MS)
  }

  /** A typing pause: read the focused message box (never a password box) and hand its text to the check, starting the JavaScript side if nothing of Ownvoice is open. */
  private fun typed() {
    val app = typedApp ?: return
    if (!typingCheck || !allowed(app) || currentApp() != app) return
    val focused = FocusedFields.read(this)?.takeIf { it.app == app }
    val text = focused?.text.orEmpty()
    if (typingTextLimited(app, text, focused?.selection)) {
      val announce = limitedApp != app
      limitedApp = app
      checkedText = null; checkedApp = null
      showSlips(app, 0, "")
      val notice = getString(R.string.ownvoice_typing_limited)
      bubbles?.setLabel("Ownvoice, $notice")
      if (announce) say(notice, 6000)
      return
    }
    if (limitedApp != null) { limitedApp = null; bubbles?.setLabel("Ownvoice") }
    if (!worthChecking(text)) { checkedText = null; checkedApp = null; return showSlips(app, 0, "") }
    if (text == checkedText && app == checkedApp) return
    checkedText = text; checkedApp = app
    pausedAt = SystemClock.elapsedRealtime()
    val send = onTyped
    if (send != null) return send(app, text)
    pendingTyped = app to text
    runCatching { (application as? ReactApplication)?.reactHost?.takeIf { it.currentReactContext == null }?.start() }
      .onFailure { Log.w(TAG, "typing check couldn't start", it) }
  }

  /** The check's answer: the count on Dot, or none. [label] is what a screen reader says after "Ownvoice". */
  fun showSlips(app: String, count: Int, label: String, checkMs: Double? = null) {
    if (checkMs != null) Log.d(TAG, "typing check ms=${"%.2f".format(checkMs)} badge ms=${SystemClock.elapsedRealtime() - pausedAt} count=$count")
    if (count == 0 && slipCount == 0) return
    val shown = if (typingCheck && app != limitedApp && count > 0 && app == currentApp()) count else 0
    if (shown == slipCount && (shown == 0 || app == slipApp)) return
    slipApp = app.takeIf { shown > 0 }; slipCount = shown; slipLabel = label
    bubbles?.setLabel(if (slipCount > 0) "Ownvoice, $slipLabel" else "Ownvoice")
    bubbles?.setMood("idle")
  }

  /** The switch went off: drop anything waiting and the count. */
  fun typingOff() {
    main.removeCallbacks(typingPause)
    typedApp = null; checkedText = null; checkedApp = null; pendingTyped = null
    limitedApp = null; bubbles?.setLabel("Ownvoice")
    showSlips("", 0, "")
  }
  override fun onInterrupt() {}
  override fun onUnbind(intent: Intent?): Boolean {
    forget()
    stopBubble()
    return super.onUnbind(intent)
  }
  override fun onDestroy() {
    forget()
    instance = null
    onServiceChange?.invoke("off")
    main.removeCallbacksAndMessages(null)
    saver.shutdown()
    stopBubble()
    readCue.close()
    super.onDestroy()
  }

  private fun startBubble() {
    bubbles?.start(ServiceBubble.Config(mood = "idle", label = "Ownvoice", rules = effectiveRules(), perAppSpots = true))
    bubbles?.setLabel(if (slipCount > 0) "Ownvoice, $slipLabel" else "Ownvoice")
  }

  /** Dropped on the kit's "turn it off" target, which already stopped it: pause as Home's Pause does, so Home shows it
   * paused and Resume brings it back. */
  private fun bubbleDismissed() {
    setRules(true, onApps, offApps)
    startBubble()
  }

  private fun stopBubble() {
    readCue.stop()
    unwatch?.invoke()
    unwatch = null
    bubbles?.stop()
    ByokitAccessibility.detach(this)
  }

  fun updateBubble() {
    if (Looper.myLooper() != Looper.getMainLooper()) { main.post { updateBubble() }; return }
    val app = frontApp
    // Another app in front drops the count; Ownvoice's own panel over it keeps it.
    if (limitedApp != null && app != limitedApp && !panelIsOpen) { limitedApp = null; bubbles?.setLabel("Ownvoice") }
    if (slipCount > 0 && app != slipApp && !panelIsOpen) showSlips(app.orEmpty(), 0, "")
    refreshBubble()
    sayPending()
    if (app != null && !panelIsOpen && effectiveRules().shows(app) && !prefs.getBoolean("tipShown", false)) {
      prefs.edit().putBoolean("tipShown", true).apply()
      say(TIP, 6000)
    }
  }

  /** The kit shows or hides the bubble from the persisted rules (paused while the panel covers it). */
  private fun refreshBubble() {
    if (Looper.myLooper() != Looper.getMainLooper()) { main.post { refreshBubble() }; return }
    bubbles?.setRules(effectiveRules())
  }

  private fun onBubbleTap() {
    bubbles?.setMood("listening")
    readScreen()
  }

  fun setRules(pausedNow: Boolean, on: Set<String>, off: Set<String>) {
    check(prefs.edit().putBoolean("paused", pausedNow).putStringSet("on", on).putStringSet("off", off).commit())
    paused = pausedNow; onApps = on; offApps = off
    if (capture != null && !allowed(capture?.app)) forget()
    updateBubble()
  }

  private fun currentApp() = appRoot()?.packageName?.toString()
  private fun appRoot(): AccessibilityNodeInfo? = windows.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_APPLICATION && it.isActive }?.root
    ?: windows.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }?.root

  fun readScreen() {
    main.removeCallbacks(openPanel)
    readCue.stop()
    forget()
    // The send controls of an earlier insert may have moved since; the next insert measures them again.
    bubbles?.keepClear(emptyList())
    pendingNote = null
    val app = currentApp()?.takeIf(::allowed) ?: run { restIdle(); return }
    // The kit looks in every window; only a box of the app in front counts, like the typed text below.
    val readStart = SystemClock.elapsedRealtime()
    val field = focusedField()?.takeIf { it.packageName?.toString() == app }
    val lines = mutableListOf<String>(); val written = mutableListOf<String>()
    val nodes = mutableListOf<ScreenText>()
    val boxes = mutableListOf<Rect>()
    val practiceField = app == packageName && field?.contentDescription?.toString() == "Practice message"
    // Only the chat containing the practice field is conversation; setup instructions live outside it.
    val root = field?.window?.root ?: appRoot()
    root?.let { visibleText(it, field, lines, written, nodes, boxes, practiceField) }
    // An open Gmail thread has no message box, only Gmail's own Reply: a draft picked there opens that reply.
    val opensReply = app == GMAIL && field == null && replyControl(root) != null
    Log.d(TAG, "capture practice=$practiceField conversationLines=${lines.size} clickableNodes=${nodes.count { it.clickable }}")
    // Show the reading right away; the rest of the read below can block this thread for a few hundred ms.
    val drawable = drawableBoxes(boxes, resources.displayMetrics.heightPixels)
    val cue = drawable.isNotEmpty() && !reducedMotion()
    if (cue) readCue.play(bubbleBounds(), drawable)
    val fieldBounds = Rect()
    field?.getBoundsInScreen(fieldBounds)
    // No box found above: the full read would only wait out its pauses again, on this thread.
    val focused = if (field != null) FocusedFields.read(this)?.takeIf { it.app == app } else null
    val typed = focused?.text.orEmpty()
    Log.d(TAG, "field reads ms=${SystemClock.elapsedRealtime() - readStart} field=${field != null}")
    val label = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString() }.getOrDefault(app)
    val id = java.util.UUID.randomUUID().toString()
    val reading = Capture(lines.joinToString("\n"), written.joinToString("\n"), typed, app, label, System.currentTimeMillis(), field, field?.let { FieldNode.of(it, this) }, nodes, if (field != null) (fieldBounds.top / resources.displayMetrics.density).roundToInt() else null, id, typingTextLimited(app, typed, focused?.selection), opensReply, if (fieldBounds.width() > 0 && fieldBounds.height() > 0) ClearRect(fieldBounds.left, fieldBounds.top, fieldBounds.width(), fieldBounds.height()) else null)
    val fact = TapFact(reading.at, app, label, lines.isNotEmpty(), typed.isNotEmpty(), typed.isEmpty() && written.isNotEmpty(), id)
    // commit() fsyncs, which on a slow disk can hold the main thread past the 5 s ANR line, so the save runs
    // on its own thread and the read carries on here once it answers; a forget() or newer tap in between drops it.
    val tap = ++tapSeq
    saver.execute {
      val saved = synchronized(facts) {
        restoreFacts(this@OwnvoiceService)
        val ok = prefs.edit().putString(FACTS, (facts + fact).joinToString("\n", transform = ::factLine)).commit()
        if (ok) facts += fact
        ok
      }
      main.post { if (tap == tapSeq) afterTapSaved(saved, reading, cue, lines.isEmpty() && field == null) }
    }
  }

  private fun afterTapSaved(saved: Boolean, reading: Capture, cue: Boolean, nothingRead: Boolean) {
    if (!saved) { readCue.stop(); Toast.makeText(this, "This tap wasn't saved.", Toast.LENGTH_LONG).show(); restIdle(); return }
    if (nothingRead) return say("No text on this screen.")
    capture = reading
    if (!cue) return openPanel.run()
    // The panel waits out the rest of the cue's opening beat, counted from when the cue started.
    main.postDelayed(openPanel, (HOLD_MS - (SystemClock.uptimeMillis() - readCue.startedAt)).coerceAtLeast(0))
  }

  /** Where Dot sits on screen: the kit's small overlay window, if the system lists it. */
  private fun bubbleBounds(): Rect? = windows.filter { it.type == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY }
    .map { Rect().also(it::getBoundsInScreen) }
    .filter { it.width() in 1 until resources.displayMetrics.widthPixels / 2 }
    .minByOrNull { it.width() * it.height() }

  /** The kit's reader, like the typed text beside it: it looks in every window and at accessibility focus too, because with
   * Gboard's toolbar up the active window's input focus can be a Gboard view and Chrome's focused box is then missed. */
  private fun focusedField(): AccessibilityNodeInfo? = FocusedFields.focusedNode(this)

  private fun visibleText(root: AccessibilityNodeInfo, skip: AccessibilityNodeInfo?, lines: MutableList<String>, written: MutableList<String>, nodes: MutableList<ScreenText>, boxes: MutableList<Rect>, practice: Boolean) {
    fun walk(node: AccessibilityNodeInfo, buttonAncestor: Boolean) {
      if (node == skip || !node.isVisibleToUser) return
      val action = isControl(buttonAncestor, node.className?.toString())
      val label = accessibleText(node.text ?: node.contentDescription, node.isShowingHintText)?.trim()?.takeIf { it.isNotEmpty() }
      val text = if (includePracticeText(practice, action, node.viewIdResourceName)) label else null
      val conversation = if (text != null) conversationText(node.text ?: node.contentDescription, node.isShowingHintText, action) else null
      if (conversation != null && lines.lastOrNull() != conversation) {
        lines += conversation
        if (!node.isEditable && node.viewIdResourceName != "com.android.chrome:id/url_bar") boxes += Rect().also(node::getBoundsInScreen)
      }
      text?.let {
        if (includeScreenNode(node.text != null, node.contentDescription != null, action, node.isEditable, node.viewIdResourceName)) {
          if (conversation != null && node.viewIdResourceName != "com.android.chrome:id/url_bar") written += it
          val bounds = Rect()
          node.getBoundsInScreen(bounds)
          val density = resources.displayMetrics.density
          nodes += ScreenText(it, (bounds.left / density).roundToInt(), (bounds.top / density).roundToInt(), (bounds.bottom / density).roundToInt(), action, node.viewIdResourceName, node.contentDescription?.toString())
        }
      }
      for (i in 0 until node.childCount) node.getChild(i)?.let { walk(it, action) }
    }
    walk(root, false)
  }

  fun captured() = capture?.takeIf { allowed(it.app) }
  fun forget() {
    tapSeq++
    insertCancellation?.cancel()
    capture = null
    pendingInsert?.invoke()
  }
  fun clearTapFacts() = clearSavedFacts(this)

  /** The focused editable in the other apps' windows: where a Replace sheet was opened from. Null when none has focus.
   *  The kit's reader, as [focusedField]: with Gboard's toolbar up the front window's input focus can be a Gboard view. */
  fun editableBehindSheet(): AccessibilityNodeInfo? = focusedField()?.takeIf { it.packageName != packageName }

  /** Replace: sets [field] to [whole] off the main thread; the retries wait out the sheet closing. The caller composes
   *  [whole] from the selection read when the sheet opened, since Chrome drops its selection once the sheet is in front. */
  fun replaceField(field: AccessibilityNodeInfo, whole: String) {
    thread {
      // The kit finds the field through its focus once per call, and the field has none until the sheet has closed:
      // "failed" then means not yet (or a password), so try again for about three seconds.
      var result = "failed"
      for (i in 0 until 20) {
        if (i > 0) Thread.sleep(150)
        result = FocusedFields.insert(field, whole, "all",
          InsertOpts(attempts = 13, retryMs = 150, acceptNewlineLoss = false), Thread::sleep, ::copyDraft, service = this)
        if (result != "failed") break
      }
      Log.i(TAG, "rewrite replace result=$result")
    }
  }

  fun insert(text: String, done: (Boolean, Boolean) -> Unit) {
    if (pendingInsert != null) {
      copyDraft(text)
      say("Copied, paste it in")
      onInserted?.invoke(false, false, false)
      return done(false, false)
    }
    val reading = captured()
    val cancellation = InsertCancellation()
    insertCancellation = cancellation
    pendingInsert = { finishInsert(cancellation, reading, text, "cancelled", done) }
    if (reading != null && reading.insertField == null && reading.opensReply) return openReply(cancellation, reading, text, done)
    val node = reading?.insertField ?: return finishInsert(cancellation, reading, text, "failed", done)
    insertInto(node, cancellation, reading, text, done)
  }
  private fun insertInto(node: FieldNode, cancellation: InsertCancellation, reading: Capture?, text: String, done: (Boolean, Boolean) -> Unit) {
    thread {
      val result = FocusedFields.insert(node, text, "all",
        InsertOpts(attempts = 13, retryMs = 150, acceptNewlineLoss = false), Thread::sleep, ::copyDraft,
        cancellation = cancellation, service = this)
      main.post { confirmInsert(cancellation, reading, text, result, done) }
    }
  }

  /** A draft picked over an open Gmail thread: once the panel is gone, tap Gmail's own Reply, wait for its reply box
   *  to take focus, then insert there like any other box. It only opens the reply; the person still presses Send.
   *  No Reply or no box within about six seconds copies the draft instead, as any failed insert does. */
  private fun openReply(cancellation: InsertCancellation, reading: Capture, text: String, done: (Boolean, Boolean) -> Unit, tapped: Boolean = false, remaining: Int = 40) {
    if (insertCancellation !== cancellation) return
    if (capture !== reading) return finishInsert(cancellation, reading, text, "cancelled", done)
    if (remaining <= 0) return finishInsert(cancellation, reading, text, "failed", done)
    val again = { now: Boolean -> main.postDelayed({ openReply(cancellation, reading, text, done, now, remaining - 1) }, 150); Unit }
    if (currentApp() != reading.app) return again(tapped)
    if (!tapped) return again(replyControl(appRoot())?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true)
    val field = focusedField() ?: return again(true)
    val replying = reading.copy(input = field, insertField = FieldNode.of(field, this), opensReply = false)
    capture = replying
    pendingInsert = { finishInsert(cancellation, replying, text, "cancelled", done) }
    Log.i(TAG, "reply opened app=${reading.app}")
    insertInto(replying.insertField!!, cancellation, replying, text, done)
  }

  /** Gmail's Reply on an open thread, for the newest message: the lowest one on screen. */
  private fun replyControl(root: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
    var found: AccessibilityNodeInfo? = null
    var top = -1
    fun walk(node: AccessibilityNodeInfo) {
      if (!node.isVisibleToUser) return
      val label = (node.contentDescription ?: node.text)?.toString()?.trim()
      if (node.isClickable && node.isEnabled && label.equals("Reply", ignoreCase = true)) {
        val bounds = Rect().also(node::getBoundsInScreen)
        if (bounds.top >= top) { top = bounds.top; found = node }
      }
      for (i in 0 until node.childCount) node.getChild(i)?.let(::walk)
    }
    root?.let(::walk)
    return found
  }
  /** Closing the panel restores focus asynchronously. Retry the read, never the write,
   * so a confirmation cannot race the activity transition or write to a new field. */
  private fun confirmInsert(cancellation: InsertCancellation, reading: Capture?, text: String, result: String, done: (Boolean, Boolean) -> Unit, remaining: Int = 13) {
    if (insertCancellation !== cancellation) return
    if (result != "inserted") return finishInsert(cancellation, reading, text, result, done)
    if (capture !== reading) return finishInsert(cancellation, reading, text, "cancelled", done)
    if (verifyInsert(reading, text, remaining <= 1)) return finishInsert(cancellation, reading, text, "verified", done)
    if (remaining <= 1) return finishInsert(cancellation, reading, text, "failed", done)
    main.postDelayed({ confirmInsert(cancellation, reading, text, result, done, remaining - 1) }, 150)
  }

  /** The insert's fallback: the draft on the clipboard for the person to paste. True when it stuck. */
  private fun copyDraft(text: String): Boolean = runCatching {
    getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", text))
  }.isSuccess
  /** A cancelled worker can report after the next capture; its token must never settle another insert or clear that capture. */
  private fun finishInsert(cancellation: InsertCancellation, reading: Capture?, text: String, result: String, done: (Boolean, Boolean) -> Unit) {
    if (insertCancellation !== cancellation) return
    val cancelled = result == "cancelled" || capture !== reading
    val ok = !cancelled && result == "verified"
    val newlinesLost = false
    val practice = ok && reading?.app == packageName && reading?.input?.contentDescription?.toString() == "Practice message"
    insertCancellation = null
    pendingInsert = null
    if (capture === reading) capture = null
    Log.i(TAG, "insert result ok=$ok newlinesLost=$newlinesLost result=$result")
    if (!cancelled) {
      if (practice) restIdle()
      else if (ok) {
        // The note keeps off the field just written to and the send control (say measures them); the text names the send.
        val root = appRoot()
        val send = try { sendBounds(root) } finally { root?.recycle() }
        // The reading is cleared above, so its field box comes in from here.
        say(if (send.isNotEmpty()) "Inserted. Send it yourself." else "Inserted", box = reading?.fieldBox)
      }
      else {
        if (result != "copied") copyDraft(text)
        say("Copied, paste it in", box = reading?.fieldBox)
      }
    }
    if (ok && reading != null) {
      try { markInserted(this, reading.id) }
      catch (error: Exception) { say("Inserted, but could not save the record. ${error.message}") }
    }
    onInserted?.invoke(ok, newlinesLost, practice)
    done(ok, newlinesLost)
  }

  /** Verify through the same focused-field reader as capture, after the panel has closed.
   * A cached node accepting SET_TEXT is not proof that the app kept the draft. */
  private fun verifyInsert(reading: Capture?, text: String, finalAttempt: Boolean): Boolean {
    val appMatches = reading != null && currentApp() == reading.app
    val permitted = reading != null && allowed(reading.app)
    val field = if (appMatches && permitted) focusedField() else null
    val current = field?.let { FieldNode.of(it, this) }
    var resourceMatches = false
    var nodeMatches = false
    var identityMatches = false
    var beforeMatches = false
    var afterMatches = false
    var caretSettled = false
    var caretIgnored = false
    try {
      if (reading == null || field == null || current == null) return false
      val identity = reading.insertField?.identity
      val now = current.identity
      nodeMatches = reading.input == field
      resourceMatches = sameInsertField(identity, now, nodeMatches)
      if (identity != null && !resourceMatches) Log.d(TAG, "insert identity viewId=${identity.viewId == now?.viewId} app=${identity.app == now?.app} bounds=${identity.bounds}->${now?.bounds}")
      // Chromium virtual fields lack view ids. Use exact framework node identity,
      // as the kit does, never package/bounds or another field with matching text.
      identityMatches = if (identity == null) nodeMatches else resourceMatches
      if (!identityMatches) return false
      val before = FocusedFields.read(this) ?: return false
      beforeMatches = insertTextMatches(before.app, before.text, reading.app, text)
      if (!beforeMatches) return false
      val selectionSet = field.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, Bundle().apply {
        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, text.length)
        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, text.length)
      })
      val actual = FocusedFields.read(this) ?: return false
      afterMatches = insertTextMatches(actual.app, actual.text, reading.app, text)
      caretSettled = insertSelectionSettled(actual.selection, text)
      // The same field identity and the exact read-back text above are proof the draft landed
      // even when the caret cannot be moved (see insertCaretIgnored).
      caretIgnored = insertCaretIgnored(selectionSet, before.selection, actual.selection, finalAttempt)
      return afterMatches && (caretSettled || caretIgnored)
    } finally {
      Log.d(TAG, "insert verify app=$appMatches allowed=$permitted focus=${field != null} resourceId=${reading?.insertField?.identity != null} resource=$resourceMatches node=$nodeMatches identity=$identityMatches before=$beforeMatches after=$afterMatches caret=$caretSettled ignore=$caretIgnored")
      current?.recycle()
    }
  }

  /** Screen boxes of the visible send-like controls under [root]; empty when the screen has none to send with. */
  private fun sendBounds(root: AccessibilityNodeInfo?, out: MutableList<ClearRect> = mutableListOf()): List<ClearRect> {
    if (root == null || !root.isVisibleToUser) return out
    val label = (root.text?.takeIf { it.isNotBlank() } ?: root.contentDescription)?.toString()?.trim()?.lowercase()
    if (root.isClickable && root.isEnabled && label in setOf("send", "send message", "send sms", "post", "reply", "publish", "tweet")) {
      val box = Rect()
      root.getBoundsInScreen(box)
      out += ClearRect(box.left, box.top, box.width(), box.height())
    }
    for (i in 0 until root.childCount) {
      val child = root.getChild(i) ?: continue
      try { sendBounds(child, out) } finally { child.recycle() }
    }
    return out
  }

  fun say(message: String, forMs: Long = 4000, box: ClearRect? = null) {
    if (Looper.myLooper() != Looper.getMainLooper()) { main.post { say(message, forMs, box) }; return }
    // The bubble is hidden under the closing panel, and the kit drops its note when the app in front changes, so the
    // note waits for the app the panel closed over (sayPending), where the bubble shows it clear of the field.
    val clear = clearBoxes(box)
    // A system toast sits low on the screen, over the app's message box, so only Ownvoice's own screens with no panel
    // up (setup, practice) use one.
    if (currentApp() == packageName && PanelActivity.current == null && !practice) {
      Toast.makeText(this, message, Toast.LENGTH_LONG).show()
      return
    }
    // Held until the panel's own activity is gone: the insert verifies after the sheet has visibly closed, and a note
    // said while that activity is still finishing is laid out over the app but never painted (seen at 390 and 445 dp,
    // where the wider sheet takes longer, while 360 dp painted). It is announced once it is really on screen.
    pendingNote = Note(message, forMs, 0L, clear)
    Log.i(TAG, "note held: $message clear=${boxes(clear)} panel=${PanelActivity.current != null} open=$panelIsOpen")
    sayPending()
  }

  /** Says [message] with its time and the boxes it keeps off, so the kit moves the bubble and the note together. */
  private fun showNote(message: String, forMs: Long, clear: List<ClearRect>) {
    Log.i(TAG, "note clear=${boxes(clear)}")
    if (clear.isNotEmpty()) bubbles?.keepClear(clear)
    bubbles?.say(message, moodFor(message), forMs, announce = true)
  }

  private fun boxes(clear: List<ClearRect>) = clear.joinToString(";") { "${it.left},${it.top} ${it.width}x${it.height}" }.ifEmpty { "none" }

  /**
   * The box of the field just written to, with the screen's send controls: a note and the bubble keep off both. Measured
   * here rather than left to the kit's focused-field poll, which has no box once the panel has taken the focus, so the
   * note sat where the bubble rests, over the composer.
   */
  private fun clearBoxes(given: ClearRect? = null): List<ClearRect> {
    val out = mutableListOf<ClearRect>()
    // The box of the field the draft was read from (measured then, so a written-to node cannot spoil it), else the
    // live focus's box.
    val read = given ?: capture?.takeIf { it.app == frontApp || panelIsOpen }?.fieldBox
    val live = if (read == null) focusedField()?.let { Rect().also(it::getBoundsInScreen) } else null
    val box = read ?: live?.takeIf { it.width() > 0 && it.height() > 0 }?.let { ClearRect(it.left, it.top, it.width(), it.height()) }
    if (box != null) out += box
    val root = appRoot()
    try { out += sendBounds(root) } finally { root?.recycle() }
    return out
  }

  /** Posted, so it runs after the kit has shown the bubble again for the app in front; it waits while the panel or an
   * Ownvoice screen is in front, and says the note again on each front change until its own time runs out: the kit
   * hides and re-shows the bubble as the panel closes, which drops a note given once at the wrong moment. */
  private fun sayPending() {
    main.post {
      val note = pendingNote ?: return@post
      val left = note.forMs - if (note.shownAt == 0L) 0L else SystemClock.uptimeMillis() - note.shownAt
      if (left <= 0) { pendingNote = null; Log.i(TAG, "note expired: ${note.text}"); return@post }
      if (panelIsOpen || PanelActivity.current != null || frontApp == null || frontApp == packageName) {
        // The panel's own state and its window can lag each other by a moment; wait for both rather than drop the note.
        if (note.tries >= 20) { pendingNote = null; Log.i(TAG, "note dropped, no screen to show it on: ${note.text}"); return@post }
        pendingNote = note.copy(tries = note.tries + 1)
        main.postDelayed({ sayPending() }, 150)
        return@post
      }
      showNote(note.text, left, note.clear)
      if (note.shownAt == 0L) {
        pendingNote = note.copy(shownAt = SystemClock.uptimeMillis(), tries = 0)
        // The kit drops these boxes as the panel's own activity finishes, a moment after the note is said, and puts the
        // note back where the bubble rests (over the field): give them back over the note's first second.
        renewClear(pendingNote!!, 8)
        // A note said as one window gives way to another is laid out but never painted, so say it once more after the
        // transition: the second show always paints, and it carries what is left of the note's own time.
        main.postDelayed({
          val again = pendingNote
          val rest = if (again == null || again.shownAt == 0L) 0L else again.forMs - (SystemClock.uptimeMillis() - again.shownAt)
          if (again != null && again.text == note.text && rest > 500) {
            Log.i(TAG, "note said again after the panel's window settled: ${again.text} restMs=$rest")
            showNote(again.text, rest, again.clear)
          }
        }, 350)
      }
      val said = note.text
      main.postDelayed({ Log.i(TAG, "note drawn=${onScreen(said)} leftMs=$left clear=${note.clear.size} text=$said") }, 400)
    }
  }

  /** Re-applies a showing note's boxes [ticks] times, 150 ms apart; stops when the note is gone or replaced. */
  private fun renewClear(note: Note, ticks: Int) {
    if (ticks <= 0) return
    main.postDelayed({
      val now = pendingNote
      if (now == null || now.shownAt != note.shownAt) return@postDelayed
      if (note.clear.isNotEmpty()) bubbles?.keepClear(note.clear)
      renewClear(note, ticks - 1)
    }, 150)
  }

  /** Whether a visible node on screen carries exactly [text], which a note handed to the kit does only when it draws. */
  private fun onScreen(text: String): Boolean {
    fun walk(node: AccessibilityNodeInfo?): Boolean {
      if (node == null) return false
      if (node.isVisibleToUser && node.text?.toString() == text) return true
      for (i in 0 until node.childCount) if (walk(node.getChild(i))) return true
      return false
    }
    return windows.any { walk(it.root) }
  }

  /** Idle again after a tap mood, so closing the panel never leaves the tap mood on the bubble. */
  private fun restIdle() {
    if (Looper.myLooper() != Looper.getMainLooper()) { main.post { restIdle() }; return }
    bubbles?.setMood("idle")
  }

  /** Done for inserted and copied, check for look-before-sending; anything else keeps the bubble's mood. */
  private fun moodFor(message: String) = when (message) {
    "Inserted", "Inserted. Send it yourself.", "Copied." -> "done"
    "Copied, paste it in", "No text on this screen." -> "check"
    else -> null
  }

  /** Dot's moods for the kit, still under reduced motion; the typing check's count rides on idle. */
  private fun moodDrawable(name: String): Drawable? {
    val dot = getDrawable(when (name) {
      "listening" -> R.drawable.ownvoice_mascot_listening
      "done" -> R.drawable.ownvoice_mascot_done
      "check" -> R.drawable.ownvoice_mascot_check
      else -> if (reducedMotion()) R.drawable.ownvoice_mascot_idle_still else R.drawable.ownvoice_mascot_idle
    }) ?: return null
    (dot as? AnimatedVectorDrawable)?.start()
    return if (name == "idle" && slipCount > 0) LayerDrawable(arrayOf(dot, SlipBadge(slipCount))) else dot
  }

  /** The typing check's count at Dot's top right, drawn like the mark on Dot's own "check" mood: amber, with a dark ring. */
  private inner class SlipBadge(private val count: Int) : Drawable() {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFB95C.toInt() }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = px(3) / 2f; color = 0xFF4E140B.toInt() }
    private val digits = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      // Fixed size so the number always fits its circle; a screen reader says the count in words.
      color = 0xFF4E140B.toInt(); typeface = Typeface.DEFAULT_BOLD; textAlign = Paint.Align.CENTER; textSize = px(11).toFloat()
    }
    override fun draw(canvas: Canvas) {
      val r = px(9).toFloat()
      val cx = bounds.right - r - px(1); val cy = bounds.top + r + px(1)
      canvas.drawCircle(cx, cy, r, fill); canvas.drawCircle(cx, cy, r, ring)
      canvas.drawText(if (count > 9) "9+" else "$count", cx, cy - (digits.descent() + digits.ascent()) / 2, digits)
    }
    override fun setAlpha(alpha: Int) {}
    override fun setColorFilter(colorFilter: ColorFilter?) {}
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
  }

}
