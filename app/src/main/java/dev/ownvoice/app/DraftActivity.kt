package dev.ownvoice.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** The drafts panel: a translucent sheet over the app the user was in. */
class DraftActivity : Activity() {
    private val scope = MainScope()
    private lateinit var status: TextView
    private lateinit var list: LinearLayout

    /** Drafts on show, read by the on-device test. */
    var drafts: List<String> = emptyList()
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dp = resources.displayMetrics.density
        status = TextView(this).apply { textSize = 14f; setTextColor(0xFF444444.toInt()) }
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((16 * dp).toInt(), (12 * dp).toInt(), (16 * dp).toInt(), (12 * dp).toInt())
            background = GradientDrawable().apply { cornerRadius = 16 * dp; setColor(Color.WHITE) }
            isClickable = true
            addView(TextView(context).apply { text = "Ownvoice"; textSize = 18f; setTextColor(Color.BLACK) })
            addView(status)
            addView(list)
            addView(Button(context).apply { text = "Close"; setOnClickListener { finish() } })
        }
        setContentView(FrameLayout(this).apply {
            setBackgroundColor(0x66000000)
            fitsSystemWindows = true
            setOnClickListener { finish() }
            addView(panel, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        })
        draft()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun draft() {
        val capture = OwnvoiceService.instance?.capture ?: return finish()
        status.text = "Reading done."
        scope.launch {
            val started = SystemClock.elapsedRealtime()
            try {
                drafts = OwnvoiceService.engine.drafts(capture.conversation, capture.typed) { status.text = it }
                Log.i(OwnvoiceService.TAG, "drafts=${drafts.size} in ${SystemClock.elapsedRealtime() - started} ms")
                show(capture.input != null)
            } catch (e: PlainError) {
                Log.w(OwnvoiceService.TAG, "draft failed after ${SystemClock.elapsedRealtime() - started} ms: ${e.message}")
                status.text = e.message
            }
        }
    }

    private fun show(canInsert: Boolean) {
        status.text = when {
            drafts.isEmpty() -> "The model returned no drafts. Try again."
            canInsert -> "Insert one, then send it yourself."
            else -> "No text field was focused. Copy one."
        }
        for (draft in drafts) {
            list.addView(TextView(this).apply {
                text = draft
                textSize = 16f
                setTextColor(Color.BLACK)
                setPadding(0, (10 * resources.displayMetrics.density).toInt(), 0, 0)
            })
            list.addView(LinearLayout(this).apply {
                addView(Button(context).apply { text = "Insert"; isEnabled = canInsert; setOnClickListener { insert(draft) } })
                addView(Button(context).apply { text = "Copy"; setOnClickListener { copy(draft) } })
            })
        }
    }

    private fun insert(draft: String) {
        val service = OwnvoiceService.instance ?: return run { status.text = "Ownvoice is off. Use Copy instead." }
        finish()
        service.insert(draft)
    }

    private fun copy(draft: String) {
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", draft))
        Toast.makeText(this, "Copied.", Toast.LENGTH_SHORT).show()
        finish()
    }
}
