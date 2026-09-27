package dev.ownvoice.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BubblePlacementTest {
  private val w = 1080
  private val h = 2400
  private val dot = 156 // 52 dp at 3x

  @Test fun releaseSnapsToTheNearestEdge() {
    assertEquals(BubbleEdge.Left, BubblePlacement.edge(60, w))
    assertEquals(BubbleEdge.Left, BubblePlacement.edge(w / 2 - 1, w))
    assertEquals(BubbleEdge.Right, BubblePlacement.edge(w / 2, w))
    assertEquals(BubbleEdge.Right, BubblePlacement.edge(w - 60, w))
  }

  @Test fun draggedBubbleAlwaysStaysOnScreen() {
    assertEquals(0, BubblePlacement.clampTop(-400, h, dot))
    // The overlay starts at screen y=30, but the status bar ends at y=63.
    assertEquals(33, BubblePlacement.clampTop(-400, h, dot, 33))
    assertEquals(h - dot, BubblePlacement.clampTop(h + 400, h, dot))
    assertEquals(h - dot, BubblePlacement.clampTop(h - dot, h, dot))
    assertEquals(0, BubblePlacement.clampLeft(-10, w, dot))
    assertEquals(w - dot, BubblePlacement.clampLeft(w, w, dot))
  }

  @Test fun keyboardUpRestsTheBubbleJustAboveIt() {
    val keyboard = h - 900
    val gap = 24
    assertEquals(keyboard - gap - dot, BubblePlacement.restTop(h, h, dot, keyboard, gap))
    assertEquals(300, BubblePlacement.restTop(300, h, dot, keyboard, gap))
    assertEquals(h - dot, BubblePlacement.restTop(h, h, dot, null, gap))
    assertEquals(0, BubblePlacement.restTop(h, h, dot, 100, gap))
  }

  @Test fun travelPastTheSlopIsADrag() {
    assertFalse(BubblePlacement.isDrag(0f, 0f, 36))
    assertFalse(BubblePlacement.isDrag(0f, 36f, 36))
    assertTrue(BubblePlacement.isDrag(0f, 37f, 36))
    assertTrue(BubblePlacement.isDrag(37f, 0f, 36))
    assertTrue(BubblePlacement.isDrag(-37f, -37f, 36))
  }

  @Test fun eachAppKeepsItsOwnSpot() {
    val saved = mutableMapOf<String, String>()
    val spots = BubbleSpots(saved::get) { app, value -> saved[app] = value; true }
    val centre = BubbleSpot(BubbleEdge.Right, (h - dot) / 2)
    assertEquals(centre, spots.spotFor("com.whatsapp", h, dot))
    assertTrue(spots.remember("com.whatsapp", BubbleSpot(BubbleEdge.Left, 400)))
    assertTrue(spots.remember("com.twitter.android", BubbleSpot(BubbleEdge.Right, 900)))
    assertEquals(BubbleSpot(BubbleEdge.Left, 400), spots.spotFor("com.whatsapp", h, dot))
    assertEquals(BubbleSpot(BubbleEdge.Right, 900), spots.spotFor("com.twitter.android", h, dot))
  }

  @Test fun brokenSpotFallsBackToTheDefault() {
    fun stored(text: String?) = BubbleSpots({ text }, { _, _ -> true }).spotFor("com.whatsapp", h, dot)
    val centre = BubbleSpot(BubbleEdge.Right, (h - dot) / 2)
    assertEquals(centre, stored(null))
    assertEquals(centre, stored("nonsense"))
    assertEquals(centre, stored("Left,-5"))
    assertEquals(centre, stored("Up,40"))
    assertEquals(BubbleSpot(BubbleEdge.Left, 40), stored("Left,40"))
    assertEquals(h - dot, stored("Left,99999").top) // A spot saved before a rotation is pulled back on screen.
  }
}
