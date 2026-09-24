package dev.ownvoice.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class JudgeTest {
    private val answer = """
        **GENERIC:** 3
        SPECIFICITY: 7/10
        - SPECIFIC: pass - names the day and the stove
        CLEAR: pass
        VOICE: concern - more formal than their messages
        FITS: pass - short like the thread
        CLAIMS: concern - says they own a stove
        ANSWERS: pass - confirms Saturday
        NEXT_STEP: concern - no meeting time
    """.trimIndent()

    @Test fun readsTheJudgesLines() {
        val s = Judge.scoreDraft("Saturday works. I'll bring my stove.", answer, message = true)
        assertEquals(3, s.generic)
        assertEquals(7, s.specific)
        assertEquals(listOf("Specific", "Clear", "Sounds like you", "Fits the thread", "Claims"), s.quality.map { it.name })
        assertEquals(listOf(true, true, false, true, false), s.quality.map { it.ok })
        assertEquals("Says they own a stove", s.quality.last().reason)
        assertEquals(listOf("Answers every question", "Clear next step"), s.reach.map { it.name })
    }

    @Test fun postsGetReachReasonsWithRules() {
        val s = Judge.scoreDraft("Read this https://example.com", "CONVERSATION: concern - nothing to reply to", message = false)
        assertEquals(listOf("Starts a conversation", "Links", "Length"), s.reach.map { it.name })
        assertFalse(s.reach[1].ok)
    }

    @Test fun noAnswerFallsBackToRules() {
        val s = Judge.scoreDraft("Saturday works — see you.", null, message = false)
        assertNull(s.generic)
        assertTrue(s.quality.isEmpty())
        assertEquals(10, s.slop)
    }

    @Test fun meaningCheckCatchesInventedNumbers() {
        assertFalse(Judge.meaning("we grew fast", "we grew 3x fast", "MEANING: pass").ok)
        assertFalse(Judge.meaning("see you soon", "see you on Friday", "MEANING: concern - adds a day").ok)
        assertTrue(Judge.meaning("see you soon", "See you soon.", "MEANING: pass - same").ok)
        assertEquals("Drops 40 from your text.", Judge.meaning("we grew 40 percent", "we grew a lot", "MEANING: pass").reason)
        assertEquals("Adds 10 not in your text. Drops 9 from your text.", Judge.meaning("at 9", "at 10", null).reason)
        assertTrue(Judge.meaning("sold 1000 at 9.30", "Sold 1,000 at 9:30.", "MEANING: pass").ok)
        assertEquals("\"Overhaul\" is stronger", Judge.meaning("a", "b", "MEANING: concern - \"Overhaul\" is stronger").reason)
    }

    @Test fun onlyPassOrConcernCounts() {
        val s = Judge.scoreDraft("Great post", "CONVERSATION: yes\nNOT_INTERESTED: no - it's relevant\nHOOK: concern - weak opener", message = false)
        assertEquals(listOf("Hook", "Length"), s.reach.map { it.name })
        assertFalse(s.reach[0].ok)
        assertTrue(Judge.scoreDraft("x", "CLAIMS: Pass", message = true).quality.single().ok)
    }

    @Test fun kind() {
        assertTrue(Judge.isMessage("MESSAGE"))
        assertFalse(Judge.isMessage("Post."))
    }
}
