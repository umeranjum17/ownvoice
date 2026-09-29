package dev.ownvoice.bridge

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Lane W1 on-device acceptance: drafts come out of [LocalGemma] (CPU fallback
 * on an emulator with no GPU) using a model file pre-pushed into the test
 * app's files dir. Slow is fine; empty is not.
 */
@RunWith(AndroidJUnit4::class)
class LocalGemmaDeviceTest {
  @Test fun draftsThroughLocalGemma() = runBlocking {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    // The emulator has no OpenCL, so this is the CPU path with the pre-pushed base build.
    assertFalse(LocalGemma.hasOpenCl())
    assertEquals(LocalGemma.CPU, LocalGemma.variant())
    val file = LocalGemma.modelFile(context)
    assertTrue(
      "model file missing at ${file.absolutePath} (${file.length()} bytes)",
      file.exists() && file.length() == LocalGemma.variant().size,
    )
    val drafts = LocalGemma.drafts(
      context,
      "Write one short friendly reply to this text: thanks for the birthday wishes!",
      1,
      40,
    )
    Log.i("W1Accept", "drafts=${drafts.size} first=${drafts.firstOrNull()}")
    assertTrue("empty drafts", drafts.isNotEmpty() && drafts[0].isNotBlank())
  }
}
