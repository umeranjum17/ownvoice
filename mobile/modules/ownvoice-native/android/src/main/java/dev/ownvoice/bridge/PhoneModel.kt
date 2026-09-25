package dev.ownvoice.bridge

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

internal object PhoneModel {
  private val model by lazy { Generation.getClient() }

  suspend fun status(): String = when (model.checkStatus()) {
    FeatureStatus.AVAILABLE -> "available"
    FeatureStatus.DOWNLOADABLE -> "downloadable"
    FeatureStatus.DOWNLOADING -> "downloading"
    else -> "unavailable"
  }

  suspend fun download(progress: (Float) -> Unit) {
    when (model.checkStatus()) {
      FeatureStatus.AVAILABLE -> return
      FeatureStatus.UNAVAILABLE -> throw UnsupportedOperationException()
      else -> Unit
    }
    coroutineScope {
      val download = launch {
        var total = 0L
        model.download().collect { state ->
          when (state) {
            is DownloadStatus.DownloadStarted -> total = state.bytesToDownload
            is DownloadStatus.DownloadProgress -> if (total > 0) progress(state.totalBytesDownloaded.toFloat() / total)
            is DownloadStatus.DownloadFailed -> throw state.e
            DownloadStatus.DownloadCompleted -> progress(1f)
          }
        }
      }
      while (true) {
        when (model.checkStatus()) {
          FeatureStatus.AVAILABLE -> break
          FeatureStatus.UNAVAILABLE -> throw UnsupportedOperationException()
          else -> delay(1000)
        }
      }
      download.cancel()
    }
  }

  suspend fun ask(prompt: String, maxTokens: Int, partial: (String) -> Unit): String {
    val request = generateContentRequest(TextPart(prompt)) {
      temperature = 0f
      topK = 1
      maxOutputTokens = maxTokens
    }
    val text = StringBuilder()
    model.generateContentStream(request).collect { response ->
      response.candidates.firstOrNull()?.text?.let { delta ->
        text.append(delta)
        partial(delta)
      }
    }
    return text.toString().trim().ifEmpty { throw IllegalStateException("Empty answer") }
  }

  suspend fun drafts(prompt: String, candidates: Int, maxTokens: Int, temperature: Double, topK: Int): List<String> {
    val request = generateContentRequest(TextPart(prompt)) {
      this.temperature = temperature.toFloat()
      this.topK = topK
      candidateCount = candidates
      maxOutputTokens = maxTokens
    }
    val result = mutableListOf<String>()
    repeat(2) {
      if (result.size < 2) model.generateContent(request).candidates
        .map { it.text.trim().removeSurrounding("\"") }
        .filter { it.isNotEmpty() && it !in result }
        .forEach(result::add)
    }
    return result.take(candidates).ifEmpty { throw IllegalStateException("Empty drafts") }
  }

  fun errorCode(error: Throwable): Int = when (error) {
    is GenAiException -> error.errorCode
    is UnsupportedOperationException -> 16
    else -> -107
  }
}
