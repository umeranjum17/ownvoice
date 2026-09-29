package dev.ownvoice.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class LocalGemmaTest {
  @get:Rule val tmp = TemporaryFolder()

  @Test fun statusTable() {
    val abis = arrayOf("arm64-v8a")
    // A verified file is available whatever the phone looks like.
    assertEquals("available", LocalGemma.selectStatus(true, 0, 0, emptyArray()))
    // An eligible phone may fetch the model.
    assertEquals("downloadable", LocalGemma.selectStatus(false, 8_000_000_000L, 4_000_000_000L, abis))
    assertEquals("downloadable", LocalGemma.selectStatus(false, LocalGemma.MIN_RAM_BYTES, LocalGemma.MIN_FREE_BYTES, arrayOf("x86_64")))
    // Below ~8 GB RAM or ~3 GB free: can't.
    assertEquals("unavailable", LocalGemma.selectStatus(false, LocalGemma.MIN_RAM_BYTES - 1, 9_000_000_000L, abis))
    assertEquals("unavailable", LocalGemma.selectStatus(false, 16_000_000_000L, LocalGemma.MIN_FREE_BYTES - 1, abis))
    // No 64-bit ABI (the AAR ships arm64 and x86_64 only): can't.
    assertEquals("unavailable", LocalGemma.selectStatus(false, 16_000_000_000L, 9_000_000_000L, arrayOf("armeabi-v7a")))
  }

  @Test fun sha256Vector() {
    assertEquals(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      LocalGemma.sha256Hex("abc".toByteArray()),
    )
  }

  @Test fun fileHashGate() {
    val file: File = tmp.newFile("model.bin")
    file.writeBytes("abc".toByteArray())
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", LocalGemma.fileSha256Hex(file))
    assertFalse("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".equals(LocalGemma.MODEL_SHA256, ignoreCase = true))
  }

  @Test fun errorMapping() {
    assertEquals(16, PhoneModel.errorCode(OutOfMemoryError()))
    assertEquals(16, PhoneModel.errorCode(UnsupportedOperationException()))
    assertEquals(501, PhoneModel.errorCode(NoSpaceException()))
    assertEquals(9, PhoneModel.errorCode(ModelBusyException()))
    assertEquals(-107, PhoneModel.errorCode(IllegalStateException()))
  }

  @Test fun pinnedDownloadIdentity() {
    // The one-time file: name, immutable revision URL, byte size and content hash move together.
    assertTrue(LocalGemma.MODEL_URL.startsWith("https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/"))
    assertTrue(LocalGemma.MODEL_URL.endsWith("/" + LocalGemma.MODEL_FILE))
    assertEquals(64, LocalGemma.MODEL_SHA256.length)
    assertTrue(LocalGemma.MODEL_SIZE > 1_000_000_000L)
  }
}
