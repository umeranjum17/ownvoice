package dev.ownvoice.bridge

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.TextView
import org.json.JSONArray

class OwnvoiceService : AccessibilityService() {
  companion object {
    const val TAG = "OwnvoiceNative"
    @Volatile var instance: OwnvoiceService? = null
    @Volatile var onApps: Set<String> = emptySet()
    @Volatile var offApps: Set<String> = emptySet()
    val DEFAULT_ON = setOf("com.twitter.android", "com.linkedin.android", "com.google.android.gm", "com.whatsapp", "com.whatsapp.w4b")
    @Volatile var defaults: Set<String> = DEFAULT_ON
    @Volatile var paused = false
    @Volatile var practice = false
    @Volatile var panelIsOpen = false
    @Volatile var onInserted: ((Boolean, Boolean) -> Unit)? = null
    @Volatile var onServiceChange: ((String) -> Unit)? = null
    private val facts = mutableListOf<TapFact>()
    private const val TIP = "Tap for reply ideas, or to polish what you wrote."
  }

  data class TapFact(val at: Long, val app: String, val label: String, val screen: Boolean, val typed: Boolean, val replying: Boolean)
  data class Capture(val conversation: String, val written: String, val typed: String, val app: String, val label: String, val at: Long, val input: AccessibilityNodeInfo?)
  private val main = Handler(Looper.getMainLooper())
  private val notes = Handler(Looper.getMainLooper())
  private lateinit var wm: WindowManager
  private lateinit var bubble: TextView
  private lateinit var params: WindowManager.LayoutParams
  private var capture: Capture? = null
  private var inserting = false
  private var resting = true
  private val prefs by lazy { getSharedPreferences("ownvoice-native", MODE_PRIVATE) }
  var panelOpen: Boolean
    get() = panelIsOpen
    set(value) { panelIsOpen = value; updateBubble() }

  private fun px(dp: Int) = (dp * resources.displayMetrics.density).toInt()
  private fun allowed(app: String?) = app != null && !paused && (app in onApps || (app !in offApps && app in defaults) || (practice && app == packageName))
  private val night get() = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
  private fun colour(id: Int, fallback: Int) = if (android.os.Build.VERSION.SDK_INT >= 31) getColor(id) else fallback

  override fun onServiceConnected() {
    super.onServiceConnected()
    paused = prefs.getBoolean("paused", false)
    practice = prefs.getBoolean("practice", false)
    onApps = prefs.getStringSet("on", emptySet()).orEmpty()
    offApps = prefs.getStringSet("off", emptySet()).orEmpty()
    defaults = prefs.getStringSet("defaults", DEFAULT_ON).orEmpty()
    wm = getSystemService(WindowManager::class.java)
    bubble = TextView(this).apply {
      gravity = Gravity.CENTER
      textSize = 14f
      maxWidth = px(260)
      contentDescription = "Ownvoice"
      setOnClickListener {
        val shouldRead = resting || text.toString() == TIP
        restoreBubble.run()
        if (shouldRead) readScreen()
      }
    }
    params = WindowManager.LayoutParams(px(52), px(52), WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT).apply { gravity = Gravity.END or Gravity.CENTER_VERTICAL; x = px(8) }
    wm.addView(bubble, params)
    instance = this
    restoreBubble.run()
    updateBubble()
    onServiceChange?.invoke("on")
    if (prefs.getBoolean("comeBack", false)) {
      prefs.edit().remove("comeBack").apply()
      packageManager.getLaunchIntentForPackage(packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)?.let { startActivity(it) }
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent) {
    if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || event.eventType == AccessibilityEvent.TYPE_WINDOWS_CHANGED) updateBubble()
  }
  override fun onInterrupt() {}
  override fun onConfigurationChanged(newConfig: Configuration) { super.onConfigurationChanged(newConfig); if (::bubble.isInitialized && resting) restoreBubble.run() }
  override fun onDestroy() {
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
    if (!::bubble.isInitialized) return
    val show = !panelIsOpen && allowed(currentApp())
    bubble.visibility = if (show) View.VISIBLE else View.GONE
    if (show && !prefs.getBoolean("tipShown", false)) {
      prefs.edit().putBoolean("tipShown", true).apply()
      say(TIP, 6000)
    }
  }

  fun setRules(pausedNow: Boolean, on: Set<String>, off: Set<String>, defaultApps: Set<String>) {
    paused = pausedNow; onApps = on; offApps = off; defaults = defaultApps
    if (capture != null && !allowed(capture?.app)) forget()
    prefs.edit().putBoolean("paused", pausedNow).putStringSet("on", on).putStringSet("off", off).putStringSet("defaults", defaultApps).apply()
    updateBubble()
  }

  private fun currentApp() = appRoot()?.packageName?.toString()
  private fun appRoot(): AccessibilityNodeInfo? = windows.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_APPLICATION && it.isActive }?.root
    ?: windows.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }?.root

  fun readScreen() {
    val app = currentApp() ?: return updateBubble()
    if (!allowed(app)) return updateBubble()
    val field = focusedField()
    val lines = mutableListOf<String>(); val written = mutableListOf<String>()
    (field?.window?.root ?: appRoot())?.let { visibleText(it, field, lines, written) }
    val typed = field?.takeUnless { it.isShowingHintText }?.text?.toString().orEmpty()
    val label = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString() }.getOrDefault(app)
    val reading = Capture(lines.joinToString("\n"), written.joinToString("\n"), typed, app, label, System.currentTimeMillis(), field)
    synchronized(facts) { facts += TapFact(reading.at, app, label, lines.isNotEmpty(), typed.isNotEmpty(), typed.isEmpty() && written.isNotEmpty()) }
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
  private fun visibleText(root: AccessibilityNodeInfo, skip: AccessibilityNodeInfo?, lines: MutableList<String>, written: MutableList<String>) {
    fun walk(node: AccessibilityNodeInfo) {
      if (node == skip || !node.isVisibleToUser) return
      (node.text ?: node.contentDescription)?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { if (lines.lastOrNull() != it) lines += it; if (node.text != null && !node.isEditable) written += it }
      for (i in 0 until node.childCount) node.getChild(i)?.let(::walk)
    }
    walk(root)
  }

  fun captured() = capture?.takeIf { allowed(it.app) }
  fun forget() { capture = null }
  fun drainFacts(): List<TapFact> = synchronized(facts) { facts.toList().also { facts.clear() } }

  fun insert(text: String, done: (Boolean, Boolean) -> Unit) {
    if (inserting) return done(false, false)
    inserting = true
    val field = captured()?.input ?: return finishInsert(text, false, false, done)
    val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text) }
    fun attempt(left: Int) {
      field.refresh()
      if (field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
        fun verify(left: Int) {
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
    onInserted?.invoke(ok, newlinesLost)
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
    bubble.setPadding(px(18), px(10), px(18), px(10)); params.width = WindowManager.LayoutParams.WRAP_CONTENT; params.height = WindowManager.LayoutParams.WRAP_CONTENT
    wm.updateViewLayout(bubble, params); notes.postDelayed(restoreBubble, forMs)
  }
  private val restoreBubble = Runnable {
    if (!::bubble.isInitialized) return@Runnable
    notes.removeCallbacksAndMessages(null); resting = true
    bubble.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_NONE; bubble.text = ""; bubble.contentDescription = "Ownvoice"
    bubble.background = LayerDrawable(arrayOf(
      GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(colour(if (night) android.R.color.system_accent1_200 else android.R.color.system_accent1_600, 0xffff8a73.toInt())) },
      getDrawable(R.drawable.ic_ownvoice_pen)!!.mutate().apply { setTint(colour(if (night) android.R.color.system_accent1_800 else android.R.color.system_accent1_0, Color.WHITE)) },
    )).apply { setLayerGravity(1, Gravity.CENTER); setLayerSize(1, px(24), px(24)) }
    bubble.setPadding(0, 0, 0, 0); params.width = px(52); params.height = px(52); wm.updateViewLayout(bubble, params)
  }
  fun debugTree(): String {
    val root = appRoot() ?: return "{}"
    if (!allowed(root.packageName?.toString())) return "{}"
    fun walk(node: AccessibilityNodeInfo): org.json.JSONObject {
      val out = org.json.JSONObject().put("text", node.text?.toString() ?: node.contentDescription?.toString() ?: "").put("editable", node.isEditable).put("focused", node.isFocused)
      val children = JSONArray(); for (i in 0 until node.childCount) node.getChild(i)?.let { children.put(walk(it)) }; out.put("children", children)
      return out
    }
    return walk(root).toString()
  }
}
