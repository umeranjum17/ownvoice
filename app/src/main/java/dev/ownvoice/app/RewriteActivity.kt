package dev.ownvoice.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
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
    private lateinit var status: TextView
    private lateinit var result: LinearLayout
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
        status = TextView(this)
        val body = sheet(status)
        result = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        if (original.isBlank()) {
            status.text = "Select some text first, then choose Ownvoice."
            return
        }
        status.text = "Pick a rewrite. It runs on this phone."
        body.addView(TextView(this).apply {
            text = highlight(original, Slop.hits(original))
            textSize = 14f
            setTextColor(0xFF555555.toInt())
            maxLines = 6
            setPadding(0, (8 * dp).toInt(), 0, 0)
        })
        body.addView(LinearLayout(this).apply {
            Judge.Rewrite.entries.forEach { how -> addView(Button(context).apply { text = how.label; setOnClickListener { rewrite(how) } }) }
        })
        body.addView(result)
    }

    override fun onStart() {
        super.onStart()
        OwnvoiceService.instance?.bubbleVisible = false
    }

    override fun onStop() {
        OwnvoiceService.instance?.bubbleVisible = true
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
            status.text = "${how.label}: rewriting on this phone…"
            val text = try {
                clean(OwnvoiceService.engine.ask(Judge.rewritePrompt(original, how), 256))
            } catch (e: PlainError) {
                status.text = e.message
                return@launch
            }
            if (text.isEmpty()) return@launch run { status.text = "The model returned nothing. Try again." }
            status.text = if (editable) "Replace your text with it, or copy it." else "Copy it."
            val hits = Slop.hits(text)
            result.addView(TextView(this@RewriteActivity).apply {
                this.text = highlight(text, hits)
                textSize = 16f
                setTextColor(Color.BLACK)
                setPadding(0, (8 * dp).toInt(), 0, (4 * dp).toInt())
            })
            val chips = Chips(this@RewriteActivity)
            val chip = chips.chip("Slop: checking…")
            val check = TextView(this@RewriteActivity).apply { textSize = 14f; this.text = "Meaning: checking…" }
            result.addView(chips.row)
            result.addView(chips.detail)
            result.addView(check)
            result.addView(LinearLayout(this@RewriteActivity).apply {
                if (editable) addView(Button(context).apply { this.text = "Replace"; setOnClickListener { replace(text) } })
                addView(Button(context).apply { this.text = "Copy"; setOnClickListener { copy(text) } })
            })
            rewrite = text
            val answer = try {
                OwnvoiceService.engine.ask(Judge.rewriteCheckPrompt(original, text), 80)
            } catch (e: PlainError) {
                Log.w(OwnvoiceService.TAG, "rewrite check failed: ${e.message}")
                null
            }
            val lines = answer?.let(Judge::parse).orEmpty()
            val scores = Judge.Scores(hits, Judge.number(lines["GENERIC"]), Judge.number(lines["SPECIFICITY"]), emptyList(), emptyList(), false)
            chips.set(chip, "Slop: ${Slop.words(scores.slop)}", slopDetail(hits, text, scores.generic, scores.specific, scores.slop))
            val m = Judge.meaning(original, text, answer)
            check.text = (if (m.ok) "✓ Meaning kept: " else "! Meaning may have changed: ") + m.reason
            check.setTextColor(if (m.ok) 0xFF2E7D32.toInt() else 0xFFC62828.toInt())
            slop = scores
            meaning = m
        }
    }

    /** Drops a "Here's the rewrite:" line and wrapping quotes the model sometimes adds. */
    private fun clean(text: String): String {
        val lines = text.trim().lines()
        val body = if (lines.size > 1 && lines[0].trim().endsWith(':') && lines[0].trim().startsWith("Here", ignoreCase = true)) lines.drop(1) else lines
        return body.joinToString("\n").trim().removeSurrounding("\"").trim()
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
