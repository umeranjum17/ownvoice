package dev.ownvoice.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.graphics.Color
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
    private val scope = MainScope()
    private lateinit var status: TextView
    private lateinit var list: LinearLayout

    /** Drafts on show, read by the on-device test. */
    var drafts: List<String> = emptyList()
        private set

    /** Each draft's scores once the judge has answered (null until then), read by the on-device test. */
    val scores = mutableListOf<Judge.Scores?>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        status = TextView(this)
        list = sheet(status)
        draft()
    }

    // Every way out (Insert, Copy, Close, tap outside, Back) stops the activity.
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

    private fun draft() {
        val capture = OwnvoiceService.instance?.capture ?: return finish()
        status.text = "Reading done."
        scope.launch {
            val started = SystemClock.elapsedRealtime()
            try {
                drafts = OwnvoiceService.engine.drafts(capture.conversation, capture.typed) { status.text = it }
                Log.i(OwnvoiceService.TAG, "drafts=${drafts.size} in ${SystemClock.elapsedRealtime() - started} ms")
                show(capture.input != null, capture.conversation)
            } catch (e: PlainError) {
                Log.w(OwnvoiceService.TAG, "draft failed after ${SystemClock.elapsedRealtime() - started} ms: ${e.message}")
                status.text = e.message
            }
        }
    }

    private fun show(canInsert: Boolean, conversation: String) {
        status.text = when {
            drafts.isEmpty() -> "The model returned no drafts. Try again."
            canInsert -> "Insert one, then send it yourself."
            else -> "No text field was focused. Copy one."
        }
        val rows = drafts.map { draft ->
            val hits = Slop.hits(draft)
            list.addView(TextView(this).apply {
                text = highlight(draft, hits)
                textSize = 16f
                setTextColor(Color.BLACK)
                setPadding(0, (10 * dp).toInt(), 0, (4 * dp).toInt())
            })
            val chips = Chips(this)
            val row = Triple(chips.chip("Slop: checking…"), chips.chip("Quality: checking…"), chips.chip("Reach: checking…"))
            list.addView(chips.row)
            list.addView(chips.detail)
            list.addView(LinearLayout(this).apply {
                addView(Button(context).apply { text = "Insert"; isEnabled = canInsert; setOnClickListener { insert(draft) } })
                addView(Button(context).apply { text = "Copy"; setOnClickListener { copy(draft) } })
            })
            chips to row
        }
        scores.clear()
        repeat(drafts.size) { scores += null }
        scope.launch { score(rows, conversation) }
    }

    /** Scores the drafts one by one after they show, so scoring never delays them. */
    private suspend fun score(rows: List<Pair<Chips, Triple<TextView, TextView, TextView>>>, conversation: String) {
        val started = SystemClock.elapsedRealtime()
        val message = ask(Judge.kindPrompt(conversation), 5)?.let(Judge::isMessage) ?: false
        drafts.forEachIndexed { i, draft ->
            val result = Judge.scoreDraft(draft, ask(Judge.draftPrompt(conversation, draft, message), 220), message)
            val (chips, row) = rows[i]
            val (slop, quality, reach) = row
            val score = result.slop
            chips.set(slop, "Slop: ${Slop.words(score)}", slopDetail(result.hits, draft, result.generic, result.specific, score))
            chips.set(quality, "Quality: " + if (result.quality.isEmpty()) "not checked" else flags(result.quality),
                "Quality checks:\n" + checkLines(result.quality).ifEmpty { "The judge didn't answer." } +
                    "\n“Sounds like you” is a rough guess from what's on screen.\n" + Judge.SAME_MODEL)
            if (message) chips.set(reach, "Response: " + if (result.reach.isEmpty()) "not checked" else flags(result.reach),
                "Response checks for a message:\n" + checkLines(result.reach).ifEmpty { "The judge didn't answer." } + "\n" + Judge.SAME_MODEL)
            else chips.set(reach, "Reach: learning",
                "Reach has no number yet: Ownvoice won't predict reach until it can prove a prediction on your own posts. " +
                    "What it can see now:\n" + checkLines(result.reach) + "\n" + Judge.SAME_MODEL)
            scores[i] = result
        }
        Log.i(OwnvoiceService.TAG, "scored ${drafts.size} drafts (message=$message) in ${SystemClock.elapsedRealtime() - started} ms")
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
