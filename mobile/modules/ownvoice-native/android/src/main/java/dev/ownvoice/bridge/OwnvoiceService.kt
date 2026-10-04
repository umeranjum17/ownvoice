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
import io.github.umeranjum17.byokit.overlay.FieldNode
import io.github.umeranjum17.byokit.overlay.FocusedFields
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

internal fun includePracticeText(practice: Boolean, action: Boolean, viewId: String?): Boolean =
  !practice || action || viewId?.startsWith("practice-line-") == true

class OwnvoiceService : AccessibilityService() {
  companion object {
    const val TAG = "OwnvoiceNative"
    @Volatile var instance: OwnvoiceService? = null
    @Volatile var onApps: Set<String> = emptySet()
    @Volatile var offApps: Set<String> = emptySet()
    // Generated from mobile/src/core/defaultApps.json, also used by the legacy app and JavaScript.
    val DEFAULT_ON = BuildConfig.DEFAULT_ON.toSet()
    @Volatile var paused = false
    /** Set while the setup's "Try it" step is in front, so the bubble works on Ownvoice's own practice chat. Never saved. */
    @Volatile var practice = false
    @Volatile var panelIsOpen = false
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

    private fun factLine(f: TapFact) = listOf(f.at, f.app.replace(Regex("[\\t\\r\\n]"), " "), f.label.replace(Regex("[\\t\\r\\n]"), " "), f.screen, f.typed, f.replying, f.id, f.sent).joinToString("\t")
    // ponytail: If the service never runs, old facts remain until its next start.
    private fun restoreFacts(context: android.content.Context) {
      val prefs = context.getSharedPreferences("ownvoice-native", MODE_PRIVATE)
      if (facts.isEmpty()) prefs.getString(FACTS, "").orEmpty().lineSequence().filter { it.isNotBlank() }.forEach { line ->
        val parts = line.split('\t')
        if (parts.size == 7 || parts.size == 8) parts[0].toLongOrNull()?.let { at ->
          facts += TapFact(at, parts[1], parts[2], parts[3].toBoolean(), parts[4].toBoolean(), parts[5].toBoolean(), parts[6], parts.getOrNull(7) == "true")
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
    fun markTapSent(context: android.content.Context, id: String) = setTapSent(context, id, true)
    fun unmarkTapSent(context: android.content.Context, id: String) = setTapSent(context, id, false)
    fun clearSavedFacts(context: android.content.Context) = synchronized(facts) {
      check(context.getSharedPreferences("ownvoice-native", MODE_PRIVATE).edit().remove(FACTS).commit())
      facts.clear()
    }
  }

  data class TapFact(val at: Long, val app: String, val label: String, val screen: Boolean, val typed: Boolean, val replying: Boolean, val id: String, val sent: Boolean = false)
  data class ScreenText(val text: String, val left: Int, val top: Int, val bottom: Int, val clickable: Boolean, val viewId: String? = null, val description: String? = null)
  data class Capture(val conversation: String, val written: String, val typed: String, val app: String, val label: String, val at: Long, val input: AccessibilityNodeInfo?, val insertField: FieldNode?, val nodes: List<ScreenText>, val fieldTop: Int?, val id: String)
  private val main = Handler(Looper.getMainLooper())
  private var capture: Capture? = null
  /** The kit's bubble, driven with no JavaScript running so it restores after a reboot or process death. */
  private var bubbles: ServiceBubble? = null
  private var unwatch: (() -> Unit)? = null
  private val typingPause = Runnable { typed() }
  private var typedApp: String? = null
  private var checkedText: String? = null
  private var checkedApp: String? = null
  private var pausedAt = 0L
  private var slipApp: String? = null
  private var slipCount = 0
  private var slipLabel = ""
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
    set(value) { panelIsOpen = value; if (value) restIdle(); refreshBubble() }

  private fun px(dp: Int) = (dp * resources.displayMetrics.density).toInt()
  private fun kitRules() = Rules(paused, onApps.toList(), offApps.toList(), DEFAULT_ON.toList())
  /** The bubble shows unless the panel covers it; the setup's practice chat is allowed on top of the kit's
    rules (on top of on/off, but never over pause, the way [allowed] reads it). */
  private fun effectiveRules() = kitRules().copy(
    paused = paused || panelIsOpen,
    on = (if (practice) onApps + packageName else onApps).toList(),
    off = (if (practice) offApps - packageName else offApps).toList(),
  )
  private fun allowed(app: String?) = !paused && (kitRules().shows(app) || (practice && app == packageName))
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
    // The kit's window, foreground app, keyboard inset and focused field all ride this service.
    ByokitAccessibility.attach(this)
    if (bubbles == null) {
      val spots = PrefsSpotStore(this)
      migrateSpots(spots)
      bubbles = ServiceBubble(::moodDrawable, spots, ::reducedMotion)
      bubbles?.events?.add { e -> when (e) {
        OverlayEvent.Tap -> onBubbleTap()
        else -> {}
      } }
    }
    unwatch?.invoke()
    unwatch = ByokitAccessibility.foreground?.onChange { updateBubble() }
    bubbles?.start(ServiceBubble.Config(mood = "idle", label = "Ownvoice", rules = effectiveRules(), perAppSpots = true))
    bubbles?.setLabel(if (slipCount > 0) "Ownvoice, $slipLabel" else "Ownvoice")
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
    // The bubble places itself from the kit's foreground/keyboard polling; typing is the only event Ownvoice acts on.
    if (event.eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) textChanged(event)
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
    val text = FocusedFields.read(this)?.takeIf { it.app == app }?.text.orEmpty()
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
    val shown = if (typingCheck && count > 0 && app == currentApp()) count else 0
    if (shown == slipCount && (shown == 0 || app == slipApp)) return
    slipApp = app.takeIf { shown > 0 }; slipCount = shown; slipLabel = label
    bubbles?.setLabel(if (slipCount > 0) "Ownvoice, $slipLabel" else "Ownvoice")
    bubbles?.setMood("idle")
  }

  /** The switch went off: drop anything waiting and the count. */
  fun typingOff() {
    main.removeCallbacks(typingPause)
    typedApp = null; checkedText = null; checkedApp = null; pendingTyped = null
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
    stopBubble()
    readCue.close()
    super.onDestroy()
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
    val app = ByokitAccessibility.foreground?.current ?: currentApp()
    // Another app in front drops the count; Ownvoice's own panel over it keeps it.
    if (slipCount > 0 && app != slipApp && !panelIsOpen) showSlips(app.orEmpty(), 0, "")
    refreshBubble()
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
    val app = currentApp()?.takeIf(::allowed) ?: run { restIdle(); return }
    val field = focusedField()
    val lines = mutableListOf<String>(); val written = mutableListOf<String>()
    val nodes = mutableListOf<ScreenText>()
    val boxes = mutableListOf<Rect>()
    val practiceField = app == packageName && field?.contentDescription?.toString() == "Practice message"
    // Only the chat containing the practice field is conversation; setup instructions live outside it.
    (field?.window?.root ?: appRoot())?.let { visibleText(it, field, lines, written, nodes, boxes, practiceField) }
    Log.d(TAG, "capture practice=$practiceField conversationLines=${lines.size} clickableNodes=${nodes.count { it.clickable }}")
    // Show the reading right away; the rest of the read below can block this thread for a few hundred ms.
    val drawable = drawableBoxes(boxes, resources.displayMetrics.heightPixels)
    val cue = drawable.isNotEmpty() && !reducedMotion()
    if (cue) readCue.play(bubbleBounds(), drawable)
    val fieldBounds = Rect()
    field?.getBoundsInScreen(fieldBounds)
    val typed = FocusedFields.read(this)?.takeIf { it.app == app }?.text.orEmpty()
    val label = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString() }.getOrDefault(app)
    val id = java.util.UUID.randomUUID().toString()
    val reading = Capture(lines.joinToString("\n"), written.joinToString("\n"), typed, app, label, System.currentTimeMillis(), field, field?.let { FieldNode.of(it, this) }, nodes, if (field != null) (fieldBounds.top / resources.displayMetrics.density).roundToInt() else null, id)
    val fact = TapFact(reading.at, app, label, lines.isNotEmpty(), typed.isNotEmpty(), typed.isEmpty() && written.isNotEmpty(), id)
    val saved = synchronized(facts) {
      restoreFacts(this@OwnvoiceService)
      val ok = prefs.edit().putString(FACTS, (facts + fact).joinToString("\n", transform = ::factLine)).commit()
      if (ok) facts += fact
      ok
    }
    if (!saved) { readCue.stop(); Toast.makeText(this, "This tap wasn't saved.", Toast.LENGTH_LONG).show(); restIdle(); return }
    if (lines.isEmpty() && field == null) return say("No text on this screen.")
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

  private fun focusedField(): AccessibilityNodeInfo? {
    val focus = findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return null
    if (focus.isPassword) return null
    if (focus.isEditable) return focus
    fun find(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
      if (node.isPassword) return null
      if (node.isFocused && node.isEditable) return node
      for (i in 0 until node.childCount) node.getChild(i)?.let(::find)?.let { return it }
      return null
    }
    return find(focus)
  }
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
    insertCancellation?.cancel()
    capture = null
    pendingInsert?.invoke()
  }
  fun clearTapFacts() = clearSavedFacts(this)

  fun insert(text: String, done: (Boolean, Boolean) -> Unit) {
    if (pendingInsert != null) {
      copyDraft(text)
      say("Couldn't insert. Copied, paste it.")
      onInserted?.invoke(false, false, false)
      return done(false, false)
    }
    val reading = captured()
    val cancellation = InsertCancellation()
    insertCancellation = cancellation
    pendingInsert = { finishInsert(cancellation, reading, text, "cancelled", done) }
    val node = reading?.insertField ?: return finishInsert(cancellation, reading, text, "failed", done)
    thread {
      val result = FocusedFields.insert(node, text, "all",
        InsertOpts(attempts = 13, retryMs = 150, acceptNewlineLoss = true), Thread::sleep, ::copyDraft,
        cancellation = cancellation, service = this)
      main.post { finishInsert(cancellation, reading, text, result, done) }
    }
  }
  /** The insert's fallback: the draft on the clipboard for the person to paste. True when it stuck. */
  private fun copyDraft(text: String): Boolean = runCatching {
    getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", text))
  }.isSuccess
  /** A cancelled worker can report after the next capture; its token must never settle another insert or clear that capture. */
  private fun finishInsert(cancellation: InsertCancellation, reading: Capture?, text: String, result: String, done: (Boolean, Boolean) -> Unit) {
    if (insertCancellation !== cancellation) return
    val cancelled = result == "cancelled" || capture !== reading
    val ok = !cancelled && (result == "inserted" || result == "landedWithoutNewlines")
    val newlinesLost = ok && result == "landedWithoutNewlines"
    val practice = ok && reading?.app == packageName && reading?.input?.contentDescription?.toString() == "Practice message"
    insertCancellation = null
    pendingInsert = null
    if (capture === reading) capture = null
    Log.i(TAG, "insert result ok=$ok newlinesLost=$newlinesLost")
    if (!cancelled) {
      if (practice) restIdle()
      else if (ok) say(if (newlinesLost) "Inserted. Check it looks right before sending." else "Inserted. Send it yourself.")
      else {
        if (result != "copied") copyDraft(text)
        say("Couldn't insert. Copied, paste it.")
      }
    }
    onInserted?.invoke(ok, newlinesLost, practice)
    done(ok, newlinesLost)
  }

  fun say(message: String, forMs: Long = 4000) {
    if (Looper.myLooper() != Looper.getMainLooper()) { main.post { say(message, forMs) }; return }
    // Announced, so TalkBack reads the pill the way the old live region did.
    bubbles?.say(message, moodFor(message), forMs, announce = true)
  }

  /** Idle again after a tap mood, so closing the panel never leaves the tap mood on the bubble. */
  private fun restIdle() {
    if (Looper.myLooper() != Looper.getMainLooper()) { main.post { restIdle() }; return }
    bubbles?.setMood("idle")
  }

  /** Done for inserted and copied, check for look-before-sending; anything else keeps the bubble's mood. */
  private fun moodFor(message: String) = when (message) {
    "Inserted. Send it yourself.", "Copied." -> "done"
    "Inserted. Check it looks right before sending.", "Couldn't insert. Copied, paste it.", "No text on this screen." -> "check"
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
