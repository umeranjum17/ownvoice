package dev.ownvoice.bridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Looper
import io.github.umeranjum17.byokit.overlay.FieldNode
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
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
      shadowOf(Looper.getMainLooper()).idle()
    }
  }

  private fun capture(service: OwnvoiceService, field: Field): OwnvoiceService.Capture {
    val reading = OwnvoiceService.Capture("", "", "", "com.whatsapp", "WhatsApp", 0L, null, field, emptyList(), null, "tap")
    OwnvoiceService::class.java.getDeclaredField("capture").apply { isAccessible = true }.set(service, reading)
    return reading
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
          assertEquals(listOf(false to false, true to false), completions)
          assertEquals(listOf(Triple(false, false, false), Triple(true, false, false)), events)
          assertNull(service.captured())
          assertEquals("keep", clipboard.primaryClip!!.getItemAt(0).text.toString())
        }
      } finally {
        service.onDestroy()
        OwnvoiceService.onInserted = null
      }
    }
  }
}
