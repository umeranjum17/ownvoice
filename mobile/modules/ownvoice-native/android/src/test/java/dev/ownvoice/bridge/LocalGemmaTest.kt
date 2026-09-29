package dev.ownvoice.bridge

import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
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
    assertFalse("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".equals(LocalGemma.GPU.sha256, ignoreCase = true))
  }

  @Test fun errorMapping() {
    assertEquals(16, PhoneModel.errorCode(OutOfMemoryError()))
    assertEquals(16, PhoneModel.errorCode(UnsupportedOperationException()))
    assertEquals(501, PhoneModel.errorCode(NoSpaceException()))
    assertEquals(9, PhoneModel.errorCode(ModelBusyException()))
    assertEquals(-107, PhoneModel.errorCode(IllegalStateException()))
  }

  @Test fun pinnedRevisionBinding() {
    val revisions = listOf(LocalGemma.GPU, LocalGemma.CPU).map { variant ->
      val segments = variant.url.split("/")
      val revision = segments[segments.indexOf("resolve") + 1]
      assertTrue(revision.matches(Regex("[0-9a-f]{40}")))
      assertEquals(variant.file, segments.last())
      assertEquals(64, variant.sha256.length)
      assertTrue(variant.sha256.all { it in '0'..'9' || it in 'a'..'f' })
      assertTrue(variant.size > 1_000_000_000L)
      revision
    }
    assertEquals(revisions[0], revisions[1])
    assertTrue(LocalGemma.GPU.file != LocalGemma.CPU.file)
  }

  @Test fun hashGateVerifiesOnceThenTrustsMarker() {
    val dir = tmp.newFolder("gate")
    val pinned = LocalGemma.Variant("tiny.bin", "https://example.invalid/tiny.bin", LocalGemma.sha256Hex("abc".toByteArray()), 3)
    val file = File(dir, pinned.file)
    file.writeBytes("abc".toByteArray())
    assertTrue(LocalGemma.isVerified(dir, file, pinned))
    assertTrue(File(dir, "${pinned.file}.verified").exists())
    file.writeBytes("abd".toByteArray())
    assertTrue(LocalGemma.isVerified(dir, file, pinned))
  }

  @Test fun hashGateRejectsUnmarkedBytes() {
    val dir = tmp.newFolder("gate-bad")
    val pinned = LocalGemma.Variant("tiny.bin", "https://example.invalid/tiny.bin", LocalGemma.sha256Hex("abc".toByteArray()), 3)
    val file = File(dir, pinned.file)
    file.writeBytes("abd".toByteArray())
    assertFalse(LocalGemma.isVerified(dir, file, pinned))
    assertFalse(file.exists())
  }

  @Test fun engineStartFailureSurfacesRealError() {
    val gpuFailure = IllegalStateException("CL_OUT_OF_RESOURCES")
    try {
      LocalGemma.startEngineOrThrow { throw gpuFailure }
      fail("expected the engine failure to surface")
    } catch (error: UnsupportedOperationException) {
      assertEquals(gpuFailure, error.cause)
      assertEquals(16, PhoneModel.errorCode(error))
    }
    try {
      LocalGemma.startEngineOrThrow { throw CancellationException("gone") }
      fail("expected cancellation to propagate")
    } catch (error: CancellationException) {
      assertEquals("gone", error.message)
    }
    assertEquals("ok", LocalGemma.startEngineOrThrow { "ok" })
  }

  @Test fun noOpenClMeansCpuBuild() {
    // The unit-test host has no OpenCL library, like an emulator: the base build is selected.
    assertFalse(File("/system/lib64/libOpenCL.so").exists())
    assertFalse(LocalGemma.hasOpenCl())
    assertEquals(LocalGemma.CPU, LocalGemma.variant())
  }
}
