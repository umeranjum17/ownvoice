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
        assertEquals(listOf("Says something real", "One clear point", "Doesn't sound like you", "Fits the conversation", "Might make something up"), s.quality.map { it.name })
        assertEquals(listOf(true, true, false, true, false), s.quality.map { it.ok })
        assertEquals("Says they own a stove", s.quality.last().reason)
        assertEquals(listOf("Answers the question", "Not clear what happens next"), s.reach.map { it.name })
    }

    @Test fun postsGetReachReasonsWithRules() {
        val s = Judge.scoreDraft("Read this https://example.com", "CONVERSATION: concern - nothing to reply to", message = false)
        assertEquals(listOf("Doesn't invite replies", "Links can mean fewer views", "Right length for a post"), s.reach.map { it.name })
        assertFalse(s.reach[1].ok)
    }

    @Test fun noAnswerFallsBackToRules() {
        val s = Judge.scoreDraft("Saturday works — see you.", null, message = false)
        assertNull(s.generic)
        assertTrue(s.quality.isEmpty())
        assertEquals(10, s.slop)
    }

    @Test fun meaningCheckCatchesInventedNumbers() {
        assertFalse(Judge.meaning("we grew fast", "we grew 3x fast", "MEANING: pass")!!.ok)
        assertFalse(Judge.meaning("see you soon", "see you on Friday", "MEANING: concern - adds a day")!!.ok)
        assertTrue(Judge.meaning("see you soon", "See you soon.", "MEANING: pass - same")!!.ok)
        assertEquals("It leaves out “40”", Judge.meaning("we grew 40 percent", "we grew a lot", "MEANING: pass")!!.reason)
        assertEquals("It adds “10” and leaves out “9”", Judge.meaning("at 9", "at 10", null)!!.reason)
        assertTrue(Judge.meaning("sold 1000 at 9.30", "Sold 1,000 at 9:30.", "MEANING: pass")!!.ok)
        assertEquals("\"Overhaul\" is stronger", Judge.meaning("a", "b", "MEANING: concern - \"Overhaul\" is stronger")!!.reason)
        // Unchecked is never shown as "same meaning".
        assertNull(Judge.meaning("see you soon", "See you soon.", null))
    }

    @Test fun onlyPassOrConcernCounts() {
        val s = Judge.scoreDraft("Great post", "CONVERSATION: yes\nNOT_INTERESTED: no - it's relevant\nHOOK: concern - weak opener", message = false)
        assertEquals(listOf("Weak first line", "Right length for a post"), s.reach.map { it.name })
        assertFalse(s.reach[0].ok)
        assertTrue(Judge.scoreDraft("x", "CLAIMS: Pass", message = true).quality.single().ok)
        assertEquals("The order is altered.", Judge.meaning("a", "b", "MEANING: - Concern: The order is altered.")!!.reason)
    }

    @Test fun kind() {
        assertTrue(Judge.isMessage("MESSAGE"))
        assertFalse(Judge.isMessage("Post."))
    }

    @Test fun ownTextIsBoostedNotReplacedByADraft() {
        assertEquals(Judge.Mode.COMPOSE, Judge.mode("shipped the thing today", ""))
        assertEquals(Judge.Mode.COMPOSE, Judge.mode("ok so", "Sam: Are we still on for Saturday?"))
    }

    @Test fun emptyFieldRepliesToAConversation() {
        assertEquals(Judge.Mode.REPLY, Judge.mode("", "Sam\nAre we still on for Saturday?"))
        assertEquals(Judge.Mode.REPLY, Judge.mode("  \n", "Sam: Are we still on for Saturday?"))
    }

    @Test fun emptyFieldWithNothingToReplyToInventsNothing() {
        assertEquals(Judge.Mode.EMPTY, Judge.mode("", ""))
        assertEquals(Judge.Mode.EMPTY, Judge.mode("", "Cancel\nPost\nEveryone can reply\nexample.com"))
    }

    @Test fun verdictIsOnePlainSentence() {
        val good = "GENERIC: 1\nSPECIFICITY: 9\nSPECIFIC: pass\nCLAIMS: pass\nANSWERS: pass - confirms Saturday"
        assertEquals(Judge.Verdict(true, "Sounds natural", " and answers Sam"), Judge.verdict(Judge.scoreDraft("Saturday works.", good, message = true, who = "Sam")))
        val claims = "GENERIC: 1\nSPECIFICITY: 9\nCLAIMS: concern - says they own a stove"
        assertEquals(Judge.Verdict(false, "Might make something up"), Judge.verdict(Judge.scoreDraft("Saturday works.", claims, message = true)))
        val stock = Judge.scoreDraft("Great question! Let's circle back. What do you think?", "GENERIC: 8\nSPECIFICITY: 2", message = true)
        assertEquals(Judge.Verdict(false, "Sounds canned", ": 3 phrases you could say more simply"), Judge.verdict(stock))
        // General but no stock phrases: say what would help, not "canned".
        val general = Judge.scoreDraft("Yep, still on!", "GENERIC: 9\nSPECIFICITY: 1\nSPECIFIC: concern - no details", message = true)
        assertEquals(Judge.Verdict(false, "Could be more specific"), Judge.verdict(general))
        assertEquals(Judge.Verdict(false, "A bit general"), Judge.verdict(Judge.scoreDraft("Yep, still on!", "GENERIC: 9\nSPECIFICITY: 1", message = true)))
        // A post's reach reasons stay in the "Why?" note.
        val post = Judge.scoreDraft("Shipped the tent fix today, see https://example.com", "GENERIC: 1\nSPECIFICITY: 9\nHOOK: concern - weak opener", message = false)
        assertEquals(Judge.Verdict(true, "Sounds natural"), Judge.verdict(post))
    }

    @Test fun whoIsTheOnePersonInAChat() {
        assertEquals("Sam", Judge.who("Sam: Are we still on for Saturday?\nSam: I can bring the tent."))
        assertNull(Judge.who("Update: shipped the fix"))
        assertNull(Judge.who("Sam\nAre we still on for Saturday?"))
        assertEquals("These are quick checks to help you choose. You know Sam best.", Judge.quickChecks("Sam"))
    }

    @Test fun cleanDropsPreambleAndQuotes() {
        assertEquals("Shipped it.\nMore soon", Judge.clean("Here's the rewrite:\n\"Shipped it.\nMore soon\""))
        assertEquals("Here: it is", Judge.clean("Here: it is"))
    }
}
