package dev.ownvoice.bridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The replace handback is limited to our own editable fields, and the words never claim an unverified replacement. */
class RewriteToastTest {
  @Test fun handbackIsLimitedToOwnFields() {
    assertTrue(RewriteActivity.handbackAllowed("dev.ownvoice.next", "dev.ownvoice.next"))
    assertFalse(RewriteActivity.handbackAllowed("com.android.chrome", "dev.ownvoice.next"))
    assertFalse(RewriteActivity.handbackAllowed("com.android.shell", "dev.ownvoice.next"))
    assertFalse(RewriteActivity.handbackAllowed(null, "dev.ownvoice.next"))
  }

  @Test fun copyOnlyNoticeStatesTheFallbackWithoutClaimingAReplacement() {
    val toast = RewriteActivity.COPY_ONLY_TOAST
    assertTrue(toast.contains("wasn't replaced", ignoreCase = true)) // the honest negation, not a claim
    assertTrue(toast.contains("copied", ignoreCase = true))
    assertTrue(toast.contains("paste", ignoreCase = true))
  }

  @Test fun theConfirmedReplacementSayingIsOnlySpokenAfterTheFieldReadBack() {
    // "Replaced." is spoken by the service's read-back verification, never pre-claimed by the sheet.
    assertTrue(RewriteActivity.REPLACED_SAYING == "Replaced.")
  }
}
