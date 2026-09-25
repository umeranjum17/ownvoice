package dev.ownvoice.app

import android.util.Log
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.common.GenAiException.ErrorCode
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The model behind drafts, scores and rewrites. Tests swap in a stub. */
interface DraftEngine {
    /** Two or three varied reply drafts for what is on screen, following the user's rules in [guide] (may be empty). */
    suspend fun drafts(conversation: String, guide: String, status: (String) -> Unit): List<String>

    /** One steady answer (temperature 0) to [prompt], for judging and rewriting. */
    suspend fun ask(prompt: String, maxTokens: Int): String

    /** Makes sure the model is on the phone, reporting any download through [status] and [progress] (0 to 1). */
    suspend fun ensureReady(status: (String) -> Unit, progress: (Float) -> Unit = {}) {}
}

/** A failure with a message meant for the user as is. */
class PlainError(message: String) : Exception(message)

/** Gemini Nano on the phone, through ML Kit GenAI. Nothing leaves the device. */
object Nano : DraftEngine {
    private val model by lazy { Generation.getClient() }

    override suspend fun drafts(conversation: String, guide: String, status: (String) -> Unit): List<String> {
        ensureReady(status)
        status("Writing…")
        val request = generateContentRequest(TextPart(prompt(conversation, guide))) {
            temperature = 0.9f
            topK = 40
            candidateCount = 3
            maxOutputTokens = 120
        }
        // ML Kit drops duplicate candidates, which can leave a single draft, so ask once more.
        val drafts = mutableListOf<String>()
        repeat(2) {
            if (drafts.size >= 2) return@repeat
            plain { model.generateContent(request) }.candidates
                .map { it.text.trim().removeSurrounding("\"") }
                .forEach { if (it.isNotEmpty() && it !in drafts) drafts += it }
        }
        return drafts.take(3)
    }

    override suspend fun ask(prompt: String, maxTokens: Int): String {
        ensureReady({})
        val request = generateContentRequest(TextPart(prompt)) {
            temperature = 0f
            topK = 1
            maxOutputTokens = maxTokens
        }
        return plain { model.generateContent(request) }.candidates.firstOrNull()?.text?.trim().orEmpty()
    }

    /** Checks the model and, if needed, downloads it while reporting progress. */
    override suspend fun ensureReady(status: (String) -> Unit, progress: (Float) -> Unit) = plain {
        val state = model.checkStatus()
        Log.i(OwnvoiceService.TAG, "model status $state")
        when (state) {
            FeatureStatus.AVAILABLE -> return@plain
            FeatureStatus.UNAVAILABLE -> throw PlainError(UNSUPPORTED)
        }
        status(GETTING_READY)
        coroutineScope {
            val download = launch {
                var total = 0L
                model.download().collect {
                    when (it) {
                        is DownloadStatus.DownloadStarted -> total = it.bytesToDownload
                        is DownloadStatus.DownloadProgress -> if (total > 0) progress(it.totalBytesDownloaded.toFloat() / total)
                        is DownloadStatus.DownloadFailed -> throw PlainError("Couldn't finish getting Ownvoice ready. ${explain(it.e)}")
                        DownloadStatus.DownloadCompleted -> status("All set.")
                    }
                }
            }
            // On a OnePlus 13 the download flow never reported completion, so also poll the status.
            while (true) {
                when (model.checkStatus()) {
                    FeatureStatus.AVAILABLE -> break
                    FeatureStatus.UNAVAILABLE -> throw PlainError(UNSUPPORTED)
                }
                delay(5_000)
            }
            download.cancel()
        }
    }

    private suspend fun <T> plain(block: suspend () -> T): T = try {
        block()
    } catch (e: GenAiException) {
        throw PlainError(explain(e))
    }

    /** Plain words for the user; the details go to the log. */
    fun explain(e: GenAiException): String = message(e.errorCode)
        .also { Log.w(OwnvoiceService.TAG, "model error ${e.errorCode}: ${e.message}") }

    fun message(errorCode: Int): String = when (errorCode) {
        ErrorCode.BUSY -> "Your phone is busy. Try again in a moment."
        ErrorCode.PER_APP_BATTERY_USE_QUOTA_EXCEEDED -> "Ownvoice needs a short break. Try again in a little while."
        ErrorCode.BACKGROUND_USE_BLOCKED -> "Open Ownvoice again and try once more."
        ErrorCode.NOT_ENOUGH_DISK_SPACE -> "Your phone needs a bit more free space to get Ownvoice ready."
        ErrorCode.REQUEST_TOO_LARGE -> "That chat is too long. Scroll to the latest messages and tap again."
        ErrorCode.NOT_SUPPORTED, ErrorCode.NOT_AVAILABLE, ErrorCode.AICORE_INCOMPATIBLE -> UNSUPPORTED
        ErrorCode.NEEDS_SYSTEM_UPDATE -> "Your phone needs an update first. Open Settings › System updates, then try again."
        else -> "Something went wrong. Try again."
    }

    const val GETTING_READY = "Getting Ownvoice ready… this happens once."

    const val UNSUPPORTED = "Sorry, Ownvoice doesn't work on this phone yet."

    private fun prompt(conversation: String, guide: String) = buildString {
        append("You help someone reply in a chat. Below is the text visible on their screen; it may include app labels.\n")
        append("Write one short, natural reply they could send next, in the conversation's language and tone. ")
        if (guide.isNotEmpty()) append("Follow their rules: ").append(guide).append(' ')
        append("Output only the reply text.\n\nScreen:\n")
        append(conversation.takeLast(3000))
    }
}
