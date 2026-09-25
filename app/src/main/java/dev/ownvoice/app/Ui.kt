package dev.ownvoice.app

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.SpannableString
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextPaint
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.LeadingMarginSpan
import android.text.style.MetricAffectingSpan
import android.text.style.ReplacementSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.material.button.MaterialButton
import com.google.android.material.color.MaterialColors
import com.google.android.material.R as M

// Plain Material 3: every colour comes from the phone's theme (dynamic colour from Android 12), and all
// text uses the phone's own font through the Material type scale.

val Context.dp get() = resources.displayMetrics.density
fun Context.px(v: Number) = (v.toFloat() * dp).toInt()

private fun Context.attr(id: Int) = MaterialColors.getColor(this, id, Color.GRAY)

val Context.onSurface get() = attr(M.attr.colorOnSurface)
val Context.muted get() = attr(M.attr.colorOnSurfaceVariant)
val Context.primary get() = attr(androidx.appcompat.R.attr.colorPrimary)
val Context.onPrimary get() = attr(M.attr.colorOnPrimary)
val Context.primaryContainer get() = attr(M.attr.colorPrimaryContainer)
val Context.onPrimaryContainer get() = attr(M.attr.colorOnPrimaryContainer)
val Context.surface get() = attr(M.attr.colorSurface)
val Context.containerLow get() = attr(M.attr.colorSurfaceContainerLow)
val Context.container get() = attr(M.attr.colorSurfaceContainer)
val Context.containerHighest get() = attr(M.attr.colorSurfaceContainerHighest)
val Context.outline get() = attr(M.attr.colorOutlineVariant)

/** The soft highlight on marked phrases. */
val Context.highlight get() = attr(M.attr.colorTertiaryContainer)

/** "Worth a look": amber, shifted towards the phone's own colours so it sits with them. */
val Context.attention: Int
    get() {
        val night = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        return MaterialColors.harmonizeWithPrimary(this, if (night) 0xFFFFB95C.toInt() else 0xFF8F5300.toInt())
    }

/** The Material 3 type scale, in the phone's font. */
enum class Type(val style: Int) {
    HEADLINE_LARGE(M.style.TextAppearance_Material3_HeadlineLarge),
    HEADLINE(M.style.TextAppearance_Material3_HeadlineMedium),
    HEADLINE_SMALL(M.style.TextAppearance_Material3_HeadlineSmall),
    TITLE(M.style.TextAppearance_Material3_TitleMedium),
    BODY_LARGE(M.style.TextAppearance_Material3_BodyLarge),
    BODY(M.style.TextAppearance_Material3_BodyMedium),
    LABEL(M.style.TextAppearance_Material3_LabelLarge),
}

fun Context.text(value: CharSequence = "", type: Type = Type.BODY_LARGE, color: Int? = null) = TextView(this).apply {
    setTextAppearance(type.style)
    setTextColor(color ?: if (type == Type.BODY) muted else onSurface)
    text = value
}

/** A short label over a card, like "Yours" or "Shorter". */
fun Context.label(value: String) = text(value, Type.LABEL, primary)

/** A draft's own words: a little larger than the rest, as they are what matters. */
fun Context.words(value: CharSequence) = text(value, Type.BODY_LARGE).apply {
    textSize = 18f
    setLineSpacing(0f, 1.15f)
}

val medium: Typeface by lazy { Typeface.create("sans-serif-medium", Typeface.NORMAL) }

fun Context.rounded(color: Int, radius: Float, stroke: Int? = null) = GradientDrawable().apply {
    cornerRadius = radius * dp
    setColor(color)
    if (stroke != null) setStroke(px(1), stroke)
}

/** A Material card: outlined for a draft, filled for the user's own text ([filled]). */
fun Context.card(filled: Boolean = false) = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(px(16), px(14), px(16), px(10))
    background = if (filled) rounded(containerHighest, 16f) else rounded(surface, 16f, outline)
}

fun params(width: Int = -1, height: Int = -2, top: Int = 0, bottom: Int = 0) = LinearLayout.LayoutParams(width, height).apply { topMargin = top; bottomMargin = bottom }

fun <T : View> LinearLayout.add(view: T, top: Float = 0f, bottom: Float = 0f, width: Int = -1): T =
    view.also { addView(it, params(width, -2, context.px(top), context.px(bottom))) }

/** The one filled button on a card. */
fun Context.filled(label: String, click: () -> Unit) = MaterialButton(this).apply {
    text = label
    setOnClickListener { click() }
}

/** A text button next to [filled]. */
fun Context.ghost(label: String, click: () -> Unit) = MaterialButton(this, null, androidx.appcompat.R.attr.borderlessButtonStyle).apply {
    text = label
    setOnClickListener { click() }
}

/** A row of buttons; anything added with [push] sits at the far end. */
fun Context.actions(vararg views: View) = LinearLayout(this).apply {
    gravity = Gravity.CENTER_VERTICAL
    views.forEach { addView(it, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = px(8) }) }
}

fun LinearLayout.push(view: View) {
    addView(View(context), LinearLayout.LayoutParams(0, 1, 1f))
    addView(view)
}

fun Context.icon(res: Int, tint: Int = muted, size: Int = 24) = ImageView(this).apply {
    setImageResource(res)
    imageTintList = ColorStateList.valueOf(tint)
    layoutParams = LinearLayout.LayoutParams(px(size), px(size))
}

/** A round icon on a coloured circle, for the setup screens. */
fun Context.badge(res: Int, bg: Int, tint: Int, size: Int = 96) = FrameLayout(this).apply {
    background = rounded(bg, 99f)
    addView(icon(res, tint, size * 2 / 5), FrameLayout.LayoutParams(px(size * 2 / 5), px(size * 2 / 5), Gravity.CENTER))
    layoutParams = LinearLayout.LayoutParams(px(size), px(size)).apply { gravity = Gravity.CENTER_HORIZONTAL }
}

/** A rounded group of list rows, split by thin gaps as in the phone's own settings. */
fun Context.group() = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    background = rounded(container, 20f)
    clipToOutline = true
}

fun LinearLayout.row(view: View) {
    if (childCount > 0) addView(View(context).apply { setBackgroundColor(context.surface) }, LinearLayout.LayoutParams(-1, context.px(2)))
    addView(view)
}

/** A list row: [lead] (an icon or app icon), a title with a plain subtitle, and [end] (a chevron or a switch). */
fun Context.item(lead: View?, title: String, subtitle: String? = null, end: View? = null, click: (() -> Unit)? = null) = LinearLayout(this).apply {
    gravity = Gravity.CENTER_VERTICAL
    setPadding(px(16), px(12), px(16), px(12))
    minimumHeight = px(64)
    lead?.let { addView(it); (it.layoutParams as LinearLayout.LayoutParams).marginEnd = px(16) }
    addView(LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        addView(text(title).apply { tag = TITLE })
        if (subtitle != null) addView(text(subtitle, Type.BODY).apply { tag = SUBTITLE })
    }, LinearLayout.LayoutParams(0, -2, 1f))
    end?.let { addView(it, LinearLayout.LayoutParams(-2, -2).apply { marginStart = px(12) }) }
    if (click != null) {
        foreground = ripple()
        setOnClickListener { click() }
    }
}

private fun Context.ripple() = TypedValue().let {
    theme.resolveAttribute(android.R.attr.selectableItemBackground, it, true)
    getDrawable(it.resourceId)
}

const val TITLE = "title"
const val SUBTITLE = "subtitle"

/** Changes an [item]'s title or subtitle. */
fun View.title(value: String) {
    findViewWithTag<TextView>(TITLE)?.text = value
}

fun View.subtitle(value: String) {
    findViewWithTag<TextView>(SUBTITLE)?.text = value
}

fun Context.chevron() = icon(R.drawable.ic_chev, muted, 20)

/** A full-screen page: returns the column to fill, under a large [title] and a plain [subtitle]. */
fun Activity.page(title: String, subtitle: String? = null, type: Type = Type.HEADLINE): LinearLayout {
    val column = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(px(16), px(24), px(16), px(32))
    }
    column.add(text(title, type).apply { setPadding(px(8), 0, px(8), 0) })
    if (subtitle != null) column.add(text(subtitle, Type.BODY_LARGE, muted).apply { setPadding(px(8), 0, px(8), 0) }, top = 8f, bottom = 20f)
    setContentView(FrameLayout(this).apply {
        fitsSystemWindows = true
        addView(ScrollView(context).apply { addView(column) })
    })
    return column
}

/**
 * A Material bottom sheet over a dimmed, see-through screen; tapping outside closes it. [cover] lays a
 * second sheet over it (the "Why?" note), and [uncover] takes it away again.
 */
class Sheet(private val activity: Activity) {
    val title = activity.text("", Type.HEADLINE_SMALL)
    val note = activity.text("", Type.BODY)
    val body = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
    private val main = panel(title, note, body)
    private var over: View? = null
    // Back closes the "Why?" note first: here on Android 13 and later, and in DraftActivity.onBackPressed elsewhere.
    private val back: Any? = if (android.os.Build.VERSION.SDK_INT >= 33) android.window.OnBackInvokedCallback { uncover() } else null
    private val root = FrameLayout(activity).apply {
        setBackgroundColor(0x66000000)
        fitsSystemWindows = true
        setOnClickListener { activity.finish() }
        addView(main, sheetParams())
    }

    // A tall sheet still leaves a strip of the app showing at the top, so it reads as a sheet.
    private fun sheetParams() = FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply { topMargin = activity.px(56) }

    init {
        activity.setContentView(root)
        main.translationY = activity.px(600).toFloat()
        main.animate().translationY(0f).setDuration(260).setInterpolator(android.view.animation.DecelerateInterpolator(2f)).start()
    }

    private fun panel(title: TextView, note: TextView?, content: View, close: () -> Unit = { activity.finish() }) = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        isClickable = true
        background = GradientDrawable().apply {
            val r = 28 * activity.dp
            cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
            setColor(activity.containerLow)
        }
        setPadding(0, activity.px(12), 0, activity.px(8))
        addView(View(context).apply { background = activity.rounded(activity.muted, 2f); alpha = 0.4f },
            LinearLayout.LayoutParams(activity.px(32), activity.px(4)).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = activity.px(8) })
        addView(LinearLayout(context).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(activity.px(24), 0, activity.px(12), 0)
            addView(title, LinearLayout.LayoutParams(0, -2, 1f))
            addView(activity.icon(R.drawable.ic_close, activity.muted).apply {
                contentDescription = "Close"
                setPadding(activity.px(12), activity.px(12), activity.px(12), activity.px(12))
                TypedValue().also { activity.theme.resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, it, true) }
                    .let { background = activity.getDrawable(it.resourceId) }
                setOnClickListener { close() }
            }, LinearLayout.LayoutParams(activity.px(48), activity.px(48)))
        })
        if (note != null) addView(note.apply { setPadding(activity.px(24), activity.px(2), activity.px(24), activity.px(14)) })
        addView(ScrollView(context).apply {
            isVerticalScrollBarEnabled = false
            addView(content.apply { setPadding(activity.px(16), 0, activity.px(16), activity.px(12)) })
        })
    }

    fun cover(title: String, content: View) {
        uncover()
        val panel = panel(activity.text(title, Type.HEADLINE_SMALL), null, content) { uncover() }
        over = panel
        main.visibility = View.INVISIBLE
        root.addView(panel, sheetParams())
        if (android.os.Build.VERSION.SDK_INT >= 33) activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(
            android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, back as android.window.OnBackInvokedCallback)
    }

    /** Takes the covering sheet away; false when there was none. */
    fun uncover(): Boolean {
        val panel = over ?: return false
        root.removeView(panel)
        over = null
        main.visibility = View.VISIBLE
        if (android.os.Build.VERSION.SDK_INT >= 33) activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(back as android.window.OnBackInvokedCallback)
        return true
    }
}

/** Soft lines that pulse while a draft is being written. */
fun Context.placeholder() = card().apply {
    setPadding(px(16), px(16), px(16), px(16))
    listOf(0.92f, 0.7f, 0.45f).forEachIndexed { i, w ->
        addView(FrameLayout(context).apply {
            addView(View(context).apply { background = rounded(containerHighest, 6f) },
                FrameLayout.LayoutParams((resources.displayMetrics.widthPixels * 0.8f * w).toInt(), px(14)))
        }, params(top = if (i == 0) 0 else px(10)))
    }
    ObjectAnimator.ofFloat(this, View.ALPHA, 1f, 0.45f).apply {
        duration = 700
        repeatMode = ValueAnimator.REVERSE
        repeatCount = ValueAnimator.INFINITE
        start()
    }
}

/** [text] with each marked phrase softly highlighted. */
fun Context.highlight(text: String, hits: List<Slop.Hit>) = SpannableString(text).apply {
    hits.forEach { setSpan(BackgroundColorSpan(highlight), it.start, it.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
}

fun String.lowerFirst() = replaceFirstChar { it.lowercase() }

/** The line under a draft: "Checking…" until [v] comes, then a dot and one plain sentence. */
fun TextView.showVerdict(v: Judge.Verdict?) {
    if (v == null) return run { text = "Checking…" }
    val indent = context.px(22)
    text = SpannableStringBuilder("•").apply {
        setSpan(DotSpan(if (v.good) context.primary else context.attention, 4 * context.dp, indent), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        append(v.lead)
        setSpan(ForegroundColorSpan(context.onSurface), 1, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        setSpan(FontSpan(medium), 1, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        append(v.rest)
        setSpan(LeadingMarginSpan.Standard(0, indent), 0, length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    }
}

/** The verdict's dot, drawn on the first line so it sits with the words, not halfway down a wrapped line. */
class DotSpan(private val color: Int, private val radius: Float, private val width: Int) : ReplacementSpan() {
    override fun getSize(paint: Paint, text: CharSequence?, start: Int, end: Int, fm: Paint.FontMetricsInt?) = width

    override fun draw(canvas: Canvas, text: CharSequence?, start: Int, end: Int, x: Float, top: Int, y: Int, bottom: Int, paint: Paint) {
        val ink = paint.color
        paint.color = color
        canvas.drawCircle(x + radius, y + (paint.ascent() + paint.descent()) / 2, radius, paint)
        paint.color = ink
    }
}

/** Sets a typeface on part of a text (TypefaceSpan takes a Typeface only from API 28). */
class FontSpan(private val font: Typeface) : MetricAffectingSpan() {
    override fun updateDrawState(paint: TextPaint) { paint.typeface = font }
    override fun updateMeasureState(paint: TextPaint) { paint.typeface = font }
}

fun Context.verdictLine() = text("Checking…", Type.BODY)

/** A rewrite's meaning check: "Same meaning" with a tick, or "Check this: …" in amber. Hidden when it couldn't be checked. */
fun TextView.showMeaning(m: Judge.Check?, same: String = "Same meaning") {
    visibility = if (m == null) View.GONE else View.VISIBLE
    if (m == null) return
    val color = if (m.ok) context.primary else context.attention
    text = if (m.ok) same else "Check this: " + m.reason.lowerFirst()
    setTextColor(color)
    setCompoundDrawablesRelative(context.getDrawable(if (m.ok) R.drawable.ic_check else R.drawable.ic_warn)!!.mutate().apply {
        setTint(color)
        setBounds(0, 0, context.px(18), context.px(18))
    }, null, null, null)
    compoundDrawablePadding = context.px(10)
}

/** One line of a "Why?" note: a tick or a gentle warning, the check in bold when it needs a look, and why. */
fun Context.reason(ok: Boolean, name: String, detail: String? = null) = LinearLayout(this).apply {
    setPadding(0, px(12), 0, px(12))
    addView(icon(if (ok) R.drawable.ic_check else R.drawable.ic_warn, if (ok) primary else attention, 20).apply {
        (layoutParams as LinearLayout.LayoutParams).apply { marginEnd = px(14); topMargin = px(2) }
    })
    addView(text(SpannableStringBuilder(name).apply {
        if (!ok) setSpan(FontSpan(medium), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (!detail.isNullOrBlank()) {
            append('\n')
            val start = length
            append(detail)
            setSpan(ForegroundColorSpan(muted), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }), LinearLayout.LayoutParams(0, -2, 1f))
}

/** A card of [reason] rows split by fine lines. */
fun Context.reasons(rows: List<View>) = card().apply {
    setPadding(px(16), px(2), px(16), px(2))
    rows.forEachIndexed { i, v ->
        if (i > 0) addView(View(context).apply { setBackgroundColor(outline) }, LinearLayout.LayoutParams(-1, px(1)))
        addView(v)
    }
}
