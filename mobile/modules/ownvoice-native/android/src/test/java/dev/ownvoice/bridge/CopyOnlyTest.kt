package dev.ownvoice.bridge

import org.junit.Assert.assertFalse
import org.junit.Test

/** Copy-only everywhere: the sheet never hands a rewrite back to any field. */
class CopyOnlyTest {
  @Test fun replaceNeverHandsBack() {
    assertFalse(RewriteActivity.shouldHandBack(true))
  }

  @Test fun copyNeverHandsBack() {
    assertFalse(RewriteActivity.shouldHandBack(false))
  }
}
