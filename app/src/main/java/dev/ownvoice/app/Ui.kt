package dev.ownvoice.app

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.text.SpannableString
import android.text.TextUtils
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

val Activity.dp get() = resources.displayMetrics.density

/** A white sheet at the bottom of a dimmed, see-through screen; tapping outside closes it. Returns the scrolling body. */
fun Activity.sheet(status: TextView): LinearLayout {
    val body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val panel = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding((16 * dp).toInt(), (12 * dp).toInt(), (16 * dp).toInt(), (12 * dp).toInt())
        background = GradientDrawable().apply { cornerRadius = 16 * dp; setColor(Color.WHITE) }
        isClickable = true
        addView(LinearLayout(context).apply {
            gravity = Gravity.CENTER_VERTICAL
            addView(TextView(context).apply { text = "Ownvoice"; textSize = 18f; setTextColor(Color.BLACK) }, LinearLayout.LayoutParams(0, -2, 1f))
            addView(Button(context).apply { text = "Close"; setOnClickListener { finish() } })
        })
        addView(status.apply { textSize = 14f; setTextColor(0xFF444444.toInt()) })
        addView(ScrollView(context).apply { addView(body) })
    }
    setContentView(FrameLayout(this).apply {
        setBackgroundColor(0x66000000)
        fitsSystemWindows = true
        setOnClickListener { finish() }
        addView(panel, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
    })
    return body
}

/** [text] with each slop hit highlighted. */
fun highlight(text: String, hits: List<Slop.Hit>) = SpannableString(text).apply {
    hits.forEach { setSpan(BackgroundColorSpan(0x55FFB300), it.start, it.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
}

/**
 * A row of score chips over one shared detail box: tapping a chip shows its reasons there, tapping
 * it again hides them. Each chip's detail is set with its label.
 */
class Chips(activity: Activity) {
    val row = LinearLayout(activity)
    val detail = TextView(activity).apply { textSize = 13f; setTextColor(0xFF333333.toInt()); visibility = View.GONE }
    private val details = mutableMapOf<TextView, CharSequence>()
    private var open: TextView? = null
    private val pad = (8 * activity.dp).toInt()

    fun chip(label: String): TextView = TextView(row.context).apply {
        textSize = 12f
        isSingleLine = true
        setTextColor(Color.BLACK)
        setPadding(pad, pad / 2, pad, pad / 2)
        ellipsize = TextUtils.TruncateAt.END
        background = GradientDrawable().apply { cornerRadius = 3f * pad; setColor(0xFFE8ECF8.toInt()) }
        text = label
        setOnClickListener { toggle(this) }
        row.addView(this, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = pad / 2 })
    }

    fun set(chip: TextView, label: String, detail: CharSequence) {
        chip.text = label
        chip.contentDescription = "$label. Tap for reasons."
        details[chip] = detail
        if (open == chip) this.detail.text = detail
    }

    private fun toggle(chip: TextView) {
        val text = details[chip] ?: return
        open = if (open == chip) null else chip
        detail.text = text
        detail.visibility = if (open == null) View.GONE else View.VISIBLE
    }
}

/** Shows a rewrite's meaning check: green when kept, red when a claim or number may have changed. */
fun TextView.showMeaning(m: Judge.Check) {
    text = (if (m.ok) "✓ Meaning kept: " else "! Meaning may have changed: ") + m.reason
    setTextColor(if (m.ok) 0xFF2E7D32.toInt() else 0xFFC62828.toInt())
}

fun checkLines(checks: List<Judge.Check>) = checks.joinToString("\n") { (if (it.ok) "✓ " else "! ") + it.name + ": " + it.reason }

fun flags(checks: List<Judge.Check>) = when (val n = checks.count { !it.ok }) {
    0 -> "good"
    1 -> "1 flag"
    else -> "$n flags"
}

fun slopDetail(hits: List<Slop.Hit>, text: String, generic: Int?, specific: Int?, score: Int) = buildString {
    append("Slop: ").append(Slop.words(score)).append(" (").append(score).append("/100). How generic and templated it reads, not who wrote it.\n")
    if (hits.isEmpty()) append("No template phrases found.\n")
    hits.forEach { append("• “").append(text.substring(it.start, it.end).trim()).append("”: ").append(it.reason).append('\n') }
    if (generic != null && specific != null) append("Judge: generic $generic/10, specific $specific/10.\n")
    else append("The judge didn't answer, so this is phrase rules only.\n")
    append(Judge.SAME_MODEL)
}
