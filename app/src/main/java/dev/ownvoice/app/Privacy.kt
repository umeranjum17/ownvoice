package dev.ownvoice.app

import android.content.Context

/**
 * The privacy controls, kept on the phone in plain SharedPreferences: the pause switch, the per-app
 * switches, and the log of what each bubble tap read (a summary, not the text), kept for 30 days.
 */
object Privacy {
    /** Apps where the bubble works until the user says otherwise: X, LinkedIn, Slack, Gmail and WhatsApp. Every other app starts off. */
    val DEFAULT_ON = setOf("com.twitter.android", "com.linkedin.android", "com.Slack", "com.google.android.gm", "com.whatsapp", "com.whatsapp.w4b")
    /**
     * Apps whose screen may go to the person's own computer once one is paired, until they say otherwise:
     * X, LinkedIn and Reddit. Slack, email, personal chats and every other app stay on the phone.
     */
    val COMPUTER_DEFAULT_ON = setOf("com.twitter.android", "com.linkedin.android", "com.reddit.frontpage")
    const val KEEP_MS = 30L * 24 * 60 * 60 * 1000

    /** One bubble tap: when, in which app, and how much it read. */
    data class Read(val time: Long, val app: String, val label: String, val summary: String) {
        fun encode() = listOf(time.toString(), app, label, summary).joinToString("\t") { it.replace(Regex("[\t\n\r]"), " ") }

        companion object {
            fun decode(line: String): Read? {
                val f = line.split("\t")
                return if (f.size == 4) f[0].toLongOrNull()?.let { Read(it, f[1], f[2], f[3]) } else null
            }
        }
    }

    /** Whether the bubble works in [app]: the user's own choice for it, or else the default list. */
    fun allowed(app: String, choice: Boolean?) = choice ?: (app in DEFAULT_ON)

    /** Whether [app]'s screen may go to the person's own computer: their choice for it, or else the default list. */
    fun mayGoToComputer(app: String, choice: Boolean?) = choice ?: (app in COMPUTER_DEFAULT_ON)

    /** The reads younger than 30 days at [now]. */
    fun keep(reads: List<Read>, now: Long) = reads.filter { now - it.time < KEEP_MS }

    /** What Ownvoice did and what it looked at, in plain words, never any of the text. */
    fun summary(mode: Judge.Mode, conversation: String, typed: String) = summary(mode, conversation.isNotBlank(), typed.isNotBlank())

    private fun summary(mode: Judge.Mode, screen: Boolean, typed: Boolean): String {
        val ran = when (mode) {
            Judge.Mode.REPLY -> "Suggested replies"
            Judge.Mode.COMPOSE -> "Polished your message"
            Judge.Mode.EMPTY -> "Nothing to help with"
        }
        val read = listOfNotNull("the chat on screen".takeIf { screen }, "your message".takeIf { typed })
        return "$ran. " + if (read.isEmpty()) "Nothing was on screen." else "Read ${read.joinToString(" and ")}."
    }

    private val OLD = Regex("^(Reply drafts|Compose boost|Nothing to work on)\\. (\\d+) characters on screen, (\\d+) in your field\\.$")

    /** An entry logged before summaries were plain words ("Reply drafts. 117 characters on screen, …"), as it reads now. */
    fun plain(summary: String): String {
        val m = OLD.find(summary) ?: return summary
        val mode = when (m.groupValues[1]) { "Reply drafts" -> Judge.Mode.REPLY; "Compose boost" -> Judge.Mode.COMPOSE; else -> Judge.Mode.EMPTY }
        return summary(mode, m.groupValues[2] != "0", m.groupValues[3] != "0")
    }

    // Writes use commit(): they are tiny, and a switch or wipe must not be lost if the process dies right after.
    private fun prefs(context: Context) = context.getSharedPreferences("privacy", Context.MODE_PRIVATE)

    fun paused(context: Context) = prefs(context).getBoolean("paused", false)

    /** Whether the three setup steps were finished or skipped with "Not now". */
    fun setUp(context: Context) = prefs(context).getBoolean("setUp", false)

    fun setSetUp(context: Context) {
        prefs(context).edit().putBoolean("setUp", true).commit()
    }

    /** True once: the first time the bubble shows, it says what it does. */
    fun firstBubble(context: Context): Boolean {
        if (prefs(context).getBoolean("bubbleTip", false)) return false
        prefs(context).edit().putBoolean("bubbleTip", true).commit()
        return true
    }

    fun setPaused(context: Context, paused: Boolean) {
        prefs(context).edit().putBoolean("paused", paused).commit()
        OwnvoiceService.instance?.updateBubble()
    }

    fun allowed(context: Context, app: String) = prefs(context).let { allowed(app, if (it.contains("app:$app")) it.getBoolean("app:$app", false) else null) }

    fun setAllowed(context: Context, app: String, on: Boolean) {
        prefs(context).edit().putBoolean("app:$app", on).commit()
        OwnvoiceService.instance?.updateBubble()
    }

    fun mayGoToComputer(context: Context, app: String) =
        prefs(context).let { mayGoToComputer(app, if (it.contains("computer:$app")) it.getBoolean("computer:$app", false) else null) }

    fun setMayGoToComputer(context: Context, app: String, on: Boolean) {
        prefs(context).edit().putBoolean("computer:$app", on).commit()
    }

    /** Whether the bubble shows and may read in [app] right now. */
    fun on(context: Context, app: String?) = app != null && !paused(context) && allowed(context, app)

    /** The log, newest first, after dropping anything older than 30 days. */
    fun reads(context: Context, now: Long = System.currentTimeMillis()): List<Read> {
        val all = prefs(context).getString("reads", "").orEmpty().lines().mapNotNull(Read::decode)
        val kept = keep(all, now)
        if (kept.size != all.size) save(context, kept)
        return kept.sortedByDescending { it.time }
    }

    fun record(context: Context, read: Read) = save(context, keep(reads(context, read.time) + read, read.time))

    /** Adds who wrote the drafts to the read logged at [time], for example "Sent to your computer, which wrote the drafts." */
    fun noteWriter(context: Context, time: Long, note: String) {
        val all = reads(context)
        if (all.any { it.time == time }) save(context, all.map { if (it.time == time) it.copy(summary = "${it.summary} $note") else it })
    }

    /** Deletes the log, Your voice, and anything read or drafted that is still held in memory. */
    fun wipe(context: Context) {
        prefs(context).edit().remove("reads").commit()
        Voice.wipe(context)
        OwnvoiceService.instance?.forget()
    }

    private fun save(context: Context, reads: List<Read>) {
        prefs(context).edit().putString("reads", reads.sortedBy { it.time }.joinToString("\n") { it.encode() }).commit()
    }
}
