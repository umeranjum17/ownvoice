package dev.ownvoice.bridge

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class PhoneModelTest {
  @Test fun retryKeepsCollectedDraftsAndFirstFailurePropagates() = runBlocking {
    var calls = 0
    val drafts = PhoneModel.collectDrafts(3) {
      if (++calls == 2) throw IllegalStateException("retry failed")
      listOf(" First ", "Second")
    }
    assertEquals(listOf("First", "Second"), drafts)
    assertEquals(2, calls)

    val failure = IllegalStateException("first failed")
    val thrown = try {
      PhoneModel.collectDrafts(3) { throw failure }
      null
    } catch (error: IllegalStateException) { error }
    assertSame(failure, thrown)
  }
}
