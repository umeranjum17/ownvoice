package dev.ownvoice.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** The drafts panel: a translucent sheet over the app the user was in. */
class DraftActivity : Activity() {
    companion object {
        /** Set when the person asked for this reply to be written on their computer. */
        const val ON_COMPUTER = "on_computer"
    }

    private val scope = MainScope()
    private lateinit var sheet: Sheet
    private var who: String? = null

    /** Drafts on show (in compose mode, the improved versions of the user's text), read by the on-device test. */
    var drafts: List<String> = emptyList()
        private set

    /**
     * Scores of each text on show once the judge has answered (null until then), read by the on-device test.
     * In compose mode the user's own text comes first.
     */
    val scores = mutableListOf<Judge.Scores?>()

    /** Meaning check of each text on show, in line with [scores]; only improved versions get one. */
    val meanings = mutableListOf<Judge.Check?>()

    /** Who wrote the drafts on show, read by the on-device test. */
    var writer = Writer.PHONE
        private set

    /** One text on show: the text, its highlighted view, its one-line verdict, its "Why?" link and, for an improved version, its meaning check. */
    private class Row(val text: String, val shown: TextView, val verdict: TextView?, val why: TextView?, val meaning: TextView?)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sheet = Sheet(this)
        draft()
    }

    // Every way out (Insert, Copy, Close, tap outside, Back) stops the activity.
    override fun onStart() {
        super.onStart()
        OwnvoiceService.instance?.panelOpen = true
    }

    override fun onStop() {
        OwnvoiceService.instance?.panelOpen = false
        super.onStop()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    // Phones with predictive back switched off (OnePlus, for one) still send Back here rather than to the
    // sheet's callback, so close the "Why?" note first on this path too.
    @SuppressLint("GestureBackNavigation")
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        @Suppress("DEPRECATION")
        if (!sheet.uncover()) super.onBackPressed()
    }

    private fun draft() {
        val capture = OwnvoiceService.instance?.capture ?: return finish()
        val mode = capture.mode
        val voice = Voice.rules(this)
        who = Judge.who(capture.conversation)
        // Own text with nothing on screen to reply to is a fresh post, where the statement-endings rule applies.
        val post = mode == Judge.Mode.COMPOSE && !Judge.replying(capture.written)
        sheet.title.text = when (mode) {
            Judge.Mode.COMPOSE -> "Polish your message"
            Judge.Mode.REPLY -> who?.let { "Reply to $it" } ?: "Suggested replies"
            Judge.Mode.EMPTY -> "Nothing to reply to yet"
        }
        if (mode == Judge.Mode.EMPTY) return run { sheet.note.text = Judge.WRITE_FIRST }
        sheet.note.text = "Writing…"
        val waiting = List(if (mode == Judge.Mode.COMPOSE) 2 else 3) { sheet.body.add(placeholder(), bottom = 10f) }
        scope.launch {
            val started = SystemClock.elapsedRealtime()
            val anyway = intent.getBooleanExtra(ON_COMPUTER, false)
            var engine: DraftEngine? = null
            try {
                if (mode == Judge.Mode.COMPOSE) {
                    val versions = boost(capture.typed, Voice.guide(voice, post))
                    drafts = versions.map { it.second }
                    Log.i(OwnvoiceService.TAG, "boosts=${drafts.size} in ${SystemClock.elapsedRealtime() - started} ms")
                    waiting.forEach(sheet.body::removeView)
                    show(true, capture.conversation, capture.typed, versions.map { it.first }, voice, post)
                } else {
                    engine = Computer.pick(this@DraftActivity, capture.app, anyway, OwnvoiceService.engine)
                    if (engine is Computer) Privacy.noteWriter(this@DraftActivity, capture.at, "Tried your computer for replies.")
                    drafts = engine.drafts(capture.conversation, Voice.guide(voice, post = false)) { sheet.note.text = it }
                    writer = (engine as? Computer)?.wrote ?: Writer.PHONE
                    Log.i(OwnvoiceService.TAG, "drafts=${drafts.size} by $writer in ${SystemClock.elapsedRealtime() - started} ms")
                    waiting.forEach(sheet.body::removeView)
                    show(capture.input != null, capture.conversation, null, null, voice, post)
                    offerComputer(capture, engine, anyway)
                }
            } catch (e: PlainError) {
                Log.w(OwnvoiceService.TAG, "draft failed after ${SystemClock.elapsedRealtime() - started} ms: ${e.message}")
                waiting.forEach(sheet.body::removeView)
                sheet.note.text = e.message
                // The phone can't write, but the computer may: say why it didn't, and still offer it.
                engine?.let { offerComputer(capture, it, anyway) }
            }
        }
    }

    /**
     * When the computer could write but didn't: a button to send this one there anyway (for an app that
     * stays on the phone), or to try again after it failed. Either opens the panel afresh.
     */
    private fun offerComputer(capture: OwnvoiceService.Capture, engine: DraftEngine, anyway: Boolean) {
        val why = (engine as? Computer)?.why
        val label = when {
            why != null -> {
                sheet.note.text = why + " " + sheet.note.text
                "Try my computer again"
            }
            engine !is Computer && Computer.wanted(this, capture.app, anyway = true) -> "Write this one on my computer"
            else -> return
        }
        sheet.body.addView(ghost(label) { intent.putExtra(ON_COMPUTER, true); recreate() }, 0, LinearLayout.LayoutParams(-2, -2))
    }

    /** Compose boost: each style's version of what the user wrote, as (label, text). Never a new post. */
    private suspend fun boost(typed: String, guide: String): List<Pair<String, String>> {
        OwnvoiceService.engine.ensureReady({ sheet.note.text = it })
        return Judge.Boost.entries.mapNotNull { how ->
            Judge.clean(OwnvoiceService.engine.ask(Judge.rewritePrompt(typed, how.ask, guide), 256)).takeIf { it.isNotEmpty() }?.let { how.label to it }
        }
    }

    /** Shows the drafts, or in compose mode the user's [original] text and then its improved versions under their [labels]. */
    private fun show(canInsert: Boolean, conversation: String, original: String?, labels: List<String>?, voice: Voice.Rules, post: Boolean) {
        sheet.note.text = when {
            drafts.isEmpty() && original != null -> "Couldn't polish that this time. Try again."
            drafts.isEmpty() -> "Couldn't come up with replies this time. Try again."
            original != null -> "Pick one to use instead of what you wrote. You send it yourself."
            canInsert -> "Pick one to put in your message box. You send it yourself."
            else -> "Tap into the message box first to use Insert, or copy one."
        }
        val rows = mutableListOf<Row>()
        if (original != null && drafts.isNotEmpty()) rows += yours(original, voice, post)
        // Once a computer is paired, each reply says where it was written.
        val caption = writer.caption.takeIf { original == null && Link.computer(this) != null }
        drafts.forEachIndexed { i, draft -> rows += row(labels?.get(i), draft, compose = original != null, canInsert, voice, post, caption) }
        scores.clear()
        meanings.clear()
        repeat(rows.size) { scores += null; meanings += null }
        scope.launch { score(rows, conversation, original, voice, post) }
    }

    /** The user's own text on a tinted card, with its highlights and verdict. */
    private fun yours(text: String, voice: Voice.Rules, post: Boolean): Row {
        val card = sheet.body.add(card(filled = true), bottom = 10f)
        card.add(label("Yours"))
        val shown = card.add(text(highlight(text, Slop.hits(text, voice, post))), top = 6f)
        val verdict = card.add(verdictLine(), top = 10f)
        return Row(text, shown, verdict, null, null)
    }

    private fun row(label: String?, text: String, compose: Boolean, canInsert: Boolean, voice: Voice.Rules, post: Boolean, caption: String? = null): Row {
        val card = sheet.body.add(card(), bottom = 10f)
        if (label != null) card.add(label(label), bottom = 6f)
        val shown = card.add(words(highlight(text, Slop.hits(text, voice, post))))
        if (caption != null) card.add(text(caption, Type.BODY), top = 4f)
        // A version of the user's own text shows its meaning check; a reply shows its verdict.
        // "Why?" sits beside that line, which wraps first, so it stays whole at large display sizes.
        val beside = card.add(actions(), top = 10f)
        val line = verdictLine().also { beside.addView(it, LinearLayout.LayoutParams(0, -2, 1f)) }
        val why = ghost("Why?") {}.apply { visibility = View.INVISIBLE }.also { beside.addView(it) }
        val act = if (compose) "Use this" else "Insert"
        card.add(actions(filled(act) { insert(text) }.apply { isEnabled = canInsert; alpha = if (canInsert) 1f else 0.4f }, ghost("Copy") { copy(text) }), top = 8f)
        return Row(text, shown, if (compose) null else line, why, if (compose) line else null)
    }

    /** Scores the texts one by one after they show, so scoring never delays them; versions of [original] also get a meaning check. */
    private suspend fun score(rows: List<Row>, conversation: String, original: String?, voice: Voice.Rules, post: Boolean) {
        val started = SystemClock.elapsedRealtime()
        val message = ask(Judge.kindPrompt(conversation), 5)?.let(Judge::isMessage) ?: false
        rows.forEachIndexed { i, row ->
            val draft = row.text
            val result = Judge.scoreDraft(draft, ask(Judge.draftPrompt(conversation, draft, message, Voice.guide(voice, post && !message)), 220), message, voice, post, who)
            // A chat is never a fresh post, so the judge's answer can take back an ending-question mark.
            row.shown.text = highlight(draft, result.hits)
            row.verdict?.showVerdict(Judge.verdict(result))
            row.why?.apply {
                visibility = View.VISIBLE
                setOnClickListener { why(draft, result, version = original != null) }
            }
            scores[i] = result
            if (row.meaning != null && original != null) {
                val m = Judge.meaning(original, draft, ask(Judge.rewriteCheckPrompt(original, draft), 80))
                row.meaning.showMeaning(m)
                meanings[i] = m
            }
        }
        Log.i(OwnvoiceService.TAG, "scored ${rows.size} texts (message=$message) in ${SystemClock.elapsedRealtime() - started} ms")
    }

    /** The "Why?" note: the text with its marked phrases, then each quick check in plain words. */
    private fun why(draft: String, s: Judge.Scores, version: Boolean) {
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.add(card().apply { setPadding(px(16), px(14), px(16), px(14)); add(words(highlight(draft, s.hits))) }, bottom = 16f)
        content.add(label("How it reads").apply { setPadding(px(8), 0, 0, 0) }, bottom = 8f)
        val phrases = s.hits.map { "“" + draft.substring(it.start, it.end).trim() + "”: " + it.reason }.distinct().joinToString("\n")
        val natural = Slop.natural(s.slop)
        val rows = listOf(when {
            natural -> reason(true, Slop.words(s.slop), phrases)
            phrases.isEmpty() -> reason(false, Judge.GENERAL + ".", "It could be sent to almost anyone.")
            else -> reason(false, Slop.words(s.slop) + ".", phrases)
        }) +
            (s.quality + s.reach).map { reason(it.ok, it.name, if (it.ok) null else it.reason) }
        content.add(reasons(rows))
        content.add(text(Judge.quickChecks(who) + if (version) "" else Judge.checkedBy(writer), Type.BODY).apply { setPadding(px(8), 0, px(8), 0) }, top = 12f)
        sheet.cover(if (version) "Why this version" else "Why this reply", content)
    }

    /** The judge's answer, or null when the model can't answer; the scores then fall back to rules. */
    private suspend fun ask(prompt: String, maxTokens: Int): String? = try {
        OwnvoiceService.engine.ask(prompt, maxTokens)
    } catch (e: PlainError) {
        Log.w(OwnvoiceService.TAG, "judge failed: ${e.message}")
        null
    }

    private fun insert(draft: String) {
        val service = OwnvoiceService.instance ?: return run { sheet.note.text = "Ownvoice is off. Use Copy instead." }
        finish()
        service.insert(draft)
    }

    private fun copy(draft: String) {
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", draft))
        OwnvoiceService.instance?.say("Copied.")
        finish()
    }
}
