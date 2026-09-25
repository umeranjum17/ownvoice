package dev.ownvoice.bridge

import org.junit.Assert.assertEquals
import org.junit.Test

class CapturedInputTextTest {
  @Test fun hintTextIsNotCapturedAsUserWords() {
    assertEquals(null, accessibleText("Message", true))
    assertEquals("", capturedInputText("Message", true))
    assertEquals("Reply", accessibleText("Reply", false))
    assertEquals("Reply", capturedInputText("Reply", false))
    assertEquals("", capturedInputText(null, false))
  }
}
