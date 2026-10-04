package dev.ownvoice.bridge

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.LinearInterpolator
import kotlin.math.min
import kotlin.math.pow

/**
 * The reading moment: each line Ownvoice reads gets a quick highlighter stroke in reading order, then one spark
 * carries them into Dot and the highlights let go together. Drawn in a see-through window that never takes a touch.
 */
class ReadCue(private val context: Context) {
  private val windows = context.getSystemService(WindowManager::class.java)
  // Its own looper, so the cue keeps moving while the main thread is still busy reading the screen.
  private val looper = lazy { HandlerThread("ownvoice-readcue").apply { start() } }
  private val handler by lazy { Handler(looper.value.looper) }
  private var view: LinesView? = null
  private var anim: ValueAnimator? = null
  /** When the current cue started (uptime ms), so the panel can wait out the rest of its opening beat. */
  @Volatile var startedAt = 0L
    private set

  fun play(bubble: Rect?, lines: List<Rect>) {
    startedAt = SystemClock.uptimeMillis()
    handler.post { show(bubble, lines) }
  }

  fun stop() { if (looper.isInitialized()) handler.post(::hide) }

  /** Ends the cue and its thread for good, when the service goes away. */
  fun close() { if (looper.isInitialized()) { handler.post(::hide); looper.value.quitSafely() } }

  private fun show(bubble: Rect?, lines: List<Rect>) {
    hide()
    val v = LinesView(context, bubble, lines)
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      if (Build.VERSION.SDK_INT >= 30) fitInsetsTypes = 0
      if (Build.VERSION.SDK_INT >= 28) layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
    }
    runCatching { windows.addView(v, params) }.onFailure { return }
    view = v
    anim = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = MS
      interpolator = LinearInterpolator()
      addUpdateListener { v.t = it.animatedValue as Float; v.invalidate() }
      addListener(object : AnimatorListenerAdapter() { override fun onAnimationEnd(a: Animator) { if (anim === a) hide() } })
      start()
    }
  }

  private fun hide() {
    val a = anim; anim = null; a?.cancel()
    val v = view; view = null
    if (v != null) runCatching { windows.removeView(v) }
  }

  private class LinesView(context: Context, private val bubble: Rect?, lines: List<Rect>) : View(context) {
    var t = 0f
    private val dp = context.resources.displayMetrics.density
    // Text lines only, in reading order: a box taller than a quarter of the screen is a page or a list, not a line.
    private val boxes = lines.filter { !it.isEmpty && it.height() < context.resources.displayMetrics.heightPixels / 4 }
      .sortedWith(compareBy({ it.top }, { it.left })).takeLast(MAX_LINES)
    // However many lines there are, the last one starts by STAGGER, so the cue keeps its length.
    private val step = if (boxes.size > 1) min(0.05f, STAGGER / (boxes.size - 1)) else 0f
    private val widest = boxes.maxOfOrNull { it.width() }?.toFloat() ?: 1f
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = AMBER }
    private val caret = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = MARK }
    private val spark = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = CORAL }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = CORAL }
    private val box = RectF()

    private fun bubbleX() = bubble?.exactCenterX() ?: (width - 34 * dp)
    private fun bubbleY() = bubble?.exactCenterY() ?: (height / 2f)

    override fun onDraw(c: Canvas) {
      if (boxes.isEmpty()) return
      // All highlights let go together once the spark is home.
      val letGo = 1f - inOut(seg(t, LANDS, LANDS + 0.18f))
      val r = 6 * dp
      boxes.forEachIndexed { i, b ->
        val s = i * step
        // Short lines are read quicker than long ones, which is what makes it look like reading.
        val wipe = out(seg(t, s, s + 0.10f + 0.10f * b.width() / widest))
        if (wipe <= 0f) return@forEachIndexed
        val left = b.left - 4 * dp
        box.set(left, b.top - 2 * dp, left + (b.width() + 8 * dp) * wipe, b.bottom + 2 * dp)
        fill.alpha = (72 * letGo).toInt()
        c.drawRoundRect(box, r, r, fill)
        if (wipe < 1f) c.drawRoundRect(box.right - 2.5f * dp, box.top, box.right, box.bottom, dp, dp, caret)
      }
      // One spark leaves where reading stopped and arcs into Dot.
      val last = boxes.last()
      val fly = seg(t, FLIES, LANDS)
      if (fly > 0f && fly < 1f) {
        val e = inOut(fly)
        val x0 = last.right.toFloat(); val y0 = last.exactCenterY()
        // A quadratic curve whose bend sits above the straight line, so the spark lobs rather than slides.
        val cx = (x0 + bubbleX()) / 2; val cy = min(y0, bubbleY()) - 64 * dp
        val x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * bubbleX()
        val y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * bubbleY()
        c.drawCircle(x, y, (5f - 1.5f * e) * dp, spark)
      }
      // Dot takes it in: one ring that swells and lets go.
      val gulp = seg(t, LANDS, 1f)
      if (gulp > 0f && gulp < 1f) {
        ring.strokeWidth = 3 * dp
        ring.alpha = (210 * (1f - gulp)).toInt()
        c.drawCircle(bubbleX(), bubbleY(), (28 + 14 * out(gulp)) * dp, ring)
      }
    }
  }

  private companion object {
    // Whole cue 1050 ms: the last line starts by 0.22, the spark flies at 0.48 and lands at 0.74.
    const val MS = 1050L
    const val MAX_LINES = 14
    const val STAGGER = 0.22f
    const val FLIES = 0.48f
    const val LANDS = 0.74f
    const val CORAL = 0xFFFF8A73.toInt()
    const val AMBER = 0xFFFFB95C.toInt()
    const val MARK = 0xFFC44A34.toInt()

    // The curves are ours, tuned on the emulator.
    fun out(x: Float) = 1f - (1f - x.coerceIn(0f, 1f)).pow(3)
    fun inOut(x: Float) = x.coerceIn(0f, 1f).let { if (it < .5f) 4 * it * it * it else 1 - (-2 * it + 2).pow(3) / 2 }
    fun seg(t: Float, a: Float, b: Float) = ((t - a) / (b - a)).coerceIn(0f, 1f)
  }
}
