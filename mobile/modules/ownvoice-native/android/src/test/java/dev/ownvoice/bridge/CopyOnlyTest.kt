package dev.ownvoice.bridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Only Replace from the editable selection that sent it hands back; everything else only copies. */
class CopyOnlyTest {
  @Test fun replaceFromEditableHandsBack() {
    assertTrue(RewriteActivity.shouldHandBack(true, true))
  }

  @Test fun replaceFromShareNeverHandsBack() {
    assertFalse(RewriteActivity.shouldHandBack(true, false))
  }

  @Test fun copyNeverHandsBack() {
    assertFalse(RewriteActivity.shouldHandBack(false, true))
    assertFalse(RewriteActivity.shouldHandBack(false, false))
  }
}
