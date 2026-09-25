package dev.ownvoice.app

import android.app.Activity
import android.os.Bundle
import android.text.format.DateFormat
import android.text.format.DateUtils
import android.widget.LinearLayout

/** What Ownvoice read: one line per bubble tap, kept on this phone for 30 days, and one tap to wipe it all. */
class ReadsActivity : Activity() {
    private lateinit var list: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val page = page("What Ownvoice read",
            "Each time you tap the bubble, Ownvoice notes the app, the time and what it helped with. Never any of your text. " +
                "This list stays on this phone and each entry is deleted after 30 days.")
        page.add(actions(ghost("Wipe everything") { Privacy.wipe(this); show() }), bottom = 4f)
        page.add(text("Wipe everything also deletes Your voice.", Type.BODY).apply { setPadding(px(8), 0, px(8), 0) }, bottom = 14f)
        list = page.add(group())
    }

    override fun onResume() {
        super.onResume()
        show()
    }

    private fun show() {
        list.removeAllViews()
        val reads = Privacy.reads(this)
        if (reads.isEmpty()) list.row(item(null, "Nothing read in the last 30 days."))
        reads.forEach { read ->
            // "Suggested replies. Read the chat on screen." becomes a title and a subtitle.
            val summary = Privacy.plain(read.summary)
            val did = summary.substringBefore(". ")
            val day = if (DateUtils.isToday(read.time)) "Today" else DateFormat.getMediumDateFormat(this).format(read.time)
            val time = "$day, ${DateFormat.getTimeFormat(this).format(read.time)}"
            list.row(item(null, "$did in ${read.label}", "${summary.substringAfter(". ", "").removeSuffix(".")} · $time".removePrefix(" · ")))
        }
    }
}
