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
    /** Two or three varied reply drafts for what is on screen. */
    suspend fun drafts(conversation: String, typed: String, status: (String) -> Unit): List<String>

    /** One steady answer (temperature 0) to [prompt], for judging and rewriting. */
    suspend fun ask(prompt: String, maxTokens: Int): String
}

/** A failure with a message meant for the user as is. */
class PlainError(message: String) : Exception(message)

/** Gemini Nano on the phone, through ML Kit GenAI. Nothing leaves the device. */
object Nano : DraftEngine {
    private val model by lazy { Generation.getClient() }

    override suspend fun drafts(conversation: String, typed: String, status: (String) -> Unit): List<String> {
        ensureReady(status)
        status("Drafting on this phone…")
        val request = generateContentRequest(TextPart(prompt(conversation, typed))) {
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
        ensureReady {}
        val request = generateContentRequest(TextPart(prompt)) {
            temperature = 0f
            topK = 1
            maxOutputTokens = maxTokens
        }
        return plain { model.generateContent(request) }.candidates.firstOrNull()?.text?.trim().orEmpty()
    }

    /** Checks the model and, if needed, downloads it while reporting progress. */
    suspend fun ensureReady(status: (String) -> Unit) = plain {
        val state = model.checkStatus()
        Log.i(OwnvoiceService.TAG, "model status $state")
        when (state) {
            FeatureStatus.AVAILABLE -> return@plain
            FeatureStatus.UNAVAILABLE -> throw PlainError(UNSUPPORTED)
        }
        status("Downloading the on-device model…")
        coroutineScope {
            val download = launch {
                model.download().collect {
                    when (it) {
                        is DownloadStatus.DownloadStarted -> status("Downloading the on-device model (${mb(it.bytesToDownload)} MB)…")
                        is DownloadStatus.DownloadProgress -> status("Downloading the on-device model: ${mb(it.totalBytesDownloaded)} MB so far…")
                        is DownloadStatus.DownloadFailed -> throw PlainError("The model download failed: ${explain(it.e)}")
                        DownloadStatus.DownloadCompleted -> status("Model downloaded.")
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

    suspend fun modelName(): String = plain { model.getBaseModelName() }

    private suspend fun <T> plain(block: suspend () -> T): T = try {
        block()
    } catch (e: GenAiException) {
        throw PlainError(explain(e))
    }

    fun explain(e: GenAiException): String = when (e.errorCode) {
        ErrorCode.BUSY -> "The on-device model is busy. Try again in a moment."
        ErrorCode.PER_APP_BATTERY_USE_QUOTA_EXCEEDED -> "Ownvoice has used up the phone's on-device AI quota for now. Try again later."
        ErrorCode.BACKGROUND_USE_BLOCKED -> "Android only lets the on-device model run for the app in front."
        ErrorCode.NOT_ENOUGH_DISK_SPACE -> "Not enough free storage to download the on-device model."
        ErrorCode.REQUEST_TOO_LARGE -> "The conversation is too long for the on-device model."
        ErrorCode.NOT_SUPPORTED, ErrorCode.NOT_AVAILABLE, ErrorCode.AICORE_INCOMPATIBLE -> UNSUPPORTED
        ErrorCode.NEEDS_SYSTEM_UPDATE -> "Update Android System and AICore, then try again."
        else -> e.message ?: "The on-device model failed (error ${e.errorCode})."
    }

    private fun mb(bytes: Long) = bytes / 1_000_000

    private const val UNSUPPORTED = "This phone can't run Gemini Nano on device yet, so Ownvoice can't draft here."

    private fun prompt(conversation: String, typed: String) = buildString {
        append("You help someone reply in a chat. Below is the text visible on their screen; it may include app labels.\n")
        append("Write one short, natural reply they could send next, in the conversation's language and tone. ")
        append("Output only the reply text.\n\nScreen:\n")
        append(conversation.takeLast(3000))
        if (typed.isNotBlank()) append("\n\nThey have started typing: ").append(typed).append("\nFinish or improve it.")
    }
}
