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

  @Test fun clickableRowsKeepMessageChildrenButButtonsStayControls() {
    assertEquals(false, isControl(false, false, true, 1))
    assertEquals(false, isControl(false, false, false, 0))
    assertEquals(true, isControl(false, true, true, 1))
    assertEquals(true, isControl(true, false, false, 0))
    assertEquals(true, isControl(false, false, true, 0))
    assertEquals("Can you bring the stove?", conversationText("Can you bring the stove?", false, isControl(false, false, false, 0)))
  }

  @Test fun controlsAndTheirChildrenNeverBecomeConversation() {
    assertEquals(null, conversationText("Skip", false, true))
    assertEquals(null, conversationText("Clickable child", false, true))
    assertEquals(null, conversationText("Message", true, false))
    assertEquals("Sam: Can you bring the stove?", conversationText(" Sam: Can you bring the stove? ", false, false))
  }
}
