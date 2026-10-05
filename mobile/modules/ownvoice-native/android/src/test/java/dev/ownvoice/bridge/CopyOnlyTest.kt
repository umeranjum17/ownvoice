package dev.ownvoice.bridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Replace verification: handback is attempted only when Replace is pressed, and verified after
 * the sheet closes. The verification reads the focused field through the accessibility service
 * and confirms the exact draft landed with the selection collapsed at the end; failure falls back
 * to copy. That service-level verification is proven by the rn08 e2e journey; this unit test pins
 * the shouldHandBack gate that decides whether the sheet attempts a handback at all. */
class CopyOnlyTest {
  @Test fun replaceAttemptsHandback() {
    assertTrue(RewriteActivity.shouldHandBack(true))
  }

  @Test fun copyNeverHandsBack() {
    assertFalse(RewriteActivity.shouldHandBack(false))
  }
}
