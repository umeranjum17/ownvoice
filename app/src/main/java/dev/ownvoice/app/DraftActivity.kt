package dev.ownvoice.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.widget.Button
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
    private lateinit var status: TextView
    private lateinit var list: LinearLayout

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

    /** One text on show: the text, its chips and, for an improved version, its meaning check. */
    private class Row(val text: String, val shown: TextView, val chips: Chips, val slop: TextView, val quality: TextView, val reach: TextView, val meaning: TextView?)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        status = TextView(this)
        list = sheet(status)
        list.addView(LinearLayout(this).apply {
            addView(Button(context).apply { text = "Pause Ownvoice"; setOnClickListener { Privacy.setPaused(context, true); finish() } })
            addView(Button(context).apply {
                text = "What was read"
                setOnClickListener { startActivity(Intent(context, ReadsActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); finish() }
            })
        })
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

    private fun draft() {
        val capture = OwnvoiceService.instance?.capture ?: return finish()
        val mode = capture.mode
        val voice = Voice.rules(this)
        // Own text with nothing on screen to reply to is a fresh post, where the statement-endings rule applies.
        val post = mode == Judge.Mode.COMPOSE && !Judge.replying(capture.written)
        if (mode == Judge.Mode.EMPTY) return run { status.text = Judge.WRITE_FIRST }
        status.text = "Reading done."
        scope.launch {
            val started = SystemClock.elapsedRealtime()
            try {
                if (mode == Judge.Mode.COMPOSE) {
                    val versions = boost(capture.typed, Voice.guide(voice, post))
                    drafts = versions.map { it.second }
                    Log.i(OwnvoiceService.TAG, "boosts=${drafts.size} in ${SystemClock.elapsedRealtime() - started} ms")
                    show(true, capture.conversation, capture.typed, versions.map { it.first }, voice, post)
                } else {
                    val anyway = intent.getBooleanExtra(ON_COMPUTER, false)
                    val engine = Computer.pick(this@DraftActivity, capture.app, anyway, OwnvoiceService.engine)
                    drafts = engine.drafts(capture.conversation, Voice.guide(voice, post = false)) { status.text = it }
                    writer = (engine as? Computer)?.wrote ?: Writer.PHONE
                    Log.i(OwnvoiceService.TAG, "drafts=${drafts.size} by $writer in ${SystemClock.elapsedRealtime() - started} ms")
                    if (engine is Computer) Privacy.noteWriter(this@DraftActivity, capture.at,
                        if (writer == Writer.COMPUTER) "Sent to your computer, which wrote the drafts." else "Sent to your computer, which didn't write them; this phone did.")
                    show(capture.input != null, capture.conversation, null, null, voice, post)
                    offerComputer(capture, engine, anyway)
                }
            } catch (e: PlainError) {
                Log.w(OwnvoiceService.TAG, "draft failed after ${SystemClock.elapsedRealtime() - started} ms: ${e.message}")
                status.text = e.message
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
                status.text = why + " " + status.text
                "Try my computer again"
            }
            engine !is Computer && Computer.wanted(this, capture.app, anyway = true) ->
                "Write this one on my computer"
            else -> return
        }
        list.addView(Button(this).apply {
            text = label
            setOnClickListener { intent.putExtra(ON_COMPUTER, true); recreate() }
        }, 1)
    }

    /** Compose boost: each style's version of what the user wrote, as (label, text). Never a new post. */
    private suspend fun boost(typed: String, guide: String): List<Pair<String, String>> {
        OwnvoiceService.engine.ensureReady { status.text = it }
        return Judge.Boost.entries.mapNotNull { how ->
            status.text = "${how.label}: rewriting on this phone…"
            Judge.clean(OwnvoiceService.engine.ask(Judge.rewritePrompt(typed, how.ask, guide), 256)).takeIf { it.isNotEmpty() }?.let { how.label to it }
        }
    }

    /** Shows the drafts, or in compose mode the user's [original] text and then its improved versions under their [labels]. */
    private fun show(canInsert: Boolean, conversation: String, original: String?, labels: List<String>?, voice: Voice.Rules, post: Boolean) {
        status.text = when {
            drafts.isEmpty() -> "The model returned no drafts. Try again."
            original != null -> "Insert one to replace your text, then send it yourself."
            canInsert -> "Insert one, then send it yourself."
            else -> "No text field was focused. Copy one."
        }
        val rows = mutableListOf<Row>()
        if (original != null && drafts.isNotEmpty()) rows += row("Your text", original, meaning = false, buttons = false, canInsert, voice, post)
        drafts.forEachIndexed { i, draft -> rows += row(labels?.get(i), draft, meaning = original != null, buttons = true, canInsert, voice, post, writer.takeIf { original == null }) }
        scores.clear()
        meanings.clear()
        repeat(rows.size) { scores += null; meanings += null }
        scope.launch { score(rows, conversation, original, voice, post) }
    }

    private fun row(label: String?, text: String, meaning: Boolean, buttons: Boolean, canInsert: Boolean, voice: Voice.Rules, post: Boolean, wrote: Writer? = null): Row {
        if (label != null) list.addView(TextView(this).apply {
            this.text = label
            textSize = 13f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(0xFF2E5BFF.toInt())
            setPadding(0, (12 * dp).toInt(), 0, 0)
        })
        val shown = TextView(this).apply {
            this.text = highlight(text, Slop.hits(text, voice, post))
            textSize = 16f
            setTextColor(Color.BLACK)
            setPadding(0, ((if (label == null) 10 else 2) * dp).toInt(), 0, (4 * dp).toInt())
        }
        list.addView(shown)
        if (wrote != null) list.addView(TextView(this).apply { this.text = wrote.caption; textSize = 12f; setTextColor(0xFF666666.toInt()) })
        val chips = Chips(this)
        val row = Row(text, shown, chips, chips.chip("Slop: checking…"), chips.chip("Quality: checking…"), chips.chip("Reach: checking…"),
            if (meaning) TextView(this).apply { textSize = 14f; this.text = "Meaning: checking…" } else null)
        list.addView(chips.row)
        list.addView(chips.detail)
        row.meaning?.let(list::addView)
        if (buttons) list.addView(LinearLayout(this).apply {
            addView(Button(context).apply { this.text = "Insert"; isEnabled = canInsert; setOnClickListener { insert(text) } })
            addView(Button(context).apply { this.text = "Copy"; setOnClickListener { copy(text) } })
        })
        return row
    }

    /** Scores the texts one by one after they show, so scoring never delays them; versions of [original] also get a meaning check. */
    private suspend fun score(rows: List<Row>, conversation: String, original: String?, voice: Voice.Rules, post: Boolean) {
        val started = SystemClock.elapsedRealtime()
        val message = ask(Judge.kindPrompt(conversation), 5)?.let(Judge::isMessage) ?: false
        val scoredBy = Judge.scoredBy(writer)
        rows.forEachIndexed { i, row ->
            val draft = row.text
            val result = Judge.scoreDraft(draft, ask(Judge.draftPrompt(conversation, draft, message, Voice.guide(voice, post && !message)), 220), message, voice, post)
            // A chat is never a fresh post, so the judge's answer can take back an ending-question mark.
            row.shown.text = highlight(draft, result.hits)
            val chips = row.chips
            val score = result.slop
            chips.set(row.slop, "Slop: ${Slop.words(score)}", slopDetail(result.hits, draft, result.generic, result.specific, score, scoredBy))
            chips.set(row.quality, "Quality: " + if (result.quality.isEmpty()) "not checked" else flags(result.quality),
                "Quality checks:\n" + checkLines(result.quality).ifEmpty { "The judge didn't answer." } +
                    "\n“Sounds like you” is a rough guess from what's on screen" +
                    (if (voice.empty) ".\n" else " and your rules under Your voice.\n") + scoredBy)
            if (message) chips.set(row.reach, "Response: " + if (result.reach.isEmpty()) "not checked" else flags(result.reach),
                "Response checks for a message:\n" + checkLines(result.reach).ifEmpty { "The judge didn't answer." } + "\n" + scoredBy)
            else chips.set(row.reach, "Reach: learning",
                "Reach has no number yet: Ownvoice won't predict reach until it can prove a prediction on your own posts. " +
                    "What it can see now:\n" + checkLines(result.reach) + "\n" + scoredBy)
            scores[i] = result
            if (row.meaning != null && original != null) {
                val m = Judge.meaning(original, draft, ask(Judge.rewriteCheckPrompt(original, draft), 80))
                row.meaning.showMeaning(m)
                meanings[i] = m
            }
        }
        Log.i(OwnvoiceService.TAG, "scored ${rows.size} texts (message=$message) in ${SystemClock.elapsedRealtime() - started} ms")
    }

    /** The judge's answer, or null when the model can't answer; the scores then fall back to rules. */
    private suspend fun ask(prompt: String, maxTokens: Int): String? = try {
        OwnvoiceService.engine.ask(prompt, maxTokens)
    } catch (e: PlainError) {
        Log.w(OwnvoiceService.TAG, "judge failed: ${e.message}")
        null
    }

    private fun insert(draft: String) {
        val service = OwnvoiceService.instance ?: return run { status.text = "Ownvoice is off. Use Copy instead." }
        finish()
        service.insert(draft)
    }

    private fun copy(draft: String) {
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice draft", draft))
        OwnvoiceService.instance?.say("Copied.")
        finish()
    }
}
