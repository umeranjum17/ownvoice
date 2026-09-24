package dev.ownvoice.app

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.webkit.WebView
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/** A local screen to try Ownvoice on: a fake chat, a native field, and a web textarea and contenteditable. */
class TestScreenActivity : Activity() {
    lateinit var edit: EditText
        private set
    lateinit var web: WebView
        private set

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * resources.displayMetrics.density).toInt()
        edit = EditText(this).apply {
            hint = "Native field"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        }
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            loadDataWithBaseURL(null, PAGE, "text/html", "utf-8", null)
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            addView(TextView(context).apply { text = CHAT; textSize = 16f })
            addView(edit)
            addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        })
    }

    companion object {
        const val CHAT = "Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove."
        const val PAGE = """<!doctype html><meta name="viewport" content="width=device-width">
<p>Web textarea</p><textarea id="ta" rows="4" style="width:100%"></textarea>
<p>Web contenteditable</p><div id="ce" contenteditable="true" style="border:1px solid #888;min-height:4em;white-space:pre-wrap"></div>"""
    }
}
