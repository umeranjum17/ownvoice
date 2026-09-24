package dev.ownvoice.app

/**
 * Prompts for the on-device judge and parsers for its answers. The judge is the same model that
 * wrote the drafts, which favours its own writing, so the score details say so.
 */
object Judge {
    /** One line of a score's reasons. */
    data class Check(val name: String, val ok: Boolean, val reason: String)

    /** The three scores of one draft, each kept on its own. */
    class Scores(val hits: List<Slop.Hit>, val generic: Int?, val specific: Int?, val quality: List<Check>, val reach: List<Check>, val message: Boolean) {
        val slop get() = Slop.score(hits.size, generic, specific)
    }

    const val SAME_MODEL = "Scored by the same on-device model that wrote it, which tends to like its own writing."

    private val QUALITY = listOf(
        "SPECIFIC" to "Specific", "CLEAR" to "Clear", "VOICE" to "Sounds like you", "FITS" to "Fits the thread", "CLAIMS" to "Claims",
    )
    private val REACH = listOf("CONVERSATION" to "Starts a conversation", "NOT_INTERESTED" to "Not-interested risk", "HOOK" to "Hook")
    private val RESPONSE = listOf("ANSWERS" to "Answers every question", "NEXT_STEP" to "Clear next step")

    fun kindPrompt(conversation: String) = buildString {
        append("Below is the text on someone's phone screen. Which kind of screen is it?\n")
        append("MESSAGE: a private chat or direct message between a few people, or an email.\n")
        append("POST: a public post, feed or comment thread that many people read; it often shows @handles, ")
        append("likes, reposts, comment counts or times like 2h.\n\nScreen:\n")
        append(conversation.takeLast(1500))
        append("\n\nAnswer with one word: MESSAGE or POST.")
    }

    fun isMessage(answer: String) = "MESSAGE" in answer.uppercase()

    fun draftPrompt(conversation: String, draft: String, message: Boolean, guide: String = "") = buildString {
        append("You check a reply draft before someone sends it. Be strict, and brief. Casual tone, typos and bluntness are fine.\n\n")
        append("Screen (the conversation, may include app labels):\n").append(conversation.takeLast(2000))
        append("\n\nDraft reply:\n").append(draft)
        if (guide.isNotEmpty()) append("\n\nThe person's own writing rules: ").append(guide)
        append("\n\nAnswer in exactly these lines and nothing else. Each check line is pass or concern, a dash, and at most 8 words.\n")
        append("GENERIC: 0-10 (10 = could be sent to anyone about anything)\n")
        append("SPECIFICITY: 0-10 (10 = concrete details from this conversation)\n")
        append("SPECIFIC: pass or concern - does it say something concrete?\n")
        append("CLEAR: pass or concern - does it make one clear point?\n")
        append("VOICE: pass or concern - does it match how the person writes on screen")
        append(if (guide.isNotEmpty()) " and follow their rules?\n" else "?\n")
        append("FITS: pass or concern - does its length and tone fit this thread?\n")
        append("CLAIMS: pass or concern - concern if it states facts about the writer, numbers, plans or products the screen doesn't support\n")
        if (message) {
            append("ANSWERS: pass or concern - does it answer every question asked?\n")
            append("NEXT_STEP: pass or concern - is the next step or time clear?\n")
        } else {
            append("CONVERSATION: pass or concern - would people want to reply to it?\n")
            append("NOT_INTERESTED: pass or concern - concern if readers may find it off-putting, salesy or irrelevant\n")
            append("HOOK: pass or concern - does its first line make people read on?\n")
        }
    }

    /** [post] is true for a fresh post rather than a reply, where the statement-endings rule applies. */
    fun scoreDraft(draft: String, answer: String?, message: Boolean, voice: Voice.Rules = Voice.Rules(), post: Boolean = false): Scores {
        val lines = answer?.let(::parse).orEmpty()
        val hits = Slop.hits(draft, voice, post && !message)
        val broken = Voice.broken(hits, draft, voice)
        // The user's own rules decide "sounds like you" whatever the judge says.
        val quality = checks(lines, QUALITY).filter { !(broken.isNotEmpty() && it.name == "Sounds like you") }.toMutableList()
        if (broken.isNotEmpty()) quality.add(QUALITY.indexOfFirst { it.first == "VOICE" }.coerceAtMost(quality.size),
            Check("Sounds like you", false, "Breaks your rules: " + broken.joinToString("; ") + "."))
        val reach = checks(lines, if (message) RESPONSE else REACH).toMutableList()
        if (!message) {
            if (Regex("https?://|www\\.").containsMatchIn(draft)) reach += Check("Links", false, "Has a link; feeds may show it to fewer people.")
            reach += if (draft.length > 280) Check("Length", false, "Long for a reply (${draft.length} characters).")
            else Check("Length", true, "Short enough for a reply.")
        }
        return Scores(hits, number(lines["GENERIC"]), number(lines["SPECIFICITY"]), quality, reach, message)
    }

    enum class Rewrite(val label: String, val ask: String) {
        TIGHTEN("Tighten", "Make it shorter and tighter. Cut filler, keep every point"),
        PLAINER("Plainer", "Say it in plainer, simpler words"),
        GRAMMAR("Fix grammar", "Fix only spelling, grammar and punctuation. Change nothing else"),
    }

    /** Compose boost: improved versions of what the user wrote in the field. */
    enum class Boost(val label: String, val ask: String) {
        TIGHTER("Tighter", "Make it tighter: cut filler and repeated words, keep every point"),
        PLAINER("Plainer and more like you", "Use plainer, everyday words, the way the writer talks, and keep their casing, slang and quirks"),
        DETAIL("Lead with a specific detail", "Start with the most specific, concrete detail already in the text. Don't invent details"),
    }

    /** What a bubble tap offers: better versions of the user's own text, replies to the screen, or neither. */
    enum class Mode { COMPOSE, REPLY, EMPTY }

    const val WRITE_FIRST = "Write a line or two first - Ownvoice improves what you wrote; it doesn't invent a post"

    /**
     * [typed] is the field's own text (not its hint); [written] is the text on screen outside any field
     * and without button labels. Own text is always boosted rather than replaced by a new draft.
     */
    fun mode(typed: String, written: String) = when {
        typed.isNotBlank() -> Mode.COMPOSE
        replying(written) -> Mode.REPLY
        else -> Mode.EMPTY
    }

    /** Whether the screen shows something to reply to; own text on a screen without it is a fresh post. */
    // ponytail: a line of 4+ words counts as something to reply to, so short labels like "Everyone can reply"
    // don't; misses chats of only one-to-three-word messages and scripts written without spaces.
    fun replying(written: String) = written.lines().any { it.trim().split(Regex("\\s+")).size >= 4 }

    fun rewritePrompt(text: String, ask: String, guide: String = "") = buildString {
        append("Rewrite the text below. ").append(ask).append(". Keep its meaning, facts, language and tone. ")
        if (guide.isNotEmpty()) append("Follow the writer's rules: ").append(guide).append(' ')
        append("Don't add anything new. Output only the rewritten text.\n\nText:\n").append(text)
    }

    fun rewriteCheckPrompt(original: String, rewrite: String) = buildString {
        append("Compare a rewrite with its original. Be strict, and brief.\n\nOriginal:\n").append(original)
        append("\n\nRewrite:\n").append(rewrite)
        append("\n\nAnswer in exactly these lines and nothing else.\n")
        append("GENERIC: 0-10 (10 = the rewrite could be sent to anyone about anything)\n")
        append("SPECIFICITY: 0-10 (10 = the rewrite has concrete details)\n")
        append("MEANING: pass or concern - concern if the rewrite adds, drops or changes a claim, fact, number or promise; at most 10 words\n")
    }

    /** The meaning check of a rewrite: the judge's view plus any number it made up. */
    fun meaning(original: String, rewrite: String, answer: String?): Check {
        val added = Slop.addedNumbers(original, rewrite).takeIf { it.isNotEmpty() }?.let { "Adds ${it.joinToString()} not in your text." }
        val dropped = Slop.addedNumbers(rewrite, original).takeIf { it.isNotEmpty() }?.let { "Drops ${it.joinToString()} from your text." }
        if (added != null || dropped != null) return Check("Meaning", false, listOfNotNull(added, dropped).joinToString(" "))
        return checks(answer?.let(::parse).orEmpty(), listOf("MEANING" to "Meaning")).firstOrNull()
            ?: Check("Meaning", true, "No numbers added or dropped. The model couldn't check the rest.")
    }

    /** Drops a "Here's the rewrite:" line and wrapping quotes the model sometimes adds. */
    fun clean(text: String): String {
        val lines = text.trim().lines()
        val body = if (lines.size > 1 && lines[0].trim().endsWith(':') && lines[0].trim().startsWith("Here", ignoreCase = true)) lines.drop(1) else lines
        return body.joinToString("\n").trim().removeSurrounding("\"").trim()
    }

    /** Reads "KEY: value" lines, tolerating markdown the model adds. */
    fun parse(answer: String): Map<String, String> = answer.lines().mapNotNull { line ->
        val m = Regex("^[\\s*#>•-]*([A-Za-z_ ]+?)[*\\s]*:[*\\s]*(.+)$").find(line) ?: return@mapNotNull null
        m.groupValues[1].trim().uppercase().replace(' ', '_') to m.groupValues[2].trim()
    }.toMap()

    private fun checks(lines: Map<String, String>, keys: List<Pair<String, String>>) = keys.mapNotNull { (key, name) ->
        val value = lines[key] ?: return@mapNotNull null
        val verdict = Regex("^[\\s–—-]*(pass|concern)\\b[\\s:,.;–—-]*", RegexOption.IGNORE_CASE).find(value) ?: return@mapNotNull null
        val ok = verdict.groupValues[1].equals("pass", ignoreCase = true)
        val reason = value.substring(verdict.range.last + 1).trim().ifEmpty { if (ok) "Looks fine." else "Worth a look." }
        Check(name, ok, reason.replaceFirstChar { it.uppercase() })
    }

    fun number(value: String?) = value?.let { Regex("\\d+").find(it)?.value?.toIntOrNull()?.coerceIn(0, 10) }
}
