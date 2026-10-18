package dev.ownvoice.bridge

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.os.Build
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.File

/**
 * App-owned on-device dictation port for @byokit/dictation's systemEngine.
 * Shape follows BYOKit's examples/dictation-android: one shared SpeechRecognizer,
 * partial/final segments as events, and stop() settling only after the final lands.
 * Recognition is always on-device (createOnDeviceSpeechRecognizer); EXTRA_PREFER_OFFLINE
 * alone is never relied on. Debug builds can arm a recorded WAV that the next session
 * hands the recognizer through EXTRA_AUDIO_SOURCE (API 33+) instead of the mic, so a
 * proof run feeds speech without playing sound; release builds ignore it.
 */
object Dictate {
  var emit: ((Map<String, Any?>) -> Unit)? = null

  private var recognizer: SpeechRecognizer? = null
  private var session: String? = null
  private var proof: ParcelFileDescriptor? = null

  fun available(context: Context): String {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
      return "mic-blocked"
    if (!SpeechRecognizer.isRecognitionAvailable(context)) return "unsupported"
    // On-device enforcement needs the API 31 constructor; older phones cannot do this cut.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "unsupported"
    return try {
      if (recognizer == null) recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      "ready"
    } catch (e: Exception) {
      Log.w("Ownvoice", "on-device recognizer unavailable", e)
      "unsupported"
    }
  }

  fun start(context: Context, id: String, locale: String, partial: Boolean, punctuation: Boolean) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) throw IllegalStateException("unsupported")
      val active = recognizer ?: SpeechRecognizer.createOnDeviceSpeechRecognizer(context).also { recognizer = it }
      session = id
      active.setRecognitionListener(listener(id))
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
        .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partial)
        .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      proof?.let { pfd ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, pfd)
          intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
          intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
          intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, 16000)
        }
        proof = null
      }
      @Suppress("MissingPermission")
      active.startListening(intent)
    } catch (e: Exception) {
      Log.w("Ownvoice", "dictate start failed", e)
      end(id)
      emit?.invoke(mapOf("id" to id, "type" to "error", "code" to "unsupported"))
    }
  }

  fun stop(id: String) {
    // The pending stop settles when onResults/onError emits the final segment or error;
    // an already-ended session answers at once.
    if (id != session) emit?.invoke(mapOf("id" to id, "type" to "stopped"))
    else runCatching { recognizer?.stopListening() }
  }

  fun cancel(id: String) {
    if (id == session) {
      runCatching { recognizer?.cancel() }
      end(id)
    }
  }

  fun teardown() {
    session = null
    closeProof()
    runCatching { recognizer?.destroy() }
    recognizer = null
  }

  /** Debug-only proof hook: stage a 16 kHz mono 16-bit WAV for the next session. Release builds refuse. */
  fun armProof(context: Context, path: String): Boolean {
    if (!BuildConfig.DEBUG) return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false
    return try {
      val pcm = File(context.cacheDir, "dictate-proof.pcm")
      pcm.outputStream().use { out -> out.write(pcmBytes(File(path))) }
      closeProof()
      proof = ParcelFileDescriptor.open(pcm, ParcelFileDescriptor.MODE_READ_ONLY)
      true
    } catch (e: Exception) {
      Log.w("Ownvoice", "proof wav rejected", e)
      false
    }
  }

  // Raw PCM under the WAV header; strict, so a wrong fixture fails loudly instead of hissing.
  private fun pcmBytes(wav: File): ByteArray {
    val bytes = wav.readBytes()
    fun str(at: Int) = String(bytes.sliceArray(at until at + 4), Charsets.US_ASCII)
    fun int(at: Int) = (bytes[at].toInt() and 0xFF) or ((bytes[at + 1].toInt() and 0xFF) shl 8) or
      ((bytes[at + 2].toInt() and 0xFF) shl 16) or ((bytes[at + 3].toInt() and 0xFF) shl 24)
    fun short(at: Int) = (bytes[at].toInt() and 0xFF) or ((bytes[at + 1].toInt() and 0xFF) shl 8)
    check(bytes.size > 44 && str(0) == "RIFF" && str(8) == "WAVE" && str(12) == "fmt ") { "not a wav" }
    check(short(20) == 1 && short(22) == 1 && int(24) == 16000 && short(34) == 16) { "need 16 kHz mono 16-bit" }
    var at = 12 + 8 + int(16)
    while (!(str(at) == "data")) at += 8 + int(at + 4)
    return bytes.sliceArray(at + 8 until at + 8 + int(at + 4))
  }

  private fun closeProof() {
    runCatching { proof?.close() }
    proof = null
  }

  private fun listener(id: String) = object : RecognitionListener {
    private fun words(bundle: Bundle?): String =
      bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()

    private fun segment(last: Boolean, text: String) {
      emit?.invoke(mapOf("id" to id, "type" to "segment",
        "segment" to mapOf("id" to "0", "text" to text, "final" to last)))
    }

    override fun onReadyForSpeech(bundle: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rms: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(type: Int, params: Bundle?) {}

    override fun onPartialResults(bundle: Bundle?) {
      if (id == session) segment(false, words(bundle))
    }

    override fun onResults(bundle: Bundle?) {
      if (id != session) return
      segment(true, words(bundle))
      emit?.invoke(mapOf("id" to id, "type" to "stopped"))
      end(id)
    }

    override fun onError(code: Int) {
      if (id != session) return
      // Silence is a retry, not a failure; a missing language pack says so plainly.
      val mapped = when (code) {
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT, SpeechRecognizer.ERROR_NO_MATCH -> null
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "mic-blocked"
        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "needs-download"
        else -> "unsupported"
      }
      if (mapped == null) {
        segment(true, "")
        emit?.invoke(mapOf("id" to id, "type" to "stopped"))
      } else {
        emit?.invoke(mapOf("id" to id, "type" to "error", "code" to mapped))
      }
      end(id)
    }
  }

  private fun end(id: String) {
    if (id == session) session = null
    closeProof()
  }
}
