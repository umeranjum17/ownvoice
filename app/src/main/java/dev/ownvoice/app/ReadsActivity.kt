package dev.ownvoice.app

import android.app.Activity
import android.os.Bundle
import android.text.format.DateFormat
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** What was read: one line per bubble tap, kept on this phone for 30 days, and one tap to wipe it all. */
class ReadsActivity : Activity() {
    private lateinit var list: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * dp).toInt()
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        setContentView(FrameLayout(this).apply { fitsSystemWindows = true; addView(ScrollView(context).apply { addView(LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            addView(TextView(context).apply { text = "What was read"; textSize = 24f })
            addView(TextView(context).apply {
                textSize = 14f
                text = "Each time you tap the bubble, Ownvoice notes the app, the time, what it did and how many characters it read. " +
                    "Never any of the text. This list stays on this phone and each entry is deleted after 30 days. " +
                    "Wipe everything also deletes Your voice."
            })
            addView(Button(context).apply {
                text = "Wipe everything"
                setOnClickListener { Privacy.wipe(context); show() }
            })
            addView(list)
        }) }) })
    }

    override fun onResume() {
        super.onResume()
        show()
    }

    private fun show() {
        list.removeAllViews()
        val reads = Privacy.reads(this)
        if (reads.isEmpty()) list.addView(TextView(this).apply { textSize = 16f; text = "Nothing read in the last 30 days." })
        reads.forEach { read ->
            list.addView(TextView(this).apply {
                textSize = 14f
                setPadding(0, (12 * dp).toInt(), 0, 0)
                text = "${read.label} · ${DateFormat.getMediumDateFormat(context).format(read.time)} ${DateFormat.getTimeFormat(context).format(read.time)}\n${read.summary}"
            })
        }
    }
}
