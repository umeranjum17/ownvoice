package dev.ownvoice.bridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Rect
import android.os.Looper
import android.view.accessibility.AccessibilityNodeInfo
import io.github.umeranjum17.byokit.overlay.FieldNode
import io.github.umeranjum17.byokit.overlay.FieldSelection
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.time.Duration
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
class OwnvoiceInsertTest {
  private class Field(private val accepts: Boolean) : FieldNode {
    override val editable = true
    override val password = false
    override val childCount = 0
    val started = CountDownLatch(1)
    lateinit var worker: Thread
    var reads = 0
    var sets = 0
    var text = "before"
    override fun shown(): String {
      worker = Thread.currentThread()
      reads++
      if (reads == 2) started.countDown()
      return text
    }
    override fun set(text: String): Boolean {
      sets++
      if (accepts) this.text = text
      return accepts
    }
    override fun selection(): Pair<Int, Int>? = null
    override fun child(i: Int): FieldNode? = null
    fun awaitWorker() {
      assertTrue(started.await(3, TimeUnit.SECONDS))
    }
    fun joinWorker() {
      worker.join(3000)
      assertFalse(worker.isAlive)
      shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2))
    }
  }

  private fun capture(service: OwnvoiceService, field: Field): OwnvoiceService.Capture {
    val reading = OwnvoiceService.Capture("", "", "", "com.whatsapp", "WhatsApp", 0L, null, field, emptyList(), null, "tap")
    OwnvoiceService::class.java.getDeclaredField("capture").apply { isAccessible = true }.set(service, reading)
    return reading
  }

  @Test fun sameFieldHoldsAcrossDistinctNodeObjects() {
    fun node(viewId: String?): AccessibilityNodeInfo {
      val n = AccessibilityNodeInfo.obtain()
      n.packageName = "com.whatsapp"
      n.className = "android.widget.EditText"
      if (viewId != null) n.viewIdResourceName = viewId
      n.setBoundsInScreen(Rect(0, 0, 10, 20))
      return n
    }
    val a = node("com.whatsapp:id/entry")
    val b = node("com.whatsapp:id/entry")
    try {
      assertNotSame(a, b)
      val aid = FieldNode.of(a).identity
      val bid = FieldNode.of(b).identity
      assertNotNull(aid)
      assertEquals(aid, bid)
      assertTrue(sameInsertField(aid, bid))
      val other = node("com.whatsapp:id/other")
      try {
        val oid = FieldNode.of(other).identity
        assertFalse(sameInsertField(aid, oid))
      } finally { other.recycle() }
      assertFalse(sameInsertField(aid, null))
      assertFalse(sameInsertField(null, bid))
    } finally { a.recycle(); b.recycle() }
  }

  @Test fun readbackRequiresExactTextAndCollapsedSelection() {
    assertTrue(insertTextMatches("com.whatsapp", "draft", "com.whatsapp", "draft"))
    assertFalse(insertTextMatches("com.whatsapp", "other", "com.whatsapp", "draft"))
    assertFalse(insertTextMatches("com.other", "draft", "com.whatsapp", "draft"))
    assertTrue(insertSelectionSettled(FieldSelection(5, 5), "draft"))
    assertFalse(insertSelectionSettled(FieldSelection(0, 5), "draft"))
    assertFalse(insertSelectionSettled(FieldSelection(4, 4), "draft"))
    assertFalse(insertSelectionSettled(null, "draft"))
  }

  @Test fun unchangedCaretIsAcceptedOnlyOnTheFinalRetry() {
    val before = FieldSelection(0, 0)
    fun accepted(selectionSet: Boolean, actual: FieldSelection?, finalAttempt: Boolean) =
      insertSelectionSettled(actual, "draft") || insertCaretIgnored(selectionSet, before, actual, finalAttempt)
    // Chromium applies the caret asynchronously: the first read still shows 0, the action returned true.
    assertFalse(accepted(selectionSet = true, actual = FieldSelection(0, 0), finalAttempt = false))
    assertTrue(accepted(selectionSet = true, actual = FieldSelection(5, 5), finalAttempt = false))
    // Gmail ignores the caret: it is accepted at the end of the retries, not on the first read.
    assertFalse(accepted(selectionSet = true, actual = before, finalAttempt = false))
    assertTrue(accepted(selectionSet = true, actual = before, finalAttempt = true))
    // An action the editor rejects is accepted at once, as the caret cannot settle.
    assertTrue(accepted(selectionSet = false, actual = FieldSelection(0, 0), finalAttempt = false))
    // A caret that was never readable cannot be proven unchanged, so the final retry does not accept it.
    assertFalse(insertCaretIgnored(selectionSet = true, before = null, actual = null, finalAttempt = true))
  }

  @Test fun invalidationStopsRetryAndSettlesOnceWithoutCopyOrDroppingTheNextCapture() {
    val invalidate: List<(OwnvoiceService) -> Unit> = listOf(
      { it.forget() },
      { it.readScreen() },
      { it.setRules(true, emptySet(), emptySet()) },
      { it.onUnbind(Intent()) },
      { it.onDestroy() },
    )
    for (cancel in invalidate) {
      OwnvoiceService.paused = false
      OwnvoiceService.onApps = emptySet()
      OwnvoiceService.offApps = emptySet()
      val service = Robolectric.buildService(OwnvoiceService::class.java).create().get()
      val clipboard = service.getSystemService(ClipboardManager::class.java)
      clipboard.setPrimaryClip(ClipData.newPlainText("sentinel", "keep"))
      val completions = mutableListOf<Pair<Boolean, Boolean>>()
      val events = mutableListOf<Triple<Boolean, Boolean, Boolean>>()
      OwnvoiceService.onInserted = { ok, lost, practice -> events += Triple(ok, lost, practice) }
      try {
        val blocked = Field(false)
        capture(service, blocked)
        service.insert("draft") { ok, lost -> completions += ok to lost }
        blocked.awaitWorker()
        cancel(service)
        val reads = blocked.reads
        val sets = blocked.sets
        OwnvoiceService.paused = false
        val ready = Field(true)
        val next = capture(service, ready)
        blocked.joinWorker()
        assertEquals(reads, blocked.reads)
        assertEquals(sets, blocked.sets)
        assertEquals("keep", clipboard.primaryClip!!.getItemAt(0).text.toString())
        assertEquals(listOf(false to false), completions)
        assertEquals(listOf(Triple(false, false, false)), events)
        assertSame(next, service.captured())
        if (cancel === invalidate[0]) {
          service.insert("first\nsecond") { ok, lost -> completions += ok to lost }
          ready.awaitWorker()
          ready.joinWorker()
          assertEquals("first\nsecond", ready.text)
          // A successful cached-node write with no focused-field read-back must fall back.
          assertEquals(listOf(false to false, false to false), completions)
          assertEquals(listOf(Triple(false, false, false), Triple(false, false, false)), events)
          assertNull(service.captured())
          assertEquals("first\nsecond", clipboard.primaryClip!!.getItemAt(0).text.toString())
        }
      } finally {
        service.onDestroy()
        OwnvoiceService.onInserted = null
      }
    }
  }
}
