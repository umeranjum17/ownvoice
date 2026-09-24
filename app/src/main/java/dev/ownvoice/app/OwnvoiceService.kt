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
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.TextView
import android.widget.Toast

/**
 * Shows the Ownvoice bubble over other apps. Reads the screen only when the bubble is tapped,
 * inserts a draft only when Insert is tapped in [DraftActivity], and never sends anything.
 */
class OwnvoiceService : AccessibilityService() {
    companion object {
        const val TAG = "Ownvoice"
        @Volatile var instance: OwnvoiceService? = null
        var engine: DraftEngine = Nano
    }

    /** What the bubble tap read: the visible text, and the field being typed in, if any. */
    class Capture(val conversation: String, val input: AccessibilityNodeInfo?) {
        val typed: String get() = input?.takeUnless { it.isShowingHintText }?.text?.toString().orEmpty()
    }

    private val main = Handler(Looper.getMainLooper())
    private lateinit var wm: WindowManager
    private lateinit var bubble: TextView
    private var pending: String? = null

    var capture: Capture? = null
        private set

    /** Latest insert outcome, read by the on-device test. */
    var insertVerified: Boolean? = null
        private set

    override fun onServiceConnected() {
        wm = getSystemService(WindowManager::class.java)
        bubble = TextView(this).apply {
            text = "OV"
            textSize = 16f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0xFF2E5BFF.toInt()) }
            contentDescription = "Ownvoice: draft a reply"
            setOnClickListener { readScreen() }
        }
        val size = (52 * resources.displayMetrics.density).toInt()
        // Not focusable, so the app underneath keeps its keyboard and focused field.
        wm.addView(bubble, WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).also { it.gravity = Gravity.END or Gravity.CENTER_VERTICAL })
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (pending != null) verifyInsert(final = false)
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        instance = null
        main.removeCallbacksAndMessages(null)
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
        val conversation = root?.let { visibleText(it, field) }.orEmpty()
        if (conversation.isBlank()) {
            return toast("Ownvoice can't see any text on this screen.")
        }
        capture = Capture(conversation, field)
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
                finishInsert("Inserted. Read it over, then send it yourself.")
            }
            // Chrome reports a contenteditable's text without its line breaks, so they can't be read back.
            '\n' in want && got == want.replace("\n", "") -> {
                Log.i(TAG, "insert verified except newlines, which this field doesn't expose")
                finishInsert("Inserted. Check the line breaks, then send it yourself.")
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
        if (message != null) return toast(message)
        if (text != null) {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", text))
        }
        toast("Couldn't insert the draft exactly here, so it's copied. Check the field, or paste it.")
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()

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

    /** Generic tree walk: visible text in screen order, skipping the field being typed in. */
    private fun visibleText(root: AccessibilityNodeInfo, skip: AccessibilityNodeInfo?): String {
        val lines = mutableListOf<String>()
        fun walk(node: AccessibilityNodeInfo) {
            if (node == skip || !node.isVisibleToUser) return
            (node.text ?: node.contentDescription)?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let {
                if (lines.lastOrNull() != it) lines += it
            }
            for (i in 0 until node.childCount) node.getChild(i)?.let(::walk)
        }
        walk(root)
        return lines.joinToString("\n")
    }
}
