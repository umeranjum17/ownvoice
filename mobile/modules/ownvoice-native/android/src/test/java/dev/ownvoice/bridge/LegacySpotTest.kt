package dev.ownvoice.bridge

import io.github.umeranjum17.byokit.overlay.Edge
import io.github.umeranjum17.byokit.overlay.Placement
import io.github.umeranjum17.byokit.overlay.Size
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LegacySpotTest {
  private val screen = Size(1080, 2320)
  private val bubble = Size(147, 147)

  @Test fun rememberedPixelPositionsSurviveTheStoreChange() {
    for (edge in listOf("Left", "Right")) {
      val migrated = legacySpot("$edge,900", screen, bubble, 63)!!
      assertEquals(if (edge == "Left") Edge.LEFT else Edge.RIGHT, migrated.edge)
      assertEquals(963, Placement.toPixels(migrated, screen, bubble, 63, null).second)
    }
  }

  @Test fun anOldSpotOutsideTheUsableScreenIsClampedByTheKit() {
    for (value in listOf("Right,9999", "Right,2147483647")) {
      val migrated = legacySpot(value, screen, bubble, 63)!!
      assertEquals(screen.h - bubble.h, Placement.toPixels(migrated, screen, bubble, 63, null).second)
    }
  }

  @Test fun malformedOldDataCannotReplaceTheKitDefault() {
    for (value in listOf("", "Right,-1", "Left,oops", "RIGHT,900", "Right,900,extra")) {
      assertNull(legacySpot(value, screen, bubble, 63))
    }
  }
}
