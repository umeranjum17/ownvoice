package dev.ownvoice.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PrivacyTest {
    private val day = 24L * 60 * 60 * 1000

    @Test fun defaultListIsOnAndEverythingElseOff() {
        for (app in listOf("com.twitter.android", "com.linkedin.android", "com.google.android.gm", "com.whatsapp")) assertTrue(app, Privacy.allowed(app, null))
        for (app in listOf("org.thoughtcrime.securesms", "com.android.chrome", "dev.ownvoice.app")) assertFalse(app, Privacy.allowed(app, null))
    }

    @Test fun userChoiceWins() {
        assertTrue(Privacy.allowed("org.thoughtcrime.securesms", true))
        assertFalse(Privacy.allowed("com.whatsapp", false))
    }

    @Test fun readsOlderThan30DaysAreDropped() {
        val now = 100 * day
        val reads = listOf(0L, now - 31 * day, now - 30 * day, now - 30 * day + 1, now - day, now).map { Privacy.Read(it, "a", "A", "s") }
        assertEquals(listOf(now - 30 * day + 1, now - day, now), Privacy.keep(reads, now).map { it.time })
    }

    @Test fun summarySaysWhatItDidButNeverTheText() {
        val chat = "Sam: Are we still on for Saturday?\nSam: I can bring the tent."
        assertEquals("Suggested replies. Read the chat on screen.", Privacy.summary(Judge.Mode.REPLY, chat, ""))
        assertEquals("Polished your message. Read the chat on screen and your message.", Privacy.summary(Judge.Mode.COMPOSE, chat, "Saturday works"))
        assertEquals("Nothing to help with. Nothing was on screen.", Privacy.summary(Judge.Mode.EMPTY, "", ""))
    }

    @Test fun oldEntriesReadInPlainWords() {
        assertEquals("Polished your message. Read your message.", Privacy.plain("Compose boost. 0 characters on screen, 14 in your field."))
        assertEquals("Suggested replies. Read the chat on screen.", Privacy.plain("Reply drafts. 117 characters on screen, 0 in your field."))
        assertEquals("Suggested replies. Read the chat on screen.", Privacy.plain("Suggested replies. Read the chat on screen."))
    }

    @Test fun readSurvivesEncodingAndTabsCannotBreakIt() {
        val read = Privacy.Read(42, "com.android.chrome", "Chrome", "a\tb\nc")
        assertEquals(Privacy.Read(42, "com.android.chrome", "Chrome", "a b c"), Privacy.Read.decode(read.encode()))
        assertNull(Privacy.Read.decode("garbage"))
        assertNull(Privacy.Read.decode(""))
    }
}
