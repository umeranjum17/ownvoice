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
    assertEquals(false, isControl(false, "android.widget.TextView"))
    assertEquals(false, isControl(false, "android.view.ViewGroup"))
    assertEquals(true, isControl(false, "android.widget.Button"))
    assertEquals(true, isControl(false, "android.widget.ImageButton"))
    assertEquals(true, isControl(true, "android.widget.TextView"))
    assertEquals("Reply", conversationText("Reply", false, isControl(false, "android.widget.TextView")))
    assertEquals("Back", conversationText("Back", false, isControl(false, "android.widget.TextView")))
    assertEquals("Send", conversationText("Send", false, isControl(false, "android.widget.TextView")))
    assertEquals(null, conversationText("Send", false, isControl(true, "android.widget.TextView")))
  }

  @Test fun controlsAndTheirChildrenNeverBecomeConversation() {
    assertEquals(null, conversationText("Skip", false, true))
    assertEquals(null, conversationText("Clickable child", false, true))
    assertEquals(null, conversationText("Message", true, false))
    assertEquals("Sam: Can you bring the stove?", conversationText(" Sam: Can you bring the stove? ", false, false))
  }
}
