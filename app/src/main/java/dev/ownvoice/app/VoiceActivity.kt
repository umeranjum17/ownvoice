package dev.ownvoice.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.util.Log
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import com.google.android.material.materialswitch.MaterialSwitch
import android.widget.TextView

/**
 * Your voice: the never-say list, a few rules and a "how I write" note, kept on this phone. Imports
 * a markdown voice profile from the file picker or a share, and shows what it found before adding it.
 */
class VoiceActivity : Activity() {
    private lateinit var dashes: MaterialSwitch
    private lateinit var endings: MaterialSwitch
    private lateinit var note: EditText
    private lateinit var never: EditText
    private lateinit var found: TextView
    private lateinit var confirm: LinearLayout
    private lateinit var box: LinearLayout

    /** What the last import found, waiting for the user to add it; read by the on-device test. */
    var pending: Voice.Found? = null
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        dashes = MaterialSwitch(this).apply { contentDescription = "No long dashes" }
        endings = MaterialSwitch(this).apply { contentDescription = "End posts on a statement" }
        note = field("For example: short sentences, lowercase, blunt", InputType.TYPE_TEXT_FLAG_CAP_SENTENCES).apply { filters = arrayOf(InputFilter.LengthFilter(300)) }
        never = field("One phrase per line", 0).apply { minLines = 3 }
        found = text("")
        confirm = LinearLayout(this).apply {
            visibility = View.GONE
            addView(filled("Add these") { add() })
            addView(ghost("Cancel") { dismiss() })
        }
        val page = page("Your voice", "Phrases you never say and how you like to write. Ownvoice follows these when it writes, " +
            "and points out when a draft breaks them. They stay on this phone.")
        page.add(actions(ghost("Import from a file") { pick() }))
        // What an import found, on a tinted card like the user's own text elsewhere.
        box = page.add(card(filled = true).apply {
            visibility = View.GONE
            add(found)
            add(confirm, top = 10f)
        }, top = 4f)
        page.add(group().apply {
            row(item(null, "No long dashes (—)", "Ownvoice won't use them", dashes) { dashes.toggle() })
            row(item(null, "End posts on a statement", "Questions are still fine in replies", endings) { endings.toggle() })
        }, top = 12f)
        page.add(label("How I write").apply { setPadding(px(8), 0, 0, 0) }, top = 24f, bottom = 8f)
        page.add(card(filled = true).apply { setPadding(px(16), px(14), px(16), px(14)); add(note) })
        page.add(label("Never say").apply { setPadding(px(8), 0, 0, 0) }, top = 24f, bottom = 4f)
        page.add(text("One phrase per line. Any capitals; whole words only.", Type.BODY).apply { setPadding(px(8), 0, 0, 0) }, bottom = 8f)
        page.add(card(filled = true).apply { setPadding(px(16), px(14), px(16), px(14)); add(never) })
        page.add(text("Wipe everything, under What Ownvoice read, deletes these too.", Type.BODY).apply { setPadding(px(8), 0, px(8), 0) }, top = 12f)
        dashes.setOnCheckedChangeListener { _, _ -> save() }
        endings.setOnCheckedChangeListener { _, _ -> save() }
        if (savedInstanceState == null) shared(intent)
    }

    private fun field(hint: String, flags: Int) = EditText(this).apply {
        this.hint = hint
        setTextAppearance(Type.BODY_LARGE.style)
        setTextColor(onSurface)
        setHintTextColor(muted)
        background = null
        setPadding(0, 0, 0, 0)
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or flags
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
        if (text == null) return run { box.visibility = View.VISIBLE; found.text = "Couldn't open that file." }
        preview(text)
    }

    /** Shows what [markdown] would add, for the user to confirm with Add these. */
    fun preview(markdown: String) {
        box.visibility = View.VISIBLE
        val f = Voice.parse(markdown)
        pending = f
        val rules = listOfNotNull("No long dashes (—)".takeIf { f.noDashes }, "End posts on a statement, not a question".takeIf { f.statementEndings })
        if (f.never.isEmpty() && rules.isEmpty()) {
            found.text = "Couldn't find any phrases in that file."
            pending = null
            confirm.visibility = View.GONE
            return
        }
        found.text = buildString {
            append("Found in the file:\n")
            if (f.never.isNotEmpty()) append("Never say (${f.never.size}): ").append(f.never.joinToString(", ") { "“$it”" }).append('\n')
            rules.forEach { append("Rule: ").append(it).append('\n') }
            if (f.skipped > 0) append(if (f.skipped == 1) "Left out 1 note that reads as advice, not a phrase.\n"
                else "Left out ${f.skipped} notes that read as advice, not phrases.\n")
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
        box.visibility = View.GONE
        confirm.visibility = View.GONE
    }

    companion object {
        private const val PICK = 1
    }
}
