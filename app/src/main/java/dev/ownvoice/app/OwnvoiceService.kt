package dev.ownvoice.app

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.GradientDrawable
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

/**
 * Shows the Ownvoice bubble over other apps. Reads the screen only when the bubble is tapped,
 * inserts a draft only when Insert is tapped in [DraftActivity], and never sends anything.
 */
class OwnvoiceService : AccessibilityService() {
    companion object {
        const val TAG = "Ownvoice"
        private const val BUBBLE_DP = 52
        @Volatile var instance: OwnvoiceService? = null
        var engine: DraftEngine = Nano

        /** Set while the setup's "Try it" step is in front, so the bubble works on Ownvoice's own practice chat. */
        var practice = false
            set(value) { field = value; instance?.updateBubble() }

        private const val TIP = "Tap for reply ideas, or to polish what you wrote."
    }

    /**
     * What the bubble tap read: the visible text, the part of it written on screen outside fields and
     * button labels, and the field being typed in, if any.
     */
    class Capture(val conversation: String, val written: String, val input: AccessibilityNodeInfo?) {
        val typed: String = input?.takeUnless { it.isShowingHintText }?.text?.toString().orEmpty()
        val mode get() = Judge.mode(typed, written)
    }

    private val main = Handler(Looper.getMainLooper())
    private val notes = Handler(Looper.getMainLooper())
    private lateinit var wm: WindowManager
    private lateinit var bubble: TextView
    private lateinit var bubbleParams: WindowManager.LayoutParams
    private var pending: String? = null
    private var resting = true

    var capture: Capture? = null
        private set

    /** Latest insert outcome, read by the on-device test. */
    var insertVerified: Boolean? = null
        private set

    /** Set while the drafts or rewrite panel shows, so the bubble neither covers a draft nor starts another read. */
    var panelOpen = false
        set(value) { field = value; updateBubble() }

    val bubbleVisible: Boolean
        get() = ::bubble.isInitialized && bubble.visibility == View.VISIBLE

    /** Shows the bubble only over an app switched on in Ownvoice, never while paused or while the panel shows. */
    fun updateBubble() {
        if (!::bubble.isInitialized) return
        val show = !panelOpen && on(currentApp())
        bubble.visibility = if (show) View.VISIBLE else View.GONE
        if (show && Privacy.firstBubble(this)) say(TIP, 6_000)
    }

    private fun on(app: String?) = Privacy.on(this, app) || (practice && app == packageName && !Privacy.paused(this))

    /** Drops whatever the last tap read, for Wipe everything. */
    fun forget() {
        capture = null
    }

    private fun currentApp() = appRoot()?.packageName?.toString()

    override fun onServiceConnected() {
        wm = getSystemService(WindowManager::class.java)
        // A small circle in the phone's own accent colour with a pen; a note on it becomes a dark pill, like a snackbar.
        bubble = TextView(this).apply {
            gravity = Gravity.CENTER
            textSize = 14f
            maxWidth = px(260)
            setOnClickListener { if (resting) readScreen() else restoreBubble.run() }
        }
        val size = (BUBBLE_DP * resources.displayMetrics.density).toInt()
        // Not focusable, so the app underneath keeps its keyboard and focused field.
        bubbleParams = WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).also {
            it.gravity = Gravity.END or Gravity.CENTER_VERTICAL
            it.x = px(8)
        }
        wm.addView(bubble, bubbleParams)
        restoreBubble.run()
        instance = this
        updateBubble()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || event.eventType == AccessibilityEvent.TYPE_WINDOWS_CHANGED) updateBubble()
        if (pending != null) verifyInsert(final = false)
    }

    override fun onInterrupt() {}

    // Redraw the bubble in the new colours when the phone switches between light and dark.
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (::bubble.isInitialized && resting) restoreBubble.run()
    }

    override fun onDestroy() {
        instance = null
        main.removeCallbacksAndMessages(null)
        notes.removeCallbacksAndMessages(null)
        if (::bubble.isInitialized) wm.removeView(bubble)
        super.onDestroy()
    }

    /**
     * The bubble tap: read the screen, then open the drafts panel. The panel is an activity because
     * ML Kit GenAI refuses inference (BACKGROUND_USE_BLOCKED) unless Ownvoice is the app in front,
     * and an accessibility overlay over another app does not count.
     */
    fun readScreen() {
        // Nothing is read in an app that is switched off, or while paused.
        val app = currentApp()
        if (app == null || !on(app)) return updateBubble()
        val field = focusedField()
        val root = field?.window?.root ?: appRoot()
        val lines = mutableListOf<String>()
        val written = mutableListOf<String>()
        root?.let { visibleText(it, field, lines, written) }
        val read = Capture(lines.joinToString("\n"), written.joinToString("\n"), field)
        val label = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString() }.getOrDefault(app)
        Privacy.record(this, Privacy.Read(System.currentTimeMillis(), app, label, Privacy.summary(read.mode, read.conversation, read.typed)))
        if (lines.isEmpty() && field == null) {
            return say("No text on this screen.")
        }
        capture = read
        insertVerified = null
        startActivity(Intent(this, DraftActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
    }

    /**
     * Replaces the captured field's text with [text] and checks that it landed unchanged. Called as the
     * panel closes: apps such as Chrome refuse the text until their window is back in front, so retry briefly.
     */
    fun insert(text: String) {
        val field = capture?.input ?: return finishInsert(null)
        main.removeCallbacksAndMessages(null) // drop checks left from an earlier insert
        pending = text
        insertVerified = null
        val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text) }
        fun attempt(triesLeft: Int) {
            field.refresh()
            when {
                // Some apps fire no event for the change; check once more after a pause.
                field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args) ->
                    main.postDelayed({ if (pending == text) verifyInsert(final = true) }, 1500)
                triesLeft > 0 -> main.postDelayed({ attempt(triesLeft - 1) }, 150)
                else -> {
                    Log.w(TAG, "the app refused the text")
                    finishInsert(null)
                }
            }
        }
        attempt(triesLeft = 13)
    }

    private fun verifyInsert(final: Boolean) {
        val want = pending ?: return
        val field = capture?.input ?: return
        if (!field.refresh()) {
            if (final) finishInsert(null)
            return
        }
        val got = field.text?.toString()
        when {
            got == want -> {
                Log.i(TAG, "insert verified (${want.count { it == '\n' }} newlines)")
                finishInsert("Inserted. Send it yourself.")
            }
            // Chrome reports a contenteditable's text without its line breaks, so they can't be read back.
            '\n' in want && got == want.replace("\n", "") -> {
                Log.i(TAG, "insert verified except newlines, which this field doesn't expose")
                finishInsert("Inserted. Check it looks right before sending.")
            }
            final -> {
                Log.w(TAG, "insert mismatch: wanted ${want.length} chars (${want.count { it == '\n' }} newlines), field has ${got?.length} (${got?.count { it == '\n' }} newlines)")
                finishInsert(null)
            }
        }
    }

    /** Ends an insert with [message] on success, or copies the draft when it didn't land (null). */
    private fun finishInsert(message: String?) {
        val text = pending
        pending = null
        insertVerified = message != null
        if (message != null) return say(message)
        if (text != null) {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", text))
        }
        say("Couldn't insert. Copied, paste it.")
    }

    /**
     * Shows a short result on the bubble itself for a few seconds. Toasts don't work here: Android
     * drops a background app's toasts when its notifications are off, which is the default.
     */
    fun say(message: String, forMs: Long = 4_000) {
        if (!::bubble.isInitialized) return
        Log.i(TAG, "bubble: $message")
        notes.removeCallbacksAndMessages(null)
        resting = false
        bubble.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        bubble.text = message
        bubble.contentDescription = message
        // Like a snackbar: the inverse of the phone's light or dark surface.
        bubble.setTextColor(system(if (night) android.R.color.system_neutral1_800 else android.R.color.system_neutral1_50, if (night) 0xFF303030.toInt() else Color.WHITE))
        bubble.background = GradientDrawable().apply {
            cornerRadius = 24 * dp
            setColor(system(if (night) android.R.color.system_neutral1_100 else android.R.color.system_neutral1_800, if (night) 0xFFE6E1E5.toInt() else 0xFF313033.toInt()))
        }
        bubble.setPadding(px(18), px(10), px(18), px(10))
        bubbleParams.width = WindowManager.LayoutParams.WRAP_CONTENT
        bubbleParams.height = WindowManager.LayoutParams.WRAP_CONTENT
        wm.updateViewLayout(bubble, bubbleParams)
        notes.postDelayed(restoreBubble, forMs)
    }

    private val night get() = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES

    /** A colour of the phone's own palette (Android 12 and later), or [fallback] before that. */
    private fun system(id: Int, fallback: Int) = if (android.os.Build.VERSION.SDK_INT >= 31) getColor(id) else fallback

    /** Latest text on the bubble, read by the on-device test. */
    val bubbleText: CharSequence get() = bubble.text

    private val restoreBubble = Runnable {
        notes.removeCallbacksAndMessages(null)
        resting = true
        bubble.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_NONE
        bubble.text = ""
        bubble.contentDescription = "Ownvoice"
        bubble.background = LayerDrawable(arrayOf(
            // The phone's primary colour, as its own buttons use it in light and dark mode.
            GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(system(if (night) android.R.color.system_accent1_200 else android.R.color.system_accent1_600, 0xFF6750A4.toInt())) },
            getDrawable(R.drawable.ic_pen)!!.mutate().apply { setTint(system(if (night) android.R.color.system_accent1_800 else android.R.color.system_accent1_0, Color.WHITE)) },
        )).apply {
            setLayerGravity(1, Gravity.CENTER)
            setLayerSize(1, px(24), px(24))
        }
        bubble.setPadding(0, 0, 0, 0)
        bubbleParams.width = px(BUBBLE_DP)
        bubbleParams.height = px(BUBBLE_DP)
        wm.updateViewLayout(bubble, bubbleParams)
    }

    /**
     * The field being typed in. A WebView answers input focus with itself until something walks its
     * virtual tree (seen with WebView 133), so look inside it when that happens.
     */
    fun focusedField(): AccessibilityNodeInfo? {
        val focus = findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return null
        if (focus.isEditable) return focus
        fun find(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
            if (node.isFocused && node.isEditable) return node
            for (i in 0 until node.childCount) node.getChild(i)?.let(::find)?.let { return it }
            return null
        }
        return find(focus)
    }

    private fun appRoot(): AccessibilityNodeInfo? =
        windows.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_APPLICATION && it.isActive }?.root
            ?: windows.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }?.root

    /**
     * Generic tree walk: visible text in screen order into [lines], skipping the field being typed in.
     * [written] gets only text shown on screen, not descriptions of buttons or text in other fields.
     */
    private fun visibleText(root: AccessibilityNodeInfo, skip: AccessibilityNodeInfo?, lines: MutableList<String>, written: MutableList<String>) {
        fun walk(node: AccessibilityNodeInfo) {
            if (node == skip || !node.isVisibleToUser) return
            (node.text ?: node.contentDescription)?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let {
                if (lines.lastOrNull() != it) lines += it
                if (node.text != null && !node.isEditable) written += it
            }
            for (i in 0 until node.childCount) node.getChild(i)?.let(::walk)
        }
        walk(root)
    }
}
