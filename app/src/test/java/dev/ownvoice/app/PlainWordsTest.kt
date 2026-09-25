package dev.ownvoice.app

import com.google.mlkit.genai.common.GenAiException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.lang.reflect.Modifier
import javax.xml.parsers.DocumentBuilderFactory

/** Ownvoice is for people with no interest in how it works, so no technical word may reach them. */
class PlainWordsTest {
    private val banned = Regex("(?i)gemini|gemma|\\bnano\\b|aicore|ml ?kit|\\bllm\\b|\\bmodel\\b|/100|/10\\b|judge|slop|characters|\\bprompt|\\btokens?\\b|on-device")

    private fun assertPlain(shown: Collection<String>) {
        assertTrue("nothing to check", shown.isNotEmpty())
        assertEquals("Technical words the user could see", emptyList<String>(), shown.filter { banned.containsMatchIn(it) })
    }

    @Test fun errorMessages() {
        val codes = GenAiException.ErrorCode::class.java.fields.filter { Modifier.isStatic(it.modifiers) && it.type == Int::class.javaPrimitiveType }.map { it.getInt(null) }
        assertTrue(codes.size > 5)
        assertPlain(codes.map(Nano::message) + Nano.message(-1) + Nano.UNSUPPORTED + Nano.GETTING_READY)
    }

    @Test fun checksAndVerdicts() {
        val keys = listOf("SPECIFIC", "CLEAR", "VOICE", "FITS", "CLAIMS", "ANSWERS", "NEXT_STEP", "CONVERSATION", "NOT_INTERESTED", "HOOK")
        val shown = mutableListOf(Judge.GENERAL, Judge.WRITE_FIRST, Judge.quickChecks(null), Judge.quickChecks("Sam"))
        val long = "Read this https://example.com " + "x".repeat(300)
        for (verdict in listOf("pass", "concern")) for (message in listOf(true, false)) for (who in listOf(null, "Sam")) for (generic in listOf(0, 5, 10)) {
            val answer = "GENERIC: $generic\nSPECIFICITY: ${10 - generic}\n" + keys.joinToString("\n") { "$it: $verdict" }
            for (draft in listOf("Saturday works.", long, "Let's circle back — who's in?")) {
                val s = Judge.scoreDraft(draft, answer, message, Voice.Rules(never = listOf("circle back"), noDashes = true, statementEndings = true), post = true, who = who)
                shown += (s.quality + s.reach).flatMap { listOf(it.name, it.reason) }
                Judge.verdict(s).let { shown += it.lead + it.rest }
            }
        }
        for (answer in listOf("MEANING: pass", "MEANING: concern - drops the date"))
            Judge.meaning("See you at 5", "See you then", answer)?.let { shown += listOf(it.name, it.reason) }
        Judge.meaning("See you then", "See you at 4", null)?.let { shown += listOf(it.name, it.reason) }
        shown += Judge.Rewrite.entries.map { it.label } + Judge.Boost.entries.map { it.label }
        assertPlain(shown)
    }

    @Test fun markedPhrases() {
        val text = "Here's a reply: Great post! Let's delve in. It's not just fast, but fun — quick, simple, and fun. #one #two 😀😀😀 What do you think?"
        val reasons = Slop.hits(text, Voice.Rules(never = listOf("delve")), post = true).map { it.reason } +
            Slop.hits("Is it on?", Voice.Rules(statementEndings = true), post = true).map { it.reason }
        assertPlain(reasons.toSet() + (0..100).map(Slop::words))
    }

    @Test fun readLog() {
        val shown = Judge.Mode.entries.flatMap { mode -> listOf("" to "", "chat" to "", "" to "hi", "chat" to "hi").map { (c, t) -> Privacy.summary(mode, c, t) } } +
            listOf("Reply drafts. 117 characters on screen, 0 in your field.", "Compose boost. 0 characters on screen, 12 in your field.", "Nothing to work on. 0 characters on screen, 0 in your field.").map(Privacy::plain)
        assertPlain(shown)
    }

    @Test fun stringResources() {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File("src/main/res/values/strings.xml"))
        val strings = doc.getElementsByTagName("string").let { list -> (0 until list.length).map { list.item(it).textContent } }
        assertPlain(strings)
    }

    /** The app names "Where should I help?" offers; the setup screens' own texts are checked on the device by FirstRunTest. */
    @Test fun offeredApps() = assertPlain(Onboarding.OFFERED.map { it.second })

    /** What the phone says about the computer link: where a reply was written, why the computer didn't, and who checked it. */
    @Test fun computerWords() = assertPlain(
        listOf("unreachable", "timeout", "limit", "busy", "not_paired", "failed", "no_texts").map(Computer::reason) +
            Writer.entries.map { it.caption } + Writer.entries.map(Judge::checkedBy).filter { it.isNotEmpty() },
    )

    @Test fun catchesATechnicalWord() {
        for (bad in listOf("Scored by the judge", "Slop: clean (10/100)", "The on-device model is ready (nano-v3).", "117 characters on screen", "Update AICore", "Gemini Nano", "Gemma"))
            assertEquals(bad, true, banned.containsMatchIn(bad))
        for (fine in listOf("Sounds natural and answers Sam", "Getting Ownvoice ready… this happens once.", "A bit stock"))
            assertEquals(fine, false, banned.containsMatchIn(fine))
    }
}
