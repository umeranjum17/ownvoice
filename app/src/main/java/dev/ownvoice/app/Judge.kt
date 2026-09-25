package dev.ownvoice.app

/**
 * Prompts for the on-device judge and parsers for its answers, turned into plain words for the user.
 * The judge is the same model that wrote the drafts, which favours its own writing; the README says so,
 * and the "Why?" note calls the checks quick checks to help choose.
 */
object Judge {
    /** One line of a score's reasons; [name] already says pass or concern in plain words. */
    data class Check(val name: String, val ok: Boolean, val reason: String)

    /** The one sentence under a draft: [lead] in bold, then [rest]; [good] draws a green dot, else amber. */
    data class Verdict(val good: Boolean, val lead: String, val rest: String = "")

    /** The three scores of one draft, each kept on its own. */
    class Scores(val hits: List<Slop.Hit>, val generic: Int?, val specific: Int?, val quality: List<Check>, val reach: List<Check>, val message: Boolean) {
        val slop get() = Slop.score(hits.size, generic, specific)
    }

    /** A judge line [key] and its plain names when it passes and when it needs a look. */
    private class Kind(val key: String, val pass: String, val concern: String)

    private val VOICE = Kind("VOICE", "Sounds like you", "Doesn't sound like you")
    private val QUALITY = listOf(
        Kind("SPECIFIC", "Says something real", "Could be more specific"),
        Kind("CLEAR", "One clear point", "The point isn't clear"),
        VOICE,
        Kind("FITS", "Fits the conversation", "Doesn't quite fit the conversation"),
        Kind("CLAIMS", "Doesn't make anything up", "Might make something up"),
    )
    private val REACH = listOf(
        Kind("CONVERSATION", "Invites replies", "Doesn't invite replies"),
        Kind("NOT_INTERESTED", "Won't put people off", "Might put people off"),
        Kind("HOOK", "Strong first line", "Weak first line"),
    )

    private fun response(who: String?) = listOf(
        Kind("ANSWERS", "Answers ${who ?: "the question"}", "Doesn't answer ${who ?: "everything asked"}"),
        Kind("NEXT_STEP", "Clear what happens next", "Not clear what happens next"),
    )

    const val GENERAL = "A bit general"

    /** Footer of every "Why?" note. */
    /** Added to [quickChecks] when the person's computer wrote the draft and this phone checked it. */
    const val CROSS_CHECK = " Your computer wrote this and this phone checked it, so the check isn't marking its own work."

    /** What the "Why?" note adds about who checked whose work: this phone always checks. */
    fun checkedBy(writer: Writer) = if (writer == Writer.COMPUTER) CROSS_CHECK else ""

    fun quickChecks(who: String?) = "These are quick checks to help you choose." + (who?.let { " You know $it best." } ?: "")

    /**
     * The one other person in a chat shown as "Name: message" lines, or null when there isn't exactly one.
     * ponytail: needs two lines from them, so a single "Update: shipped" isn't taken for a name; chats that
     * show names above messages rather than before them get no name.
     */
    fun who(conversation: String): String? =
        Regex("^\\s*(\\p{Lu}[\\p{L}'’-]{0,20}):\\s+\\S", RegexOption.MULTILINE).findAll(conversation)
            .map { it.groupValues[1] }.filter { it !in setOf("You", "Me") }.groupingBy { it }.eachCount()
            .filterValues { it >= 2 }.keys.singleOrNull()

    /**
     * One plain sentence for a scored text: "Sounds natural and answers Sam" when all is well, the first
     * thing worth a look otherwise, and "A bit stock: 2 phrases you could say more simply" for stock phrasing.
     */
    fun verdict(s: Scores): Verdict {
        val concern = (s.quality + if (s.message) s.reach else emptyList()).firstOrNull { !it.ok }
        val lead = Slop.words(s.slop)
        if (!Slop.natural(s.slop)) return when {
            s.hits.size == 1 -> Verdict(false, lead, ": a phrase you could say more simply")
            s.hits.isNotEmpty() -> Verdict(false, lead, ": ${s.hits.size} phrases you could say more simply")
            // No stock phrases, only a general-sounding draft: say what would help, or just that.
            else -> Verdict(false, concern?.name ?: GENERAL)
        }
        if (concern != null) return Verdict(false, concern.name)
        val answers = s.reach.firstOrNull { it.name.startsWith("Answers") }
        return Verdict(true, lead, answers?.let { " and " + it.name.lowerFirst() }.orEmpty())
    }

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

    /**
     * [post] is true for a fresh post rather than a reply, where the statement-endings rule applies;
     * [who] is the other person in a chat, when known, for "Answers Sam".
     */
    fun scoreDraft(draft: String, answer: String?, message: Boolean, voice: Voice.Rules = Voice.Rules(), post: Boolean = false, who: String? = null): Scores {
        val lines = answer?.let(::parse).orEmpty()
        val hits = Slop.hits(draft, voice, post && !message)
        val broken = Voice.broken(hits, draft, voice)
        // The user's own rules decide "sounds like you" whatever the judge says.
        val quality = checks(lines, QUALITY).filter { !(broken.isNotEmpty() && it.name in setOf(VOICE.pass, VOICE.concern)) }.toMutableList()
        if (broken.isNotEmpty()) quality.add(QUALITY.indexOf(VOICE).coerceAtMost(quality.size),
            Check(VOICE.concern, false, "Breaks your rules: " + broken.joinToString("; ") + "."))
        val reach = checks(lines, if (message) response(who) else REACH).toMutableList()
        if (!message) {
            if (Regex("https?://|www\\.").containsMatchIn(draft)) reach += Check("Links can mean fewer views", false, "Feeds may show posts with links to fewer people.")
            reach += if (draft.length > 280) Check("Long for a post", false, "Shorter posts get read more.")
            else Check("Right length for a post", true, "")
        }
        return Scores(hits, number(lines["GENERIC"]), number(lines["SPECIFICITY"]), quality, reach, message)
    }

    enum class Rewrite(val label: String, val ask: String) {
        TIGHTEN("Shorter", "Make it shorter and tighter. Cut filler, keep every point"),
        PLAINER("Simpler", "Say it in plainer, simpler words"),
        GRAMMAR("Fix spelling", "Fix only spelling, grammar and punctuation. Change nothing else"),
    }

    /** Compose boost: improved versions of what the user wrote in the field. */
    enum class Boost(val label: String, val ask: String) {
        TIGHTER("Shorter", "Make it tighter: cut filler and repeated words, keep every point"),
        PLAINER("More like you", "Use plainer, everyday words, the way the writer talks, and keep their casing, slang and quirks"),
        DETAIL("Start with a detail", "Start with the most specific, concrete detail already in the text. Don't invent details"),
    }

    /** What a bubble tap offers: better versions of the user's own text, replies to the screen, or neither. */
    enum class Mode { COMPOSE, REPLY, EMPTY }

    const val WRITE_FIRST = "Write a line or two first, and Ownvoice will help you polish it."

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

    /**
     * The meaning check of a rewrite: any number it added or left out, else the judge's view; null when
     * the judge didn't answer, so nothing claims "same meaning" unchecked.
     */
    fun meaning(original: String, rewrite: String, answer: String?): Check? {
        fun quoted(numbers: List<String>) = numbers.joinToString(" and ") { "“$it”" }
        val changes = listOfNotNull(
            Slop.addedNumbers(original, rewrite).takeIf { it.isNotEmpty() }?.let { "adds ${quoted(it)}" },
            Slop.addedNumbers(rewrite, original).takeIf { it.isNotEmpty() }?.let { "leaves out ${quoted(it)}" },
        )
        if (changes.isNotEmpty()) return Check("Meaning", false, "It " + changes.joinToString(" and "))
        return checks(answer?.let(::parse).orEmpty(), listOf(Kind("MEANING", "Same meaning", "Check this")))
            .firstOrNull()
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

    private fun checks(lines: Map<String, String>, kinds: List<Kind>) = kinds.mapNotNull { kind ->
        val value = lines[kind.key] ?: return@mapNotNull null
        val verdict = Regex("^[\\s–—-]*(pass|concern)\\b[\\s:,.;–—-]*", RegexOption.IGNORE_CASE).find(value) ?: return@mapNotNull null
        val ok = verdict.groupValues[1].equals("pass", ignoreCase = true)
        val reason = value.substring(verdict.range.last + 1).trim().ifEmpty { if (ok) "Looks fine." else "Worth a look." }
        Check(if (ok) kind.pass else kind.concern, ok, reason.replaceFirstChar { it.uppercase() })
    }

    fun number(value: String?) = value?.let { Regex("\\d+").find(it)?.value?.toIntOrNull()?.coerceIn(0, 10) }
}
