package dev.ownvoice.bridge

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Rect
import android.graphics.Color
import android.graphics.Outline
import android.graphics.PixelFormat
import android.graphics.drawable.AnimatedVectorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.InsetDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.TextView
import android.widget.Toast
import kotlin.math.roundToInt

internal fun accessibleText(text: CharSequence?, isShowingHintText: Boolean): String? =
  text?.takeUnless { isShowingHintText }?.toString()

internal fun capturedInputText(text: CharSequence?, isShowingHintText: Boolean): String =
  accessibleText(text, isShowingHintText).orEmpty()

internal fun conversationText(text: CharSequence?, hint: Boolean, action: Boolean): String? =
  if (action) null else accessibleText(text, hint)?.trim()?.takeIf { it.isNotEmpty() }

internal fun isControl(buttonAncestor: Boolean, className: String?): Boolean =
  buttonAncestor || className?.endsWith("Button") == true

class OwnvoiceService : AccessibilityService() {
  companion object {
    const val TAG = "OwnvoiceNative"
    @Volatile var instance: OwnvoiceService? = null
    @Volatile var onApps: Set<String> = emptySet()
    @Volatile var offApps: Set<String> = emptySet()
    val DEFAULT_ON = setOf("com.twitter.android", "com.linkedin.android", "com.google.android.gm", "com.whatsapp", "com.whatsapp.w4b", "com.Slack", "com.reddit.frontpage")
    @Volatile var paused = false
    /** Set while the setup's "Try it" step is in front, so the bubble works on Ownvoice's own practice chat. Never saved. */
    @Volatile var practice = false
    @Volatile var panelIsOpen = false
    @Volatile var onInserted: ((Boolean, Boolean, Boolean) -> Unit)? = null
    @Volatile var onServiceChange: ((String) -> Unit)? = null
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
  data class ScreenText(val text: String, val left: Int, val top: Int, val bottom: Int, val clickable: Boolean)
  data class Capture(val conversation: String, val written: String, val typed: String, val app: String, val label: String, val at: Long, val input: AccessibilityNodeInfo?, val nodes: List<ScreenText>, val fieldTop: Int?, val id: String)
  private val main = Handler(Looper.getMainLooper())
  private val notes = Handler(Looper.getMainLooper())
  private val reposition = Runnable { updateBubble() }
  private lateinit var wm: WindowManager
  private lateinit var bubble: TextView
  private lateinit var params: WindowManager.LayoutParams
  private var capture: Capture? = null
  private var inserting = false
  private var insertingPractice = false
  private var pendingInsert: (() -> Unit)? = null
  private var resting = true
  private var lastPrune = 0L
  private val prefs by lazy { getSharedPreferences("ownvoice-native", MODE_PRIVATE) }
  private var spot = BubbleSpot(BubbleEdge.Right, 0)
  private var dragging = false
  private var downX = 0f
  private var downY = 0f
  private var leftAtDown = 0
  private var topAtDown = 0
  private val spots by lazy { BubbleSpots({ key -> prefs.getString("bubble:$key", null) }) { key, value -> prefs.edit().putString("bubble:$key", value).commit() } }
  private val statusBarPx by lazy {
    val id = resources.getIdentifier("status_bar_height", "dimen", "android")
    if (id > 0) resources.getDimensionPixelSize(id) else px(24)
  }
  private val screenW get() = resources.displayMetrics.widthPixels
  private val screenH get() = resources.displayMetrics.heightPixels
  /** The overlay is laid out inside the area below the status bar, so the bubble's y is counted from there. */
  private val areaH get() = screenH - statusBarPx
  private val bubbleSize get(): Int {
    if (params.height > 0) return params.height
    bubble.measure(View.MeasureSpec.makeMeasureSpec(screenW, View.MeasureSpec.AT_MOST),
      View.MeasureSpec.makeMeasureSpec(areaH, View.MeasureSpec.AT_MOST))
    return bubble.measuredHeight
  }
  var panelOpen: Boolean
    get() = panelIsOpen
    // When the panel opens, put idle back (the bubble is hidden then), so closing it never leaves the tap mood on the bubble.
    set(value) { panelIsOpen = value; if (value) main.post(restoreBubble); updateBubble() }

  private fun px(dp: Int) = (dp * resources.displayMetrics.density).toInt()
  private fun allowed(app: String?) = app != null && !paused && (app in onApps || (app !in offApps && app in DEFAULT_ON) || (practice && app == packageName))
  private val night get() = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
  private fun colour(id: Int, fallback: Int) = if (android.os.Build.VERSION.SDK_INT >= 31) getColor(id) else fallback

  override fun onServiceConnected() {
    super.onServiceConnected()
    serviceInfo = serviceInfo.apply { flags = flags or AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS }
    paused = prefs.getBoolean("paused", false)
    onApps = prefs.getStringSet("on", emptySet()).orEmpty()
    offApps = prefs.getStringSet("off", emptySet()).orEmpty()
    synchronized(facts) { restoreFacts(this) }
    lastPrune = System.currentTimeMillis()
    wm = getSystemService(WindowManager::class.java)
    bubble = TextView(this).apply {
      gravity = Gravity.CENTER
      textSize = 14f
      maxWidth = px(260)
      contentDescription = "Ownvoice"
      setOnClickListener {
        val shouldRead = resting || text.toString() == TIP
        if (shouldRead) { showMood(R.drawable.ownvoice_mascot_listening); readScreen() } else restoreBubble.run()
      }
      setOnTouchListener { _, event -> onBubbleTouch(event) }
    }
    params = WindowManager.LayoutParams(px(52), px(52), WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT).apply {
      spot = BubbleSpot(BubbleEdge.Right, BubblePlacement.clampTop((areaH - px(52)) / 2, areaH, px(52)))
      gravity = Gravity.TOP or Gravity.END; x = px(8); y = spot.top
    }
    wm.addView(bubble, params)
    instance = this
    restoreBubble.run()
    onServiceChange?.invoke("on")
    if (prefs.getBoolean("comeBack", false)) {
      prefs.edit().remove("comeBack").apply()
      // Setup comes back to the front by itself once the service connects (B10), the way Kotlin's
      // service started SetupActivity directly; a deep link reaches the setup screen through the router.
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("ownvoice://setup"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent) {
    if (System.currentTimeMillis() - lastPrune >= DAY_MS) {
      synchronized(facts) { restoreFacts(this) }
      lastPrune = System.currentTimeMillis()
    }
    if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || event.eventType == AccessibilityEvent.TYPE_WINDOWS_CHANGED || event.eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED) {
      updateBubble()
      main.removeCallbacks(reposition)
      main.postDelayed(reposition, 350) // IME bounds settle after the window/focus event.
    }
  }
  override fun onInterrupt() {}
  override fun onConfigurationChanged(newConfig: Configuration) { super.onConfigurationChanged(newConfig); if (::bubble.isInitialized && resting) restoreBubble.run() }
  override fun onDestroy() {
    pendingInsert?.invoke()
    forget()
    instance = null
    onServiceChange?.invoke("off")
    main.removeCallbacksAndMessages(null)
    notes.removeCallbacksAndMessages(null)
    if (::bubble.isInitialized) runCatching { wm.removeView(bubble) }
    super.onDestroy()
  }

  fun updateBubble() {
    if (Looper.myLooper() != Looper.getMainLooper()) { main.post { updateBubble() }; return }
    if (!::bubble.isInitialized || dragging) return
    val app = currentApp()
    val show = !panelIsOpen && allowed(app)
    bubble.visibility = if (show) View.VISIBLE else View.GONE
    if (!show) return
    spot = spots.spotFor(app.orEmpty(), areaH, px(52)); place()
    if (!prefs.getBoolean("tipShown", false)) {
      prefs.edit().putBoolean("tipShown", true).apply()
      say(TIP, 6000)
    }
  }

  /** Move the bubble, snapping it to an edge on release; a press without movement remains a tap. */
  private fun onBubbleTouch(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.rawX; downY = event.rawY; topAtDown = params.y
        leftAtDown = if (spot.edge == BubbleEdge.Left) params.x else screenW - bubble.width - params.x
        dragging = false
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        if (!dragging && BubblePlacement.isDrag(event.rawX - downX, event.rawY - downY, px(BubblePlacement.SLOP_DP))) dragging = true
        if (dragging) moveTo(leftAtDown + (event.rawX - downX).roundToInt(), topAtDown + (event.rawY - downY).roundToInt())
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        val wasDrag = dragging || BubblePlacement.isDrag(event.rawX - downX, event.rawY - downY, px(BubblePlacement.SLOP_DP))
        dragging = false
        if (event.actionMasked == MotionEvent.ACTION_CANCEL) { updateBubble(); return true }
        if (wasDrag) {
          moveTo(leftAtDown + (event.rawX - downX).roundToInt(), topAtDown + (event.rawY - downY).roundToInt())
          spot = BubbleSpot(BubblePlacement.edge(params.x + bubble.width / 2, screenW), params.y)
          currentApp()?.let { spots.remember(it, spot) }
          updateBubble()
        } else bubble.performClick()
        return true
      }
    }
    return false
  }

  /** The overlay's origin can lie inside the status bar (e.g. y=30 when the bar ends at 63). */
  private fun topInset(): Int {
    if (!bubble.isLaidOut) return statusBarPx
    val location = IntArray(2)
    bubble.getLocationOnScreen(location)
    return (statusBarPx - (location[1] - params.y)).coerceAtLeast(0)
  }

  /** Follow the finger while dragging, kept wholly on the screen. */
  private fun moveTo(left: Int, top: Int) {
    val inset = topInset()
    params.gravity = Gravity.TOP or Gravity.START
    params.x = BubblePlacement.clampLeft(left, screenW, bubble.width)
    params.y = BubblePlacement.clampTop(top, areaH, bubble.height, inset)
    wm.updateViewLayout(bubble, params)
  }

  /** Put the bubble back at its spot, resting above the keyboard when one is up over a field. */
  private fun place() {
    if (!::bubble.isInitialized) return
    val keyboard = keyboardTop()?.minus(statusBarPx)?.takeIf { it > 0 && focusedField() != null }
    params.gravity = Gravity.TOP or (if (spot.edge == BubbleEdge.Left) Gravity.START else Gravity.END)
    params.x = px(8)
    params.y = BubblePlacement.clampTop(BubblePlacement.restTop(spot.top, areaH, bubbleSize, keyboard, px(8)), areaH, bubbleSize, topInset())
    wm.updateViewLayout(bubble, params)
  }

  /** The top of the keyboard on screen, or null when none is up. */
  private fun keyboardTop(): Int? {
    val ime = windows.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD } ?: return null
    val bounds = Rect(); ime.getBoundsInScreen(bounds)
    return bounds.top.takeIf { it > 0 && it < screenH }
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
    val app = currentApp()?.takeIf(::allowed) ?: run { restoreBubble.run(); return }
    val field = focusedField()
    val lines = mutableListOf<String>(); val written = mutableListOf<String>()
    val nodes = mutableListOf<ScreenText>()
    val practiceField = app == packageName && field?.contentDescription?.toString() == "Practice message"
    // Only the chat containing the practice field is conversation; setup instructions live outside it.
    (field?.window?.root ?: appRoot())?.let { visibleText(it, field, lines, written, nodes, practiceField) }
    Log.d(TAG, "capture practice=$practiceField conversationLines=${lines.size} clickableNodes=${nodes.count { it.clickable }}")
    val fieldBounds = Rect()
    field?.getBoundsInScreen(fieldBounds)
    val typed = capturedInputText(field?.text, field?.isShowingHintText == true)
    val label = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString() }.getOrDefault(app)
    val id = java.util.UUID.randomUUID().toString()
    val reading = Capture(lines.joinToString("\n"), written.joinToString("\n"), typed, app, label, System.currentTimeMillis(), field, nodes, if (field != null) (fieldBounds.top / resources.displayMetrics.density).roundToInt() else null, id)
    val fact = TapFact(reading.at, app, label, lines.isNotEmpty(), typed.isNotEmpty(), typed.isEmpty() && written.isNotEmpty(), id)
    val saved = synchronized(facts) {
      restoreFacts(this@OwnvoiceService)
      val ok = prefs.edit().putString(FACTS, (facts + fact).joinToString("\n", transform = ::factLine)).commit()
      if (ok) facts += fact
      ok
    }
    if (!saved) { Toast.makeText(this, "This tap wasn't saved.", Toast.LENGTH_LONG).show(); restoreBubble.run(); return }
    if (lines.isEmpty() && field == null) return say("No text on this screen.")
    capture = reading
    startActivity(Intent(this, PanelActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
  }

  private fun focusedField(): AccessibilityNodeInfo? {
    val focus = findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return null
    if (focus.isEditable) return focus
    fun find(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
      if (node.isFocused && node.isEditable) return node
      for (i in 0 until node.childCount) node.getChild(i)?.let(::find)?.let { return it }
      return null
    }
    return find(focus)
  }
  private fun visibleText(root: AccessibilityNodeInfo, skip: AccessibilityNodeInfo?, lines: MutableList<String>, written: MutableList<String>, nodes: MutableList<ScreenText>, practice: Boolean) {
    fun walk(node: AccessibilityNodeInfo, buttonAncestor: Boolean) {
      if (node == skip || !node.isVisibleToUser) return
      val action = isControl(buttonAncestor, node.className?.toString())
      val label = accessibleText(node.text ?: node.contentDescription, node.isShowingHintText)?.trim()?.takeIf { it.isNotEmpty() }
      val text = if (practice && node.viewIdResourceName?.startsWith("practice-line-") != true) null else label
      val conversation = if (text != null) conversationText(node.text ?: node.contentDescription, node.isShowingHintText, action) else null
      if (conversation != null && lines.lastOrNull() != conversation) lines += conversation
      text?.let {
        if (node.text != null && !node.isEditable) {
          if (conversation != null) written += it
          val bounds = Rect()
          node.getBoundsInScreen(bounds)
          val density = resources.displayMetrics.density
          nodes += ScreenText(it, (bounds.left / density).roundToInt(), (bounds.top / density).roundToInt(), (bounds.bottom / density).roundToInt(), action)
        }
      }
      for (i in 0 until node.childCount) node.getChild(i)?.let { walk(it, action) }
    }
    walk(root, false)
  }

  fun captured() = capture?.takeIf { allowed(it.app) }
  fun forget() { capture = null }
  fun clearTapFacts() = clearSavedFacts(this)

  fun insert(text: String, done: (Boolean, Boolean) -> Unit) {
    if (inserting) {
      getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", text))
      say("Couldn't insert. Copied, paste it.")
      onInserted?.invoke(false, false, false)
      return done(false, false)
    }
    inserting = true
    pendingInsert = { finishInsert(text, false, false, done) }
    val reading = captured()
    insertingPractice = reading?.app == packageName && reading?.input?.contentDescription?.toString() == "Practice message"
    val field = reading?.input ?: return finishInsert(text, false, false, done)
    val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text) }
    fun attempt(left: Int) {
      if (captured() !== reading) return finishInsert(text, false, false, done)
      field.refresh()
      if (field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
        fun verify(left: Int) {
          if (captured() !== reading) return finishInsert(text, false, false, done)
          field.refresh()
          val got = field.text?.toString()
          val newlinesLost = '\n' in text && got == text.replace("\n", "")
          if (got == text || newlinesLost || left == 0) finishInsert(text, got == text || newlinesLost, newlinesLost, done)
          else main.postDelayed({ verify(left - 1) }, 150)
        }
        main.postDelayed({ verify(10) }, 150)
      } else if (left > 0) main.postDelayed({ attempt(left - 1) }, 150)
      else finishInsert(text, false, false, done)
    }
    attempt(13)
  }
  private fun finishInsert(text: String, ok: Boolean, newlinesLost: Boolean, done: (Boolean, Boolean) -> Unit) {
    Log.i(TAG, "insert result ok=$ok newlinesLost=$newlinesLost")
    if (ok) say(if (newlinesLost) "Inserted. Check it looks right before sending." else "Inserted. Send it yourself.")
    else { getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", text)); say("Couldn't insert. Copied, paste it.") }
    forget()
    inserting = false
    pendingInsert = null
    onInserted?.invoke(ok, newlinesLost, ok && insertingPractice)
    insertingPractice = false
    done(ok, newlinesLost)
  }

  fun say(message: String, forMs: Long = 4000) {
    if (Looper.myLooper() != Looper.getMainLooper()) { main.post { say(message, forMs) }; return }
    if (!::bubble.isInitialized) return
    notes.removeCallbacksAndMessages(null); resting = false
    bubble.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    bubble.text = message; bubble.contentDescription = message
    bubble.setTextColor(colour(if (night) android.R.color.system_neutral1_800 else android.R.color.system_neutral1_50, if (night) 0xff303030.toInt() else Color.WHITE))
    bubble.background = GradientDrawable().apply { cornerRadius = px(24).toFloat(); setColor(colour(if (night) android.R.color.system_neutral1_100 else android.R.color.system_neutral1_800, if (night) 0xffe6e1e5.toInt() else 0xff313033.toInt())) }
    bubble.outlineProvider = ViewOutlineProvider.BACKGROUND
    bubble.elevation = px(3).toFloat()
    bubble.setCompoundDrawablesRelative(moodDrawable(message), null, null, null)
    bubble.compoundDrawablePadding = px(8)
    bubble.setPadding(px(18), px(10), px(18), px(10)); params.width = WindowManager.LayoutParams.WRAP_CONTENT; params.height = WindowManager.LayoutParams.WRAP_CONTENT
    updateBubble(); notes.postDelayed(restoreBubble, forMs)
  }

  /** A 20 dp mood at the start of the pill: done for inserted and copied, check for look-before-sending. */
  private fun moodDrawable(message: String) = when (message) {
    "Inserted. Send it yourself.", "Copied." -> R.drawable.ownvoice_mascot_done
    "Inserted. Check it looks right before sending.", "Couldn't insert. Copied, paste it.", "No text on this screen." -> R.drawable.ownvoice_mascot_check
    else -> null
  }?.let { getDrawable(it)!!.apply { setBounds(0, 0, px(20), px(20)) } }
  private val restoreBubble = Runnable {
    if (!::bubble.isInitialized) return@Runnable
    notes.removeCallbacksAndMessages(null); resting = true
    bubble.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_NONE; bubble.text = ""; bubble.contentDescription = "Ownvoice"
    bubble.setCompoundDrawablesRelative(null, null, null, null)
    showMood(if (Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f) R.drawable.ownvoice_mascot_idle_still else R.drawable.ownvoice_mascot_idle)
    bubble.setPadding(0, 0, 0, 0); params.width = px(52); params.height = px(52); updateBubble()
  }

  /** Dot on the bubble, centred in the 52 dp tap target, with a small oval shadow. */
  private fun showMood(res: Int) {
    if (!::bubble.isInitialized) return
    val dot = getDrawable(res)!!
    bubble.background = InsetDrawable(dot, px(2))
    bubble.outlineProvider = dotOutline
    bubble.elevation = px(3).toFloat()
    (dot as? AnimatedVectorDrawable)?.start()
  }

  /** The shadow follows Dot's body, not the 52 dp window. */
  private val dotOutline = object : ViewOutlineProvider() {
    override fun getOutline(view: View, outline: Outline) = outline.setOval(px(6), px(6), view.width - px(6), view.height - px(6))
  }
}
