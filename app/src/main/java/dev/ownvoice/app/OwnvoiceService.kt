package dev.ownvoice.app

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
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

    var capture: Capture? = null
        private set

    /** Latest insert outcome, read by the on-device test. */
    var insertVerified: Boolean? = null
        private set

    /** Hidden while the drafts panel shows, so it neither covers a draft nor starts another read. */
    var bubbleVisible: Boolean
        get() = ::bubble.isInitialized && bubble.visibility == View.VISIBLE
        set(value) { if (::bubble.isInitialized) bubble.visibility = if (value) View.VISIBLE else View.GONE }

    override fun onServiceConnected() {
        wm = getSystemService(WindowManager::class.java)
        bubble = TextView(this).apply {
            text = "OV"
            textSize = 16f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply { cornerRadius = BUBBLE_DP / 2 * resources.displayMetrics.density; setColor(0xFF2E5BFF.toInt()) }
            setOnClickListener { if (text == "OV") readScreen() else restoreBubble.run() }
        }
        val size = (BUBBLE_DP * resources.displayMetrics.density).toInt()
        // Not focusable, so the app underneath keeps its keyboard and focused field.
        bubbleParams = WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).also { it.gravity = Gravity.END or Gravity.CENTER_VERTICAL }
        wm.addView(bubble, bubbleParams)
        restoreBubble.run()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (pending != null) verifyInsert(final = false)
    }

    override fun onInterrupt() {}

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
        val field = focusedField()
        val root = field?.window?.root ?: appRoot()
        val lines = mutableListOf<String>()
        val written = mutableListOf<String>()
        root?.let { visibleText(it, field, lines, written) }
        if (lines.isEmpty() && field == null) {
            return say("No text on this screen.")
        }
        capture = Capture(lines.joinToString("\n"), written.joinToString("\n"), field)
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
                finishInsert("Inserted. Check line breaks.")
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
    fun say(message: String) {
        if (!::bubble.isInitialized) return
        Log.i(TAG, "bubble: $message")
        notes.removeCallbacksAndMessages(null)
        bubble.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        bubble.text = message
        bubble.contentDescription = message
        val pad = (16 * resources.displayMetrics.density).toInt()
        bubble.setPadding(pad, 0, pad, 0)
        bubbleParams.width = WindowManager.LayoutParams.WRAP_CONTENT
        wm.updateViewLayout(bubble, bubbleParams)
        notes.postDelayed(restoreBubble, 4_000)
    }

    /** Latest text on the bubble, read by the on-device test. */
    val bubbleText: CharSequence get() = bubble.text

    private val restoreBubble = Runnable {
        notes.removeCallbacksAndMessages(null)
        bubble.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_NONE
        bubble.text = "OV"
        bubble.contentDescription = "Ownvoice: draft a reply or improve your text"
        bubble.setPadding(0, 0, 0, 0)
        bubbleParams.width = (BUBBLE_DP * resources.displayMetrics.density).toInt()
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
