package dev.ownvoice.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceTest {
    private val fixture = javaClass.getResource("/voice-fixture.md")!!.readText()

    @Test fun importsNeverSayBulletsAndRules() {
        val found = Voice.parse(fixture)
        assertEquals(listOf("circle the wagons", "low-hanging fruit", "synergy", "Hand on heart", "wheelhouse"), found.never)
        assertEquals(1, found.skipped)
        assertTrue(found.noDashes)
        assertTrue(found.statementEndings)
    }

    @Test fun importsNothingFromOtherSections() {
        val found = Voice.parse("# Me\n## Diction\n- \"delve\"\n- Uses em dashes a lot — like this.\n## Endings\nAsk questions freely.")
        assertEquals(emptyList<String>(), found.never)
        assertFalse(found.noDashes)
        assertFalse(found.statementEndings)
    }

    @Test fun readsBoldHeadingsAndZeroEmDashes() {
        val found = Voice.parse("**Never say:**\n* per my last email\n\nZero em-dashes, ever.")
        assertEquals(listOf("per my last email"), found.never)
        assertTrue(found.noDashes)
    }

    @Test fun mergeAddsWithoutDuplicatesOrSwitchingOff() {
        val rules = Voice.merge(Voice.Rules(listOf("Synergy"), noDashes = false, statementEndings = true, note = "blunt"), Voice.parse(fixture))
        assertEquals(listOf("Synergy", "circle the wagons", "low-hanging fruit", "Hand on heart", "wheelhouse"), rules.never)
        assertTrue(rules.noDashes && rules.statementEndings)
        assertEquals("blunt", rules.note)
    }

    private val voice = Voice.Rules(listOf("circle the wagons", "low-hanging fruit", "don't worry", "AI"), noDashes = true, statementEndings = true)
    private fun marked(text: String, post: Boolean = false) =
        Slop.hits(text, voice, post).filter { it.reason == Voice.NEVER_SAY || it.reason == Voice.ENDS_ON_QUESTION }.map { text.substring(it.start, it.end) }

    @Test fun matchesNeverSayPhrases() {
        assertEquals(listOf("Circle  the\nwagons"), marked("Time to Circle  the\nwagons, team."))
        assertEquals(listOf("low-hanging fruit"), marked("Grab the low-hanging fruit first."))
        assertEquals(listOf("Don’t worry"), marked("Don’t worry about it."))
        assertEquals(listOf("AI"), marked("The AI wrote it."))
        assertEquals(emptyList<String>(), marked("She said it again. Maintain the pace."))
        assertEquals(emptyList<String>(), marked("We circled the wagons."))
    }

    @Test fun reasonSaysNeverSayList() {
        assertEquals("on your never-say list", Slop.hits("low-hanging fruit", voice).single().reason)
    }

    @Test fun endingQuestionOnlyInPosts() {
        assertEquals(listOf("Who else ships on Fridays?"), marked("Shipped it. Who else ships on Fridays?", post = true))
        assertEquals(emptyList<String>(), marked("Shipped it. Who else ships on Fridays?", post = false))
        assertEquals(emptyList<String>(), marked("Shipped it on a Friday.", post = true))
    }

    @Test fun rulesDecideSoundsLikeYou() {
        val answer = "GENERIC: 2\nSPECIFICITY: 8\nSPECIFIC: pass\nCLEAR: pass\nVOICE: pass - fine\nFITS: pass\nCLAIMS: pass"
        val scores = Judge.scoreDraft("Let's circle the wagons — who's in?", answer, message = false, voice, post = true)
        val check = scores.quality.single { it.name == "Sounds like you" }
        assertFalse(check.ok)
        assertEquals("Breaks your rules: says “circle the wagons” from your never-say list; has an em dash; ends on a question.", check.reason)
        assertEquals(listOf("Specific", "Clear", "Sounds like you", "Fits the thread", "Claims"), scores.quality.map { it.name })
        assertTrue(Judge.scoreDraft("Saturday works.", answer, message = false, voice, post = true).quality.single { it.name == "Sounds like you" }.ok)
    }

    @Test fun guideIsShortAndSkipsEndingsInReplies() {
        val rules = voice.copy(note = "short, lowercase")
        assertEquals("No em dashes. How they write: short, lowercase", Voice.guide(rules, post = false))
        assertEquals("No em dashes. End on a statement, not a question. How they write: short, lowercase", Voice.guide(rules, post = true))
        assertEquals("", Voice.guide(Voice.Rules(List(40) { "phrase number $it" }), post = true))
        assertEquals(216, Voice.guide(Voice.Rules(note = "x".repeat(900)), post = true).length)
    }
}
