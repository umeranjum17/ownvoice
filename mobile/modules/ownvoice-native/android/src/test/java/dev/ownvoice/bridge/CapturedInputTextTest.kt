package dev.ownvoice.bridge

import org.junit.Assert.assertEquals
import org.junit.Test

class CapturedInputTextTest {
  @Test fun browserUrlBarIsTheOnlyEditableScreenNodeIncluded() {
    assertEquals(true, includeScreenNode(true, false, false, true, "com.android.chrome:id/url_bar"))
    assertEquals(false, includeScreenNode(true, false, false, true, "page-compose"))
    assertEquals(false, includeScreenNode(true, false, false, true, null))
    assertEquals(false, includeScreenNode(false, false, false, true, "com.android.chrome:id/url_bar"))
  }

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
    assertEquals(true, includeScreenNode(false, true, true, false))
    assertEquals(false, includeScreenNode(false, true, false, false))
    assertEquals(false, includeScreenNode(false, true, true, true))
    assertEquals(true, includePracticeText(true, true, null))
    assertEquals(true, includePracticeText(true, false, "practice-line-second"))
    assertEquals(false, includePracticeText(true, false, "setup-note"))
  }

  @Test fun theTypingCheckWaitsForTwelveCharactersAndThreeWords() {
    assertEquals(false, worthChecking("see you now"))
    assertEquals(false, worthChecking("   hi   "))
    assertEquals(false, worthChecking("wonderfully-long-single-word"))
    assertEquals(false, worthChecking("absolutely wonderful"))
    assertEquals(true, worthChecking("see you at 8"))
    assertEquals(true, worthChecking(" Its a great idea "))
  }

  @Test fun controlsAndTheirChildrenNeverBecomeConversation() {
    assertEquals(null, conversationText("Skip", false, true))
    assertEquals(null, conversationText("Clickable child", false, true))
    assertEquals(null, conversationText("Message", true, false))
    assertEquals("Sam: Can you bring the stove?", conversationText(" Sam: Can you bring the stove? ", false, false))
  }
}
