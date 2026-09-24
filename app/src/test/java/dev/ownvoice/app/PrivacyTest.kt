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

    @Test fun summaryHasCountsAndFirstLineOnly() {
        val chat = "\n  Sam: Are we still on for Saturday?\nSam: I can bring the tent."
        assertEquals("${chat.length} characters on screen, 3 in your field. First line: “Sam: Are we still on for Saturday?”", Privacy.summary(chat, "hey"))
        val long = "x".repeat(200)
        assertEquals("200 characters on screen, 0 in your field. First line: “${"x".repeat(60)}…”", Privacy.summary(long, ""))
        assertEquals("0 characters on screen, 0 in your field. First line: nothing", Privacy.summary("", ""))
    }

    @Test fun readSurvivesEncodingAndTabsCannotBreakIt() {
        val read = Privacy.Read(42, "com.android.chrome", "Chrome", "a\tb\nc")
        assertEquals(Privacy.Read(42, "com.android.chrome", "Chrome", "a b c"), Privacy.Read.decode(read.encode()))
        assertNull(Privacy.Read.decode("garbage"))
        assertNull(Privacy.Read.decode(""))
    }
}
