package dev.ownvoice.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.util.Log
import android.widget.LinearLayout
import android.widget.Toast
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipDrawable
import com.google.android.material.chip.ChipGroup
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Rewrites selected text ("Ownvoice" in the text-selection menu) or shared text, with no
 * accessibility needed. Returns the rewrite to the app when its field is editable, else offers Copy.
 */
class RewriteActivity : Activity() {
    private val scope = MainScope()
    private var job: Job? = null
    private lateinit var sheet: Sheet
    private lateinit var result: LinearLayout
    private lateinit var tabs: ChipGroup
    private lateinit var original: String
    private var editable = false

    /** The latest rewrite and its meaning check, read by the on-device test. */
    var rewrite: String? = null
        private set
    var meaning: Judge.Check? = null
        private set
    var slop: Judge.Scores? = null
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        original = (intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT) ?: intent.getCharSequenceExtra(Intent.EXTRA_TEXT))?.toString().orEmpty()
        editable = intent.action == Intent.ACTION_PROCESS_TEXT && !intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false)
        sheet = Sheet(this)
        sheet.title.text = "Make it better"
        result = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        if (original.isBlank()) {
            sheet.note.text = "Select some text first, then choose Ownvoice."
            return
        }
        sheet.note.text = "Pick how you'd like it. You'll see it before anything changes."
        val body = sheet.body
        body.add(card(filled = true).apply {
            add(label("You selected"))
            add(text(highlight(original, Slop.hits(original, Voice.rules(context)))).apply { maxLines = 6 }, top = 6f)
        }, bottom = 8f)
        // One choice at a time, as Material filter chips.
        tabs = body.add(ChipGroup(this).apply { isSingleSelection = true; isSelectionRequired = true }, bottom = 8f)
        Judge.Rewrite.entries.forEach { how ->
            tabs.addView(Chip(this).apply {
                setChipDrawable(ChipDrawable.createFromAttributes(context, null, 0, com.google.android.material.R.style.Widget_Material3_Chip_Filter))
                text = how.label
                isCheckable = true
                setOnClickListener { rewrite(how) }
            })
        }
        body.add(result)
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

    private fun rewrite(how: Judge.Rewrite) {
        job?.cancel()
        result.removeAllViews()
        rewrite = null
        meaning = null
        slop = null
        job = scope.launch {
            sheet.note.text = "Writing…"
            val waiting = result.add(placeholder())
            val text = try {
                Judge.clean(OwnvoiceService.engine.ask(Judge.rewritePrompt(original, how.ask), 256))
            } catch (e: PlainError) {
                result.removeView(waiting)
                sheet.note.text = e.message
                return@launch
            }
            result.removeView(waiting)
            if (text.isEmpty()) return@launch run { sheet.note.text = "Couldn't rewrite that. Try again." }
            sheet.note.text = if (editable) "Replace your text with it, or copy it." else "Copy it, then paste it where you like."
            val hits = Slop.hits(text, Voice.rules(this@RewriteActivity))
            val card = result.add(card())
            card.add(words(highlight(text, hits)))
            val check = card.add(verdictLine(), top = 10f)
            val verdict = card.add(verdictLine().apply { visibility = View.GONE }, top = 6f)
            val buttons = card.add(actions(), top = 8f)
            if (editable) buttons.addView(filled("Replace") { replace(text) })
            buttons.addView(if (editable) ghost("Copy") { copy(text) } else filled("Copy") { copy(text) })
            if (editable) result.add(text("If the app doesn't take it, it's copied too. Just paste.", Type.BODY).apply { setPadding(px(8), 0, px(8), 0) }, top = 12f)
            rewrite = text
            val answer = try {
                OwnvoiceService.engine.ask(Judge.rewriteCheckPrompt(original, text), 80)
            } catch (e: PlainError) {
                Log.w(OwnvoiceService.TAG, "rewrite check failed: ${e.message}")
                null
            }
            val lines = answer?.let(Judge::parse).orEmpty()
            val scores = Judge.Scores(hits, Judge.number(lines["GENERIC"]), Judge.number(lines["SPECIFICITY"]), emptyList(), emptyList(), false)
            val m = Judge.meaning(original, text, answer)
            check.showMeaning(m, same = "Same meaning as yours")
            verdict.visibility = View.VISIBLE
            verdict.showVerdict(Judge.verdict(scores))
            slop = scores
            meaning = m
        }
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
