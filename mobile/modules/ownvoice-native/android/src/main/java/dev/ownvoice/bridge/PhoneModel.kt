package dev.ownvoice.bridge

import android.content.Context
import android.util.Log
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.cancelAndJoin
import java.util.concurrent.atomic.AtomicReference

/**
 * The on-device writer: [AiCore] (Gemini Nano) wherever AICore answers,
 * [LocalGemma] (a downloaded Gemma file) on phones without it.
 */
internal object PhoneModel {
  @Volatile private var aiCoreReady = false
  private val aiCoreDownload = AtomicReference<Job?>(null)

  /** AICore state (a FeatureStatus int), or null when the phone has no AICore to ask. */
  private suspend fun aiCore(): Int? =
    try { AiCore.checkStatus() } catch (_: Throwable) { null }

  private suspend fun useAiCore(): Boolean {
    if (aiCoreReady) return true
    val state = aiCore()
    val ready = state != null && state != FeatureStatus.UNAVAILABLE
    if (ready) aiCoreReady = true
    return ready
  }

  suspend fun status(context: Context): String {
    val probe = aiCore()
    val state = when (probe) {
      FeatureStatus.AVAILABLE -> "available"
      FeatureStatus.DOWNLOADABLE -> "downloadable"
      FeatureStatus.DOWNLOADING -> "downloading"
      else -> null
    }
    if (state != null) {
      aiCoreReady = true
      Log.i(OwnvoiceService.TAG, "model status $state (aicore)")
      return state
    }
    if (probe == FeatureStatus.UNAVAILABLE) aiCoreReady = false
    return LocalGemma.status(context).also {
      Log.i(OwnvoiceService.TAG, "model status $it (local)")
    }
  }

  suspend fun download(context: Context, allowMobileData: Boolean, progress: (Float) -> Unit) {
    if (useAiCore()) {
      aiCoreDownload.set(currentCoroutineContext()[Job])
      try {
        AiCore.download(progress)
      } finally {
        aiCoreDownload.compareAndSet(currentCoroutineContext()[Job], null)
      }
    } else LocalGemma.download(context, allowMobileData, progress)
  }

  suspend fun cancelDownload() {
    LocalGemma.cancelDownload()
    LocalGemma.awaitDownloadSettled()
    aiCoreDownload.getAndSet(null)?.cancelAndJoin()
  }

  fun delete(context: Context) = LocalGemma.delete(context)

  fun release() = LocalGemma.release()

  suspend fun ask(context: Context, prompt: String, maxTokens: Int, partial: (String) -> Unit): String =
    if (useAiCore()) AiCore.ask(prompt, maxTokens, partial)
    else LocalGemma.ask(context, prompt, maxTokens, partial)

  suspend fun draftStream(context: Context, prompt: String, maxTokens: Int, partial: (String) -> Unit): String =
    if (useAiCore()) AiCore.draftStream(prompt, maxTokens, partial)
    else LocalGemma.draftStream(context, prompt, maxTokens, partial)

  suspend fun drafts(context: Context, prompt: String, candidates: Int, maxTokens: Int): List<String> =
    if (useAiCore()) AiCore.drafts(prompt, candidates, maxTokens)
    else LocalGemma.drafts(context, prompt, candidates, maxTokens)

  internal suspend fun collectDrafts(candidates: Int, generate: suspend () -> List<String>): List<String> {
    val result = mutableListOf<String>()
    repeat(2) {
      if (result.size < candidates) {
        val batch = try { generate() } catch (error: Throwable) {
          if (result.isEmpty() || error is CancellationException) throw error
          return result.take(candidates)
        }
        batch.map { it.trim().removeSurrounding("\"") }
          .forEach { if (it.isNotEmpty() && it !in result) result.add(it) }
      }
    }
    return result.take(candidates)
  }

  fun errorCode(error: Throwable): Int = when (error) {
    is GenAiException -> error.errorCode
    is ModelBusyException -> 9
    is NoSpaceException -> 501
    is OutOfMemoryError -> 16
    is UnsupportedOperationException -> 16
    else -> -107
  }
}
