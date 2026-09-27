package dev.ownvoice.bridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The sheet hands a rewrite back without knowing whether the other app applied it, so the toast may only promise the copy. */
class RewriteToastTest {
  @Test fun returnedToastNeverClaimsAReplacement() {
    assertFalse(RewriteActivity.RETURNED_TOAST.contains("replac", ignoreCase = true))
    assertTrue(RewriteActivity.RETURNED_TOAST.contains("copied", ignoreCase = true))
    assertTrue(RewriteActivity.RETURNED_TOAST.contains("paste", ignoreCase = true))
  }
}
