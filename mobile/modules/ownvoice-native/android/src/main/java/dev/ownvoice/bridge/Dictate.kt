package dev.ownvoice.bridge

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.speech.ModelDownloadListener
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.File
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.job
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/**
 * App-owned on-device dictation port for @byokit/dictation's systemEngine.
 * Shape follows BYOKit's examples/dictation-android: one shared SpeechRecognizer,
 * partial/final segments as events, and stop() settling only after the final lands.
 * Recognition is always on-device (createOnDeviceSpeechRecognizer); EXTRA_PREFER_OFFLINE
 * alone is never relied on. Debug builds can arm a recorded WAV that the next session
 * hands the recognizer through EXTRA_AUDIO_SOURCE (API 33+) instead of the mic, so a
 * proof run feeds speech without playing sound; release builds ignore it.
 */
internal fun finalDictationText(result: String, partial: String): String = result.ifBlank { partial }

object Dictate {
  var emit: ((Map<String, Any?>) -> Unit)? = null

  private var recognizer: SpeechRecognizer? = null
  private var lastPartial = ""
  private var session: String? = null
  private var pending: String? = null
  private var proof: ParcelFileDescriptor? = null
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

  private fun note(msg: String) = Log.i("Ownvoice", "dictate ${SystemClock.elapsedRealtime()} $msg")
  private fun onMain() = Looper.myLooper() === Looper.getMainLooper()
  // The system pack dialog only surfaces from a foreground Activity; log which context each call uses.
  private fun caller(context: Context): Pair<Context, String> {
    val activity = PanelActivity.current
    return if (activity != null) activity to "activity" else context to "react"
  }

  fun available(context: Context): String {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
      return "mic-blocked"
    if (!SpeechRecognizer.isRecognitionAvailable(context)) return "unsupported"
    // On-device enforcement needs the API 31 constructor; older phones cannot do this cut.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "unsupported"
    return try {
      if (recognizer == null) recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      note("available ready main=${onMain()}")
      "ready"
    } catch (e: Exception) {
      Log.w("Ownvoice", "on-device recognizer unavailable", e)
      "unsupported"
    }
  }

  // Fire-and-forget like the kit's consumer port: the support check and download run in the
  // module scope, and a stop/cancel that lands first retires the pending start before it speaks.
  fun start(context: Context, id: String, locale: String, partial: Boolean, punctuation: Boolean) {
    lastPartial = ""
    pending = id
    scope.launch {
      val main = onMain()
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) throw IllegalStateException("unsupported")
        val (caller, via) = caller(context)
        val active = recognizer ?: SpeechRecognizer.createOnDeviceSpeechRecognizer(caller).also { recognizer = it }
        note("start id=$id locale=$locale main=$main via=$via recognizer=${active.hashCode()} proof=${proof != null}")
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
          .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          .putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
          .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partial)
          .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        val checked = checkSupport(active, intent)
        if (pending != id) return@launch
        if (checked != null) {
          note("support installed=${checked.installedOnDeviceLanguages} pending=${checked.pendingOnDeviceLanguages} supported=${checked.supportedOnDeviceLanguages}")
          // The session listens in the same pack tag the panel checks and downloads.
          val tag = packFor(locale, checked)
          intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, tag)
          if (!isInstalled(checked, tag)) {
            note("language missing, triggering download $tag")
            note("download ${download(active, intent)}")
            pending = null
            emit?.invoke(mapOf("id" to id, "type" to "error", "code" to "needs-download"))
            end(id)
            return@launch
          }
        } else {
          note("support check timed out or failed")
        }
        if (pending != id) { closeProof(); return@launch }
        session = id
        pending = null
        active.setRecognitionListener(listener(id))
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
        if (pending == id || session == id) {
          if (pending == id) pending = null
          end(id)
          emit?.invoke(mapOf("id" to id, "type" to "error", "code" to "unsupported"))
        }
      }
    }
  }

  /** Fresh support verdict for the panel's pre-check: ready, needs-download or unknown. */
  suspend fun supportOf(context: Context, locale: String): String {
    try {
      val (caller, via) = caller(context)
      note("support via $via")
      val active = recognizer ?: SpeechRecognizer.createOnDeviceSpeechRecognizer(caller).also { recognizer = it }
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
      val checked = checkSupport(active, intent)
      if (checked == null) { note("support check timed out"); return "unknown" }
      note("support installed=${checked.installedOnDeviceLanguages} pending=${checked.pendingOnDeviceLanguages} supported=${checked.supportedOnDeviceLanguages}")
      return if (isInstalled(checked, packFor(locale, checked))) "ready" else "needs-download"
    } catch (e: Exception) {
      Log.w("Ownvoice", "dictate support failed", e)
      return "unknown"
    }
  }

  /** The exact pack to fetch: the requested tag when downloadable, else the first
   *  supported tag sharing its language (the device may run en-AE while packs ship en-US).
   *  A language with no pack at all passes through, and the caller falls back to the
   *  plain 'can't listen' state when support never arrives. */
  internal fun pickPackTag(locale: String, supported: List<String>): String {
    if (supported.any { it.equals(locale, ignoreCase = true) }) return locale
    val want = locale.substringBefore('-').substringBefore('_')
    return supported.firstOrNull { it.substringBefore('-').substringBefore('_').equals(want, ignoreCase = true) } ?: locale
  }

  private suspend fun bestLanguage(active: SpeechRecognizer, locale: String): String {
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
    return checkSupport(active, intent)?.let { packFor(locale, it) } ?: locale
  }

  /** The one pack tag for [locale] on this phone: the check, the download and the session all use it. */
  private fun packFor(locale: String, support: RecognitionSupport): String =
    pickPackTag(locale, support.supportedOnDeviceLanguages.orEmpty() + support.installedOnDeviceLanguages.orEmpty())

  private fun isInstalled(support: RecognitionSupport, tag: String): Boolean =
    support.installedOnDeviceLanguages.orEmpty().any { it.equals(tag, ignoreCase = true) }

  /** Pack download for [locale]; returns the recognizer's outcome (scheduled, success, error N, timeout)
   *  so the panel can tell an accepted prompt from a declined or failed one. */
  suspend fun downloadPack(context: Context, locale: String): String = withContext(Dispatchers.Main) {
    try {
      val (caller, via) = caller(context)
      note("pack download via $via")
      val active = recognizer ?: SpeechRecognizer.createOnDeviceSpeechRecognizer(caller).also { recognizer = it }
      val target = bestLanguage(active, locale)
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, target)
      note("pack download requested $target")
      download(active, intent).also { note("pack download $it") }
    } catch (e: Exception) {
      Log.w("Ownvoice", "dictate download failed", e)
      "threw ${e.javaClass.simpleName}"
    }
  }

  private suspend fun checkSupport(active: SpeechRecognizer, intent: Intent): RecognitionSupport? =
    withTimeoutOrNull(15000) {
      suspendCancellableCoroutine { cont ->
        active.checkRecognitionSupport(intent, Executor(Runnable::run), object : RecognitionSupportCallback {
          override fun onSupportResult(support: RecognitionSupport) {
            if (cont.isActive) cont.resume(support)
          }
          override fun onError(code: Int) {
            note("support error $code")
            if (cont.isActive) cont.resume(null)
          }
        })
      }
    }

  private suspend fun download(active: SpeechRecognizer, intent: Intent): String =
    withTimeoutOrNull(120000) {
      suspendCancellableCoroutine { cont ->
        try {
          active.triggerModelDownload(intent, Executor(Runnable::run), object : ModelDownloadListener {
            override fun onProgress(percent: Int) {}
            override fun onScheduled() {
              if (cont.isActive) cont.resume("scheduled")
            }
            override fun onSuccess() {
              if (cont.isActive) cont.resume("success")
            }
            override fun onError(code: Int) {
              if (cont.isActive) cont.resume("error $code")
            }
          })
        } catch (e: Exception) {
          if (cont.isActive) cont.resume("threw ${e.javaClass.simpleName}")
        }
      }
    } ?: "timeout"

  fun stop(id: String) {
    // The pending stop settles when onResults/onError emits the final segment or error;
    // an already-ended session answers at once, as does a start that never began.
    if (id != session) {
      if (id == pending) pending = null
      emit?.invoke(mapOf("id" to id, "type" to "stopped"))
    }
    else runCatching { recognizer?.stopListening() }
  }

  fun cancel(id: String) {
    if (id == session) {
      runCatching { recognizer?.cancel() }
      end(id)
    } else if (id == pending) {
      pending = null
    }
  }

  fun teardown() {
    session = null
    pending = null
    scope.coroutineContext.job.cancelChildren()
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
      note("proof armed ${pcm.length()} bytes")
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
    private var rmsLogged = false
    private fun words(bundle: Bundle?): String =
      bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()

    private fun segment(last: Boolean, text: String) {
      emit?.invoke(mapOf("id" to id, "type" to "segment",
        "segment" to mapOf("id" to "0", "text" to text, "final" to last)))
    }

    override fun onReadyForSpeech(bundle: Bundle?) { if (id == session) note("ready main=${onMain()}") }
    override fun onBeginningOfSpeech() { if (id == session) note("speech") }
    override fun onRmsChanged(rms: Float) {
      if (id == session && !rmsLogged) { rmsLogged = true; note("rms $rms") }
    }
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() { if (id == session) note("end-of-speech") }
    override fun onEvent(type: Int, params: Bundle?) {}

    override fun onPartialResults(bundle: Bundle?) {
      if (id != session) return
      val text = words(bundle)
      if (text.isNotBlank()) lastPartial = text
      note("partial ${text.length}")
      segment(false, text)
    }

    override fun onResults(bundle: Bundle?) {
      if (id != session) return
      val text = finalDictationText(words(bundle), lastPartial)
      note("final ${text.length}")
      segment(true, text)
      emit?.invoke(mapOf("id" to id, "type" to "stopped"))
      end(id)
    }

    override fun onError(code: Int) {
      if (id != session) return
      note("error $code")
      // Silence is a retry, not a failure; a missing language pack says so plainly.
      val mapped = when (code) {
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT, SpeechRecognizer.ERROR_NO_MATCH -> null
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "mic-blocked"
        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "needs-download"
        else -> "unsupported"
      }
      if (mapped == null) {
        segment(true, lastPartial)
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
