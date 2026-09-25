package dev.ownvoice.app

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withTimeoutOrNull

/** Where a set of drafts was written, as the drafts panel says it under each one. */
enum class Writer(val caption: String) {
    PHONE("Written on this phone"),
    COMPUTER("Written on your computer"),
}

/**
 * Reply drafts from the person's own computer, with [fallback] (the phone's own model) writing them
 * whenever the computer can't: it's off, out of reach, at its limit or too slow. Scoring always stays
 * on the phone with [fallback], so a computer draft is judged by a different model than the one that wrote it.
 */
class Computer(
    private val fallback: DraftEngine,
    private val timeoutMs: Long = 15_000,
    private val write: (conversation: String, guide: String) -> List<String>,
) : DraftEngine {
    /** Who wrote the last drafts. */
    var wrote = Writer.PHONE
        private set

    /** Why the computer didn't write the last drafts, and whether the phone did, in plain words; null when the computer wrote them. */
    var why: String? = null
        private set

    override suspend fun drafts(conversation: String, guide: String, status: (String) -> Unit): List<String> {
        status("Your computer is writing…")
        // A computer that stops answering is left to time out on its own; the phone writes meanwhile.
        val call = CoroutineScope(Dispatchers.IO).async { runCatching { write(conversation, guide) } }
        val result = withTimeoutOrNull(timeoutMs) { call.await() }
        val texts = result?.getOrNull()
        if (texts != null) {
            wrote = Writer.COMPUTER
            why = null
            return texts
        }
        call.cancel()
        wrote = Writer.PHONE
        why = reason(if (result == null) "unreachable" else (result.exceptionOrNull() as? Link.Failure)?.code ?: "failed")
        // Only say the phone wrote them once it has; a phone that can't write throws past this.
        return fallback.drafts(conversation, guide, status).also { why = "$why This phone wrote these instead." }
    }

    override suspend fun ask(prompt: String, maxTokens: Int) = fallback.ask(prompt, maxTokens)

    override suspend fun ensureReady(status: (String) -> Unit) = fallback.ensureReady(status)

    companion object {
        /** Why the computer didn't write, for the drafts panel. */
        fun reason(code: String) = when (code) {
            "unreachable", "timeout" -> "Your computer didn't answer."
            "limit" -> "Your computer has reached its limit for now."
            "busy" -> "Your computer was still busy with the last one."
            "not_paired" -> "Your computer doesn't know this phone any more. Pair again on the main screen."
            else -> "Your computer couldn't write this one."
        }

        /** Whether [app]'s screen may go to the computer on this tap: it's allowed for [app], or the person asked for this one. */
        fun wanted(context: Context, app: String, anyway: Boolean) = Link.computerWrites(context) && (anyway || Privacy.mayGoToComputer(context, app))

        /**
         * The engine for one reply: the computer when [wanted], else the phone's own [phone] engine. The computer
         * also gets the never-say list, which the phone's model leaves out to stay fast.
         */
        fun pick(context: Context, app: String, anyway: Boolean, phone: DraftEngine): DraftEngine {
            if (!wanted(context, app, anyway)) return phone
            val never = Voice.rules(context).never
            return Computer(phone) { conversation, guide -> Link.write(context, conversation, withNever(guide, never), readMs = 20_000) }
        }

        /** [guide] with as many whole never-say phrases as fit the computer's limit, so none is cut mid-way. */
        fun withNever(guide: String, never: List<String>): String {
            var kept = never
            fun full() = if (kept.isEmpty()) guide else "$guide Never say: ${kept.joinToString("; ")}.".trim()
            while (full().length > Link.MAX_GUIDE && kept.isNotEmpty()) kept = kept.dropLast(1)
            return full()
        }
    }
}
