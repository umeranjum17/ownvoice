package dev.ownvoice.bridge

import android.app.ActivityManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.SamplerConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

class NoSpaceException : IOException("not enough free space for the model file")
class ModelBusyException : IllegalStateException("model download already running")

/**
 * Gemma 4 E2B-it on LiteRT-LM 0.17.1: the fallback on phones without AICore.
 * One-time download from Hugging Face litert-community (Apache-2.0, ungated),
 * pinned to an immutable revision URL and verified by SHA-256 before first use.
 */
internal object LocalGemma {
  internal const val MODEL_FILE = "gemma-4-E2B-it-gpu.litertlm"
  internal const val MODEL_URL =
    "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1/gemma-4-E2B-it-gpu.litertlm"
  // The file's git-LFS oid, which is the SHA-256 of its bytes (paths-info, 29 Sep 2026).
  internal const val MODEL_SHA256 = "a53a59001894c58e6bdb5b9b227709f91a2e3e556baa7d85acf9c55402ba5cf5"
  internal const val MODEL_SIZE = 2008432640L
  // ~8 GB RAM class and ~3 GB free: below that the phone is told it can't, per the captain.
  internal const val MIN_RAM_BYTES = 7_500_000_000L
  internal const val MIN_FREE_BYTES = 3_000_000_000L

  private val downloading = AtomicBoolean(false)
  private val cancelled = AtomicBoolean(false)
  private val activeConnection = AtomicReference<HttpURLConnection?>(null)

  @Volatile private var engine: Engine? = null
  private val initLock = Mutex()

  fun modelFile(context: Context) = File(context.filesDir, MODEL_FILE)

  /** Pure status table: verified file -> available; eligible phone -> downloadable; else unavailable. */
  internal fun selectStatus(fileOk: Boolean, totalMem: Long, freeBytes: Long, abis: Array<String>): String =
    when {
      fileOk -> "available"
      totalMem >= MIN_RAM_BYTES && freeBytes >= MIN_FREE_BYTES &&
        abis.any { it == "arm64-v8a" || it == "x86_64" } -> "downloadable"
      else -> "unavailable"
    }

  internal fun sha256Hex(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

  internal fun fileSha256Hex(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered(1 shl 20).use { input ->
      val buf = ByteArray(1 shl 20)
      while (true) {
        val n = input.read(buf)
        if (n < 0) break
        digest.update(buf, 0, n)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  suspend fun status(context: Context): String {
    if (downloading.get()) return "downloading"
    val file = modelFile(context)
    // Fast path: size match means a download this code verified (marker written after the hash check).
    if (file.exists() && file.length() == MODEL_SIZE) return "available"
    if (file.exists()) file.delete()
    val info = ActivityManager.MemoryInfo()
    context.getSystemService(ActivityManager::class.java).getMemoryInfo(info)
    return selectStatus(false, info.totalMem, context.filesDir.usableSpace, Build.SUPPORTED_ABIS)
  }

  suspend fun download(context: Context, allowMobileData: Boolean, progress: (Float) -> Unit) {
    if (!downloading.compareAndSet(false, true)) throw ModelBusyException()
    cancelled.set(false)
    try {
      withContext(Dispatchers.IO) { downloadBlocking(context, allowMobileData, progress) }
    } finally {
      downloading.set(false)
      activeConnection.getAndSet(null)?.disconnect()
    }
  }

  fun cancelDownload() {
    cancelled.set(true)
    activeConnection.get()?.disconnect()
  }

  fun delete(context: Context) {
    release()
    val dir = context.filesDir
    File(dir, MODEL_FILE).delete()
    File(dir, "$MODEL_FILE.tmp").delete()
    File(dir, "$MODEL_FILE.verified").delete()
  }

  /** Release the GPU/CPU engine when the panel/rewrite screens close; it holds ~1.1-1.4 GB. */
  fun release() {
    val current = engine
    engine = null
    if (current != null) runCatching { current.close() }
  }

  suspend fun ask(context: Context, prompt: String, maxTokens: Int, partial: (String) -> Unit): String =
    generate(context, prompt, SamplerConfig(1, 1.0, 0.0), maxTokens, partial)
      .ifEmpty { throw IllegalStateException("Empty answer") }

  suspend fun draftStream(context: Context, prompt: String, maxTokens: Int, partial: (String) -> Unit): String =
    generate(context, prompt, SamplerConfig(40, 1.0, 0.9), maxTokens, partial)

  suspend fun drafts(context: Context, prompt: String, candidates: Int, maxTokens: Int): List<String> {
    val result = mutableListOf<String>()
    repeat(candidates + 1) {
      if (result.size >= candidates) return result
      val one = try {
        generate(context, prompt, SamplerConfig(40, 1.0, 0.9), maxTokens) {}
      } catch (error: Throwable) {
        if (result.isEmpty() || error is CancellationException) throw error
        return result
      }
      val clean = one.trim().removeSurrounding("\"")
      if (clean.isNotEmpty() && clean !in result) result.add(clean)
    }
    return result
  }

  private suspend fun generate(
    context: Context,
    prompt: String,
    sampler: SamplerConfig,
    maxTokens: Int,
    partial: (String) -> Unit,
  ): String {
    val text = StringBuilder()
    liveEngine(context).createConversation(
      ConversationConfig(samplerConfig = sampler, maxOutputToken = maxTokens),
    ).use { conversation ->
      conversation.sendMessageAsync(prompt).collect { message ->
        val delta = message.contents.contents
          .filterIsInstance<Content.Text>().joinToString("") { it.text }
        if (delta.isNotEmpty()) {
          text.append(delta)
          partial(delta)
        }
      }
    }
    return text.toString().trim()
  }

  private suspend fun liveEngine(context: Context): Engine {
    engine?.let { return it }
    return initLock.withLock {
      engine ?: buildEngine(context).also { engine = it }
    }
  }

  private fun buildEngine(context: Context): Engine {
    val dir = context.filesDir
    ensureVerified(dir, File(dir, MODEL_FILE))
    val cache = File(context.cacheDir, "litertlm").apply { mkdirs() }
    val path = File(dir, MODEL_FILE).absolutePath
    val gpuError = try {
      return Engine(EngineConfig(
        modelPath = path, backend = Backend.GPU(), maxNumTokens = 4096, cacheDir = cache.absolutePath,
      )).also { it.initialize() }
    } catch (error: Throwable) {
      if (error is CancellationException) throw error
      Log.w(OwnvoiceService.TAG, "GPU engine failed, falling back to CPU", error)
      error
    }
    try {
      return Engine(EngineConfig(
        modelPath = path, backend = Backend.CPU(6), maxNumTokens = 4096, cacheDir = cache.absolutePath,
      )).also { it.initialize() }
    } catch (error: Throwable) {
      if (error is CancellationException) throw error
      throw UnsupportedOperationException("model failed to start", error).also {
        it.addSuppressed(gpuError)
      }
    }
  }

  /** The SHA-256 gate: a wrong-sized file is deleted outright; a right-sized one is hashed once. */
  private fun ensureVerified(dir: File, file: File) {
    if (!file.exists()) throw UnsupportedOperationException("model file missing")
    if (file.length() != MODEL_SIZE) {
      file.delete()
      throw UnsupportedOperationException("model file incomplete")
    }
    if (File(dir, "$MODEL_FILE.verified").exists()) return
    if (!MODEL_SHA256.equals(fileSha256Hex(file), ignoreCase = true)) {
      file.delete()
      throw UnsupportedOperationException("model file failed check")
    }
    File(dir, "$MODEL_FILE.verified").writeText(MODEL_SHA256)
  }

  private fun downloadBlocking(context: Context, allowMobileData: Boolean, progress: (Float) -> Unit) {
    val dir = context.filesDir
    val file = File(dir, MODEL_FILE)
    if (file.exists() && file.length() == MODEL_SIZE) {
      progress(1f)
      return
    }
    if (!allowMobileData) requireWifi(context)
    val tmp = File(dir, "$MODEL_FILE.tmp")
    var done = if (tmp.exists()) tmp.length() else 0L
    var connection = openConnection(done)
    activeConnection.set(connection)
    try {
      if (done > 0 && connection.responseCode != HttpURLConnection.HTTP_PARTIAL) {
        tmp.delete()
        done = 0L
        connection.disconnect()
        connection = openConnection(0)
        activeConnection.set(connection)
      }
      val code = connection.responseCode
      if (code != HttpURLConnection.HTTP_OK && code != HttpURLConnection.HTTP_PARTIAL) {
        throw IOException("model download HTTP $code")
      }
      val remaining = connection.contentLengthLong
      val total = if (remaining >= 0) done + remaining else MODEL_SIZE
      if (dir.usableSpace < total - done) throw NoSpaceException()
      connection.inputStream.buffered().use { input ->
        RandomAccessFile(tmp, "rw").use { out ->
          out.seek(done)
          val buf = ByteArray(1 shl 20)
          var read = done
          while (true) {
            if (cancelled.get()) throw CancellationException("model download cancelled")
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            read += n
            if (total > 0) progress((read.toFloat() / total).coerceIn(0f, 1f))
          }
        }
      }
      if (tmp.length() != MODEL_SIZE) throw IOException("model download short: ${tmp.length()}")
      if (!MODEL_SHA256.equals(fileSha256Hex(tmp), ignoreCase = true)) {
        tmp.delete()
        throw IOException("model file failed check")
      }
      tmp.renameTo(file)
      File(dir, "$MODEL_FILE.verified").writeText(MODEL_SHA256)
      progress(1f)
    } finally {
      connection.disconnect()
    }
  }

  private fun openConnection(from: Long): HttpURLConnection {
    val connection = URL(MODEL_URL).openConnection() as HttpURLConnection
    connection.connectTimeout = 15000
    connection.readTimeout = 30000
    connection.instanceFollowRedirects = true
    connection.setRequestProperty("User-Agent", "Ownvoice/1 (one-time model download)")
    if (from > 0) connection.setRequestProperty("Range", "bytes=$from-")
    return connection
  }

  private fun requireWifi(context: Context) {
    val manager = context.getSystemService(ConnectivityManager::class.java)
    val wifi = manager.getNetworkCapabilities(manager.activeNetwork)
      ?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    if (!wifi) throw IOException("model download needs Wi-Fi")
  }
}
