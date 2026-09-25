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
        if (mode == Judge.Mode.COMPOSE) return compose(capture, voice, post)
        val waiting = List(3) { sheet.body.add(placeholder(), bottom = 10f) }
        scope.launch {
            val started = SystemClock.elapsedRealtime()
            try {
                val drafts = OwnvoiceService.engine.drafts(capture.conversation, Voice.guide(voice, post = false)) { sheet.note.text = it }
                Log.i(OwnvoiceService.TAG, "drafts=${drafts.size} in ${SystemClock.elapsedRealtime() - started} ms")
                waiting.forEach(sheet.body::removeView)
                sheet.note.text = when {
                    drafts.isEmpty() -> "Couldn't come up with replies this time. Try again."
                    capture.input != null -> "Pick one to put in your message box. You send it yourself."
                    else -> "Tap into the message box first to use Insert, or copy one."
                }
                val rows = drafts.map { row(null, it, compose = false, capture.input != null, voice, post) }
                unscored(rows.size)
                this@DraftActivity.drafts = drafts
                score(rows, capture.conversation, null, voice, post)
            } catch (e: PlainError) {
                Log.w(OwnvoiceService.TAG, "draft failed after ${SystemClock.elapsedRealtime() - started} ms: ${e.message}")
                waiting.forEach(sheet.body::removeView)
                sheet.note.text = e.message
            }
        }
    }

    /**
     * Compose boost: the user's own text first, then each better version of it as soon as it's written.
     * Never a new post.
     */
    private fun compose(capture: OwnvoiceService.Capture, voice: Voice.Rules, post: Boolean) {
        val typed = capture.typed
        val rows = mutableListOf(yours(typed, voice, post))
        var waiting: View? = sheet.body.add(placeholder(), bottom = 10f)
        scope.launch {
            val started = SystemClock.elapsedRealtime()
            try {
                OwnvoiceService.engine.ensureReady({ sheet.note.text = it })
                sheet.note.text = "Writing…"
                val versions = Judge.rewrite(OwnvoiceService.engine, typed, capture.conversation, Voice.guide(voice, post)) { v, text ->
                    // The placeholder moves below each version that lands, until the last one.
                    sheet.body.removeView(waiting)
                    rows += row(v.label, text, compose = true, canInsert = true, voice, post)
                    waiting = if (v.ordinal < Judge.Version.entries.size - 1) sheet.body.add(placeholder(), bottom = 10f) else null
                }
                sheet.body.removeView(waiting)
                unscored(rows.size)
                drafts = versions.map { it.second }
                Log.i(OwnvoiceService.TAG, "versions=${drafts.size} in ${SystemClock.elapsedRealtime() - started} ms")
                sheet.note.text = if (drafts.isEmpty()) "Couldn't polish that this time. Try again." else "Pick one to use instead of what you wrote. You send it yourself."
                if (drafts.isNotEmpty()) score(rows, capture.conversation, typed, voice, post)
            } catch (e: PlainError) {
                Log.w(OwnvoiceService.TAG, "polish failed after ${SystemClock.elapsedRealtime() - started} ms: ${e.message}")
                sheet.body.removeView(waiting)
                sheet.note.text = e.message
            }
        }
    }

    /** The user's own text on a tinted card, with its highlights and verdict. */
    private fun yours(text: String, voice: Voice.Rules, post: Boolean): Row {
        val card = sheet.body.add(card(filled = true), bottom = 10f)
        card.add(label("Yours"))
        val shown = card.add(text(highlight(text, Slop.hits(text, voice, post))), top = 6f)
        val verdict = card.add(verdictLine(), top = 10f)
        return Row(text, shown, verdict, null, null)
    }

    private fun row(label: String?, text: String, compose: Boolean, canInsert: Boolean, voice: Voice.Rules, post: Boolean): Row {
        val card = sheet.body.add(card(), bottom = 10f)
        if (label != null) card.add(label(label), bottom = 6f)
        val shown = card.add(words(highlight(text, Slop.hits(text, voice, post))))
        // A version of the user's own text shows its meaning check; a reply shows its verdict.
        // "Why?" sits beside that line, which wraps first, so it stays whole at large display sizes.
        val beside = card.add(actions(), top = 10f)
        val line = verdictLine().also { beside.addView(it, LinearLayout.LayoutParams(0, -2, 1f)) }
        val why = ghost("Why?") {}.apply { visibility = View.INVISIBLE }.also { beside.addView(it) }
        val act = if (compose) "Use this" else "Insert"
        card.add(actions(filled(act) { insert(text) }.apply { isEnabled = canInsert; alpha = if (canInsert) 1f else 0.4f }, ghost("Copy") { copy(text) }), top = 8f)
        return Row(text, shown, if (compose) null else line, why, if (compose) line else null)
    }

    /** Empties [scores] and [meanings] for [n] texts; before [drafts] is set, so the test never sees them short. */
    private fun unscored(n: Int) {
        scores.clear()
        meanings.clear()
        repeat(n) { scores += null; meanings += null }
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
        content.add(text(Judge.quickChecks(who), Type.BODY).apply { setPadding(px(8), 0, px(8), 0) }, top = 12f)
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
