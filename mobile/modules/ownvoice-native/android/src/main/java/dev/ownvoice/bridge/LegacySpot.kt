package dev.ownvoice.bridge

import io.github.umeranjum17.byokit.overlay.Placement
import io.github.umeranjum17.byokit.overlay.Size
import io.github.umeranjum17.byokit.overlay.Spot

/** Decode Ownvoice's old persisted app data and hand its screen position to the kit's placement rules. */
internal fun legacySpot(value: String, screen: Size, bubble: Size, statusBar: Int): Spot? {
  val parts = value.split(',')
  if (parts.size != 2) return null
  val top = parts[1].toIntOrNull()?.takeIf { it >= 0 } ?: return null
  val x = when (parts[0]) {
    "Left" -> 0
    "Right" -> screen.w - bubble.w
    else -> return null
  }
  val y = (top.toLong() + statusBar).coerceAtMost(screen.h.toLong()).toInt()
  return Placement.snap(x, y, screen, bubble, statusBar, null)
}
