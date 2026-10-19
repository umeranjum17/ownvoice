package dev.ownvoice.bridge

import org.junit.Assert.assertEquals
import org.junit.Test

class DictateResultTest {
  @Test fun emptyFinalUsesLastPartial() {
    assertEquals("spoken words", finalDictationText("", "spoken words"))
    assertEquals("spoken words", finalDictationText("  ", "spoken words"))
  }

  @Test fun nonEmptyFinalWinsAndBothEmptyStayEmpty() {
    assertEquals("final words", finalDictationText("final words", "partial words"))
    assertEquals("", finalDictationText("", ""))
  }
}
