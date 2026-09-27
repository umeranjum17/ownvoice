package dev.ownvoice.bridge

import kotlin.math.abs
import kotlin.math.max

/** Which side of the screen the bubble rests against. */
enum class BubbleEdge { Left, Right }

/** Where the bubble rests: the edge it hugs, and the pixel its top edge sits at below the status bar. */
data class BubbleSpot(val edge: BubbleEdge, val top: Int)

/**
 * The bubble's drag, snap and rest maths, kept free of Android types so it can be checked on its own.
 * Every distance here is a pixel of the area the bubble is laid out in, below the status bar.
 */
object BubblePlacement {
  /** Past this many dp of finger travel the gesture is a drag, so it must not count as a tap. */
  const val SLOP_DP = 12

  /** The edge nearest the bubble's centre when the finger lets go. */
  fun edge(centerX: Int, screenW: Int): BubbleEdge = if (centerX < screenW / 2) BubbleEdge.Left else BubbleEdge.Right

  /** How far down a dragged bubble may sit: wholly inside the area it is laid out in. */
  fun clampTop(top: Int, areaH: Int, size: Int): Int = top.coerceIn(0, max(0, areaH - size))

  /** How far from the left a dragged bubble may be, so none of it leaves the screen. */
  fun clampLeft(left: Int, screenW: Int, size: Int): Int = left.coerceIn(0, max(0, screenW - size))

  /**
   * The top the bubble rests at: where it was put, but never under the keyboard. A raised keyboard
   * pushes it up to sit just above that edge instead of covering the field behind it.
   */
  fun restTop(top: Int, areaH: Int, size: Int, keyboardTop: Int?, gap: Int): Int =
    clampTop(keyboardTop?.let { minOf(top, it - gap - size) } ?: top, areaH, size)

  /** A gesture becomes a drag once the finger has travelled past the slop in either direction. */
  fun isDrag(dx: Float, dy: Float, slopPx: Int): Boolean = max(abs(dx), abs(dy)) > slopPx
}

/** The spot each app left its bubble at, kept in whatever store the caller hands over. */
class BubbleSpots(private val read: (String) -> String?, private val write: (String, String) -> Boolean) {
  fun spotFor(app: String, areaH: Int, size: Int): BubbleSpot = parse(read(app))?.let { BubbleSpot(it.edge, BubblePlacement.clampTop(it.top, areaH, size)) }
    ?: BubbleSpot(BubbleEdge.Right, BubblePlacement.clampTop((areaH - size) / 2, areaH, size))

  fun remember(app: String, spot: BubbleSpot): Boolean = write(app, "${spot.edge.name},${spot.top}")

  /** A spot written by an older build, or edited by hand, falls back to the caller's default. */
  fun parse(text: String?): BubbleSpot? {
    val parts = text?.split(',') ?: return null
    val edge = parts.getOrNull(0)?.let { name -> BubbleEdge.entries.firstOrNull { it.name == name } } ?: return null
    val top = parts.getOrNull(1)?.toIntOrNull()?.takeIf { it >= 0 } ?: return null
    return BubbleSpot(edge, top)
  }
}
