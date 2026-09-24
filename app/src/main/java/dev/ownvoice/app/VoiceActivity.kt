package dev.ownvoice.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView

/**
 * Your voice: the never-say list, a few rules and a "how I write" note, kept on this phone. Imports
 * a markdown voice profile from the file picker or a share, and shows what it found before adding it.
 */
class VoiceActivity : Activity() {
    private lateinit var dashes: Switch
    private lateinit var endings: Switch
    private lateinit var note: EditText
    private lateinit var never: EditText
    private lateinit var found: TextView
    private lateinit var confirm: LinearLayout

    /** What the last import found, waiting for the user to add it; read by the on-device test. */
    var pending: Voice.Found? = null
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * dp).toInt()
        dashes = Switch(this).apply { text = "No em dashes"; textSize = 16f; setPadding(0, pad / 2, 0, pad / 2) }
        endings = Switch(this).apply { text = "End posts on a statement, not a question (questions are fine in replies)"; textSize = 16f; setPadding(0, pad / 2, 0, pad / 2) }
        note = EditText(this).apply {
            hint = "For example: short sentences, lowercase, blunt"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            filters = arrayOf(InputFilter.LengthFilter(300))
        }
        never = EditText(this).apply {
            hint = "One phrase per line"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 3
        }
        found = TextView(this).apply { textSize = 15f; setPadding(0, pad / 2, 0, 0) }
        confirm = LinearLayout(this).apply {
            visibility = View.GONE
            addView(Button(context).apply { text = "Add these"; setOnClickListener { add() } })
            addView(Button(context).apply { text = "Cancel"; setOnClickListener { dismiss() } })
        }
        setContentView(FrameLayout(this).apply { fitsSystemWindows = true; addView(ScrollView(context).apply { addView(LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            addView(TextView(context).apply { text = "Your voice"; textSize = 24f })
            addView(TextView(context).apply {
                textSize = 14f
                text = "Phrases you never say and how you like to write. Ownvoice highlights them in drafts, checks them under " +
                    "“Sounds like you”, and asks the model to follow them. They stay on this phone; Wipe everything under What was read deletes them."
            })
            addView(Button(context).apply { text = "Import a voice profile (markdown file)"; setOnClickListener { pick() } })
            addView(found)
            addView(confirm)
            addView(dashes)
            addView(endings)
            addView(TextView(context).apply { text = "How I write"; textSize = 18f; setPadding(0, pad, 0, 0) })
            addView(note)
            addView(TextView(context).apply { text = "Never say"; textSize = 18f; setPadding(0, pad, 0, 0) })
            addView(TextView(context).apply { text = "One phrase per line. Any case; whole words only."; textSize = 14f })
            addView(never)
        }) }) })
        dashes.setOnCheckedChangeListener { _, _ -> save() }
        endings.setOnCheckedChangeListener { _, _ -> save() }
        if (savedInstanceState == null) shared(intent)
    }

    override fun onResume() {
        super.onResume()
        load()
    }

    /** A voice profile shared to Ownvoice, as a file or as text. */
    private fun shared(intent: Intent) {
        if (intent.action != Intent.ACTION_SEND) return
        @Suppress("DEPRECATION")
        intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let(::import) ?: intent.getStringExtra(Intent.EXTRA_TEXT)?.let(::preview)
    }

    override fun onPause() {
        save()
        super.onPause()
    }

    private fun load() {
        val rules = Voice.rules(this)
        // Text first: a switch change saves the whole screen.
        note.setText(rules.note)
        never.setText(rules.never.joinToString("\n"))
        dashes.isChecked = rules.noDashes
        endings.isChecked = rules.statementEndings
    }

    private fun shown() = Voice.Rules(never.text.lines().map { it.trim() }.filter { it.isNotEmpty() }, dashes.isChecked, endings.isChecked, note.text.toString())

    private fun save() = Voice.save(this, shown())

    private fun pick() {
        // Markdown has no MIME type every file manager agrees on, so offer any file.
        startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"), PICK)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == PICK && resultCode == RESULT_OK) data?.data?.let(::import)
    }

    private fun import(uri: Uri) {
        val text = try {
            // ponytail: first 5,000 lines; a voice profile is a page or two.
            contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.lineSequence().take(5_000).joinToString("\n") }
        } catch (e: Exception) {
            Log.w(OwnvoiceService.TAG, "voice import failed: $e")
            null
        }
        if (text == null) return run { found.text = "Couldn't read that file." }
        preview(text)
    }

    /** Shows what [markdown] would add, for the user to confirm with Add these. */
    fun preview(markdown: String) {
        val f = Voice.parse(markdown)
        pending = f
        val rules = listOfNotNull("No em dashes".takeIf { f.noDashes }, "End posts on a statement, not a question".takeIf { f.statementEndings })
        if (f.never.isEmpty() && rules.isEmpty()) {
            found.text = "Nothing to import. Ownvoice looks for bullets under a heading with “Never say” in it, a ban on em dashes, " +
                "and posts ending on “statements, not questions”."
            pending = null
            confirm.visibility = View.GONE
            return
        }
        found.text = buildString {
            append("Found in the file:\n")
            if (f.never.isNotEmpty()) append("Never say (${f.never.size}): ").append(f.never.joinToString(", ") { "“$it”" }).append('\n')
            rules.forEach { append("Rule: ").append(it).append('\n') }
            if (f.skipped > 0) append(if (f.skipped == 1) "Skipped 1 never-say note that reads as advice, not a phrase.\n"
                else "Skipped ${f.skipped} never-say notes that read as advice, not phrases.\n")
            append("Nothing else in the file is kept. Add these to Your voice?")
        }
        confirm.visibility = View.VISIBLE
    }

    private fun add() {
        val f = pending ?: return
        Voice.save(this, Voice.merge(shown(), f))
        load()
        found.text = "Added. Edit or delete anything below."
        pending = null
        confirm.visibility = View.GONE
    }

    private fun dismiss() {
        pending = null
        found.text = ""
        confirm.visibility = View.GONE
    }

    companion object {
        private const val PICK = 1
    }
}
