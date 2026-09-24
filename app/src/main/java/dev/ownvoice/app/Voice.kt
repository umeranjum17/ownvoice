package dev.ownvoice.app

import android.content.Context

/**
 * Your voice: phrases the user never says and a few writing rules, kept on this phone in plain
 * SharedPreferences. They feed the slop highlights, the "sounds like you" check and the prompts.
 */
object Voice {
    data class Rules(val never: List<String> = emptyList(), val noDashes: Boolean = false, val statementEndings: Boolean = false, val note: String = "") {
        val empty get() = never.isEmpty() && !noDashes && !statementEndings && note.isBlank()
    }

    /** What an import found, for the user to confirm; [skipped] counts never-say bullets that read as advice, not phrases. */
    data class Found(val never: List<String>, val noDashes: Boolean, val statementEndings: Boolean, val skipped: Int)

    const val NEVER_SAY = "on your never-say list"
    const val ENDS_ON_QUESTION = "ends on a question"

    private val HEADING = Regex("^\\s*(?:#{1,6}\\s+(.+?)\\s*#*|\\*\\*([^*]+)\\*\\*:?)\\s*$")
    private val BULLET = Regex("^\\s*(?:[-*+•]|\\d+[.)])\\s+(.+)$")
    private val QUOTED = Regex("\"([^\"\\n]+)\"|“([^”\\n]+)”|`([^`\\n]+)`")
    private val DASH_BAN = Regex("(?i)(?:\\b(?:no|zero|never|avoid|ban(?:ned)?|don'?t|without|cut)\\b[^\\n]{0,40}\\bem[- ]?dash|em[- ]?dash(?:es)?\\b[^\\n]{0,20}\\b(?:banned|never))")
    private val ENDINGS = Regex("(?i)statements?,? not questions|end (?:posts |each post )?(?:on|with) (?:a )?statements?")

    /**
     * Reads a voice profile in markdown: bullets under a heading containing "Never say" become phrases
     * (the quoted ones if a bullet quotes any, else the bullet itself when it is five words or fewer),
     * and a ban on em dashes or a "statements, not questions" ending turns that rule on. Nothing else is kept.
     */
    fun parse(markdown: String): Found {
        val never = mutableListOf<String>()
        var skipped = 0
        var inNever = false
        markdown.lines().forEach { line ->
            val heading = HEADING.find(line)?.let { it.groupValues[1] + it.groupValues[2] }
            if (heading != null) return@forEach run { inNever = "never say" in heading.lowercase().replace('-', ' ') }
            if (!inNever) return@forEach
            val bullet = BULLET.find(line)?.groupValues?.get(1) ?: return@forEach
            val quoted = QUOTED.findAll(bullet).map { m -> m.groupValues.drop(1).first { it.isNotEmpty() } }.toList()
            val plain = bullet.replace(Regex("[*_`]"), "").trim().trimEnd('.', ',', ';', ':', '!').trim()
            when {
                quoted.isNotEmpty() -> never += quoted
                plain.isNotEmpty() && plain.split(Regex("\\s+")).size <= 5 -> never += plain
                else -> skipped++
            }
        }
        return Found(dedupe(never.map { it.trim() }), DASH_BAN.containsMatchIn(markdown), ENDINGS.containsMatchIn(markdown), skipped)
    }

    /** [rules] with an import's phrases added and its rules switched on; nothing is switched off. */
    fun merge(rules: Rules, found: Found) = rules.copy(
        never = dedupe(rules.never + found.never),
        noDashes = rules.noDashes || found.noDashes,
        statementEndings = rules.statementEndings || found.statementEndings,
    )

    private fun dedupe(phrases: List<String>) = phrases.filter { it.isNotBlank() }.distinctBy { it.lowercase() }

    /** Matches [phrase] anywhere in a text: any case, any run of spaces, straight or curly apostrophes, whole words only. */
    fun matcher(phrase: String): Regex {
        val body = phrase.trim().split(Regex("\\s+")).joinToString("\\s+") { word ->
            word.map { if (it == '\'' || it == '’') "['’]" else Regex.escape(it.toString()) }.joinToString("")
        }
        val start = if (phrase.trim().first().isLetterOrDigit()) "(?<![\\p{L}\\d])" else ""
        val end = if (phrase.trim().last().isLetterOrDigit()) "(?![\\p{L}\\d])" else ""
        return Regex("(?i)$start$body$end")
    }

    /**
     * The rules as one short line for a prompt, or "" when there are none. [post] adds the ending rule,
     * which only applies to a fresh post: questions are fine in replies. The never-say list stays out:
     * on the phone, the never-say list in the prompt made drafts longer and slower, and the highlights catch those phrases anyway.
     */
    fun guide(rules: Rules, post: Boolean) = listOfNotNull(
        "No em dashes.".takeIf { rules.noDashes },
        "End on a statement, not a question.".takeIf { rules.statementEndings && post },
        // ponytail: the note is capped at 200 characters to keep drafting fast.
        rules.note.trim().takeIf { it.isNotEmpty() }?.let { "How they write: " + it.take(200) },
    ).joinToString(" ")

    /** Why [hits] break the user's own rules, for the "sounds like you" check; empty when they don't. */
    fun broken(hits: List<Slop.Hit>, text: String, rules: Rules) = buildList {
        hits.filter { it.reason == NEVER_SAY }.map { "“" + text.substring(it.start, it.end) + "”" }.distinctBy { it.lowercase() }
            .takeIf { it.isNotEmpty() }?.let { add("says " + it.joinToString() + " from your never-say list") }
        if (rules.noDashes && hits.any { it.reason == "em dash" }) add("has an em dash")
        if (hits.any { it.reason == ENDS_ON_QUESTION }) add("ends on a question")
    }

    // Writes use commit(), like Privacy: small, and must survive the process dying right after.
    private fun prefs(context: Context) = context.getSharedPreferences("voice", Context.MODE_PRIVATE)

    fun rules(context: Context) = prefs(context).run {
        Rules(getString("never", "").orEmpty().lines().filter { it.isNotBlank() }, getBoolean("noDashes", false),
            getBoolean("statementEndings", false), getString("note", "").orEmpty())
    }

    fun save(context: Context, rules: Rules) {
        prefs(context).edit().putString("never", dedupe(rules.never.map { it.trim() }).joinToString("\n"))
            .putBoolean("noDashes", rules.noDashes).putBoolean("statementEndings", rules.statementEndings)
            .putString("note", rules.note.trim()).commit()
    }

    fun wipe(context: Context) {
        prefs(context).edit().clear().commit()
    }
}
