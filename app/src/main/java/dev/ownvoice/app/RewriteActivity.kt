package dev.ownvoice.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.util.Log
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Rewrites selected text ("Ownvoice" in the text-selection menu) or shared text, with no
 * accessibility needed. Returns the rewrite to the app when its field is editable, else offers Copy.
 */
class RewriteActivity : Activity() {
    private val scope = MainScope()
    private lateinit var sheet: Sheet
    private lateinit var original: String
    private var editable = false

    /** The versions on show once all have landed, with each one's meaning check and stock-phrasing score, read by the on-device test. */
    var versions: List<String> = emptyList()
        private set
    val meanings = mutableListOf<Judge.Check?>()
    val slops = mutableListOf<Judge.Scores?>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        original = (intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT) ?: intent.getCharSequenceExtra(Intent.EXTRA_TEXT))?.toString().orEmpty()
        editable = intent.action == Intent.ACTION_PROCESS_TEXT && !intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false)
        sheet = Sheet(this)
        sheet.title.text = "Make it better"
        if (original.isBlank()) {
            sheet.note.text = "Select some text first, then choose Ownvoice."
            return
        }
        sheet.note.text = "Writing…"
        sheet.body.add(card(filled = true).apply {
            add(label("You selected"))
            add(text(highlight(original, Slop.hits(original, Voice.rules(context)))).apply { maxLines = 6 }, top = 6f)
        }, bottom = 10f)
        rewrite()
    }

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

    /** One version on show: its text, meaning check and verdict lines. */
    private class Shown(val text: String, val check: TextView, val verdict: TextView)

    /** Shows each version as it lands, then checks each one's meaning and phrasing. */
    private fun rewrite() = scope.launch {
        val shown = mutableListOf<Shown>()
        var waiting: View? = sheet.body.add(placeholder(), bottom = 10f)
        val voice = Voice.rules(this@RewriteActivity)
        val got = try {
            OwnvoiceService.engine.ensureReady({ sheet.note.text = it })
            sheet.note.text = "Writing…"
            Judge.rewrite(OwnvoiceService.engine, original, "", Voice.guide(voice, post = false)) { v, text ->
                sheet.body.removeView(waiting)
                shown += version(v.label, text, voice)
                waiting = if (v.ordinal < Judge.Version.entries.size - 1) sheet.body.add(placeholder(), bottom = 10f) else null
            }
        } catch (e: PlainError) {
            sheet.body.removeView(waiting)
            sheet.note.text = e.message
            return@launch
        }
        sheet.body.removeView(waiting)
        if (got.isEmpty()) return@launch run { sheet.note.text = "Couldn't rewrite that. Try again." }
        sheet.note.text = if (editable) "Replace your text with one, or copy it." else "Copy one, then paste it where you like."
        if (editable) sheet.body.add(text("If the app doesn't take it, it's copied too. Just paste.", Type.BODY).apply { setPadding(px(8), 0, px(8), 0) }, top = 2f)
        meanings.clear()
        slops.clear()
        repeat(shown.size) { meanings += null; slops += null }
        versions = shown.map { it.text }
        shown.forEachIndexed { i, one ->
            val answer = try {
                OwnvoiceService.engine.ask(Judge.rewriteCheckPrompt(original, one.text), 80)
            } catch (e: PlainError) {
                Log.w(OwnvoiceService.TAG, "rewrite check failed: ${e.message}")
                null
            }
            val lines = answer?.let(Judge::parse).orEmpty()
            val scores = Judge.Scores(Slop.hits(one.text, voice), Judge.number(lines["GENERIC"]), Judge.number(lines["SPECIFICITY"]), emptyList(), emptyList(), false)
            val m = Judge.meaning(original, one.text, answer)
            one.check.showMeaning(m, same = "Same meaning as yours")
            one.verdict.visibility = View.VISIBLE
            one.verdict.showVerdict(Judge.verdict(scores))
            slops[i] = scores
            meanings[i] = m
        }
    }

    private fun version(label: String, text: String, voice: Voice.Rules): Shown {
        val card = sheet.body.add(card(), bottom = 10f)
        card.add(label(label), bottom = 6f)
        card.add(words(highlight(text, Slop.hits(text, voice))))
        val check = card.add(verdictLine(), top = 10f)
        val verdict = card.add(verdictLine().apply { visibility = View.GONE }, top = 6f)
        val buttons = card.add(actions(), top = 8f)
        if (editable) buttons.addView(filled("Replace") { replace(text) })
        buttons.addView(if (editable) ghost("Copy") { copy(text) } else filled("Copy") { copy(text) })
        return Shown(text, check, verdict)
    }

    /**
     * Hands the rewrite back to the app, and copies it too: Chrome drops the page's selection when
     * another activity comes to the front, so it may ignore the result or insert it at the caret.
     */
    private fun replace(text: String) {
        setResult(RESULT_OK, Intent().putExtra(Intent.EXTRA_PROCESS_TEXT, text))
        copy(text, "Replaced. Also copied, in case the app didn't take it.")
    }

    private fun copy(text: String, message: String = "Copied.") {
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice rewrite", text))
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        finish()
    }
}
