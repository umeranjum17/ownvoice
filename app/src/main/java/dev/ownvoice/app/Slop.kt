package dev.ownvoice.app

/**
 * Slop means generic, templated text. It is never a guess at whether a model wrote it: plenty of
 * people write this way, and many careful people who write in a second language get flagged by
 * "AI detectors". These rules (written for Ownvoice) only mark phrases; the judge carries the verdict.
 */
object Slop {
    /** One marked phrase in the text, [start] inclusive to [end] exclusive. */
    data class Hit(val start: Int, val end: Int, val reason: String)

    private const val I = "(?i)"

    // Phrases that say nothing specific in any context.
    private val STOCK = Regex(
        I + "\\b(" + listOf(
            "delve", "delving", "game[- ]changer", "at the end of the day", "in today's [\\w-]+ world",
            "navigat\\w+ the complexit\\w+", "a testament to", "tapestry", "unlock(?:ing)? (?:the|your) (?:full )?potential",
            "elevate your", "seamless(?:ly)?", "leverag\\w+", "it'?s worth noting", "needless to say",
            "in conclusion", "rest assured", "hope this (?:message|email) finds you well", "let'?s dive in",
            "dive deep(?:er)?", "deep dive", "embark on", "resonates? with", "cutting[- ]edge", "synerg\\w+",
            "circle back", "touch base", "moving forward", "a friendly reminder", "i completely understand",
            "thrilled to", "super excited", "wealth of", "plays a (?:crucial|pivotal|vital) role",
            "(?:crucial|pivotal|vital) (?:role|step|part)", "fostering", "in the realm of", "ever-evolving",
        ).joinToString("|") + ")\\b"
    )

    // "not X but Y", "isn't just", "more than just", "the real ...".
    private val CONTRAST = listOf(
        Regex(I + "\\bnot (?!sure\\b)(?:just |only |merely )?[\\w'’ -]{1,40}?,? but (?:also )?\\b"),
        Regex(I + "\\b(?:is|are|was|it's|it’s|that's|that’s) not (?:just|only|merely|about)\\b"),
        Regex(I + "\\b(?:isn't|isn’t|aren't|aren’t|wasn't|wasn’t) (?:just|only|merely|about)\\b"),
        Regex(I + "\\bmore than just\\b"),
        Regex(I + "\\bthe real (?:question|problem|issue|win|story|secret|magic|lesson|point|answer|key)\\b"),
    )

    // Three short items in a row: "fast, simple, and fun".
    private const val ITEM = "(?<![\\w'’-])(?!(?:i|you|he|she|it|we|they)\\b|[\\w-]*['’])[\\w'’-]+(?: [\\w'’-]+)?"
    private val TRIAD = Regex("$I$ITEM, $ITEM,? (?:and|or) $ITEM(?=[.,;:!?]|$)")

    private val DASH = Regex("—| – | -- ")

    private val FLATTERY = Regex(
        I + "^\\s*(?:great|excellent|fantastic|brilliant|awesome|amazing|love (?:this|that|it)|what an? (?:great|fantastic|brilliant|insightful|amazing)|" +
            "(?:such|what) an? (?:great|thoughtful|insightful|important)|this is (?:so |such )?(?:spot on|brilliant|amazing|fantastic|great|a great)|" +
            "absolutely|couldn't agree more|couldn’t agree more|thanks (?:so much )?for sharing|you're (?:absolutely |so )?right|you’re (?:absolutely |so )?right)" +
            "[^.!?\\n]{0,40}[.!?,]?"
    )

    private val PREAMBLE = Regex(
        I + "^\\s*(?:(?:sure|certainly|of course|absolutely)[!,.]\\s*)?(?:here(?:'s|’s| is| are) (?:a|an|my|the|some|one|your)?\\s*" +
            "(?:[\\w,'’-]+ ){0,3}(?:reply|replies|response|responses|draft|drafts|version|message|rewrite|option|suggestion)s?\\b[^\\n:]*:?" +
            "|(?:reply|response|draft|rewrite):|as an ai\\b[^.\\n]*\\.?)"
    )

    private val CTA = Regex(
        I + "(?:what do you think|what are your thoughts|thoughts\\?|let me know (?:if|what|your|how)|feel free to|drop (?:a|your) \\w+|" +
            "share your (?:thoughts|experience)|i'?d love to hear|i’d love to hear|follow (?:me )?for more|hope (?:this|that) helps|agree\\?|" +
            "don't hesitate to|don’t hesitate to|looking forward to hearing)[^.!?\\n]*[.!?]*\\s*$"
    )

    private val HASHTAG = Regex("(?<![\\w#])#[\\p{L}\\d_]+")

    fun hits(text: String): List<Hit> {
        val hits = mutableListOf<Hit>()
        fun add(regex: Regex, reason: String) = regex.findAll(text).forEach { hits += Hit(it.range.first, it.range.last + 1, reason) }
        add(STOCK, "stock phrase")
        CONTRAST.forEach { add(it, "contrast frame") }
        add(TRIAD, "list of three")
        add(DASH, "em dash")
        add(FLATTERY, "flattery opener")
        add(PREAMBLE, "meta preamble")
        // Only the last sentence can be a closing call to action.
        val lastSentence = Regex("[.!?\\n]\\s+(?=\\S[^.!?\\n]*[.!?]*\\s*$)").findAll(text).lastOrNull()?.range?.last?.plus(1) ?: 0
        CTA.find(text, lastSentence)?.let { hits += Hit(it.range.first, it.range.last + 1, "closing call to action") }
        val tags = HASHTAG.findAll(text).toList()
        if (tags.size >= 2) tags.forEach { hits += Hit(it.range.first, it.range.last + 1, "hashtag stuffing") }
        val emoji = emojiRanges(text)
        if (emoji.size >= 3) emoji.forEach { hits += Hit(it.first, it.last + 1, "emoji stuffing") }
        return hits.filter { it.end > it.start }.sortedBy { it.start }.distinctBy { it.start to it.reason }
    }

    private fun emojiRanges(text: String): List<IntRange> {
        val out = mutableListOf<IntRange>()
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            val n = Character.charCount(cp)
            if (cp in 0x1F300..0x1FAFF || cp in 0x2600..0x27BF) out += i until i + n
            i += n
        }
        return out
    }

    /**
     * 0-100: rule hits plus the judge's genericness and (lack of) specificity, each 0-10.
     * ponytail: starting weights from the plan, tune on a labelled set once one ships.
     */
    fun score(hits: Int, generic: Int?, specific: Int?): Int {
        val judge = if (generic == null || specific == null) 0 else generic + (10 - specific)
        return ((2 * hits + judge).coerceIn(0, 20)) * 5
    }

    fun words(score: Int) = when {
        score < 25 -> "clean"
        score <= 55 -> "a bit generic"
        else -> "sloppy"
    }

    /** Numbers in [rewrite] that [original] never had: a rewrite must not add facts. Swap the arguments for dropped numbers. */
    fun addedNumbers(original: String, rewrite: String): List<String> {
        val num = Regex("\\d+(?:[.,:]\\d+)*")
        fun key(n: String) = n.replace(Regex(",(?=\\d{3}(?!\\d))"), "").replace(':', '.')
        val had = num.findAll(original).map { key(it.value) }.toSet()
        return num.findAll(rewrite).map { it.value }.filter { key(it) !in had }.distinctBy(::key).toList()
    }
}
