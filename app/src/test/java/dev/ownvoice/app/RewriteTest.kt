package dev.ownvoice.app

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RewriteTest {
    @Test fun readsTheVersions() {
        assertEquals(listOf("hey, i'm in", "in", "i'm in, see you at 7"), Judge.versions("{\"versions\":[\"hey, i'm in\",\"in\",\"i'm in, see you at 7\"]}"))
        // Code fences, a lead-in line, escapes and newlines inside a version.
        val fenced = "Sure:\n```json\n{ \"versions\" : [\n  \"line one\\nline \\\"two\\\"\",\n  \"caf\\u00e9 at 9\" ,\"a\\\\b\"\n] }\n```"
        assertEquals(listOf("line one\nline \"two\"", "café at 9", "a\\b"), Judge.versions(fenced))
        assertEquals(listOf("one", "two"), Judge.versions("[\"one\", \"two\"]"))
    }

    @Test fun readsVersionsAsTheyLand() {
        val full = "{\"versions\":[\"first one\",\"second\\none\",\"third\"]}"
        val seen = full.indices.map { Judge.versions(full.substring(0, it + 1)).size }
        assertEquals("never goes back", seen, seen.sorted())
        assertEquals(listOf(0, 1, 2, 3), seen.distinct())
        // A version still being written, or cut off mid-escape, isn't shown.
        assertEquals(listOf("first one"), Judge.versions("{\"versions\":[\"first one\",\"sec"))
        assertEquals(listOf("first one"), Judge.versions("{\"versions\":[\"first one\",\"a\\u00"))
    }

    @Test fun notJsonGivesNothing() {
        assertEquals(emptyList<String>(), Judge.versions("ya im in, might be 10 min late"))
        assertEquals(emptyList<String>(), Judge.versions("{\"drafts\":[\"a\"]}"))
        assertEquals(emptyList<String>(), Judge.versions("{\"versions\":[\"\", \"  \"]}"))
    }

    @Test fun promptsCarryTheTextScreenAndRules() {
        val p = Judge.rewritePrompt("ya im in", "bro are you still up for padel", "No em dashes.")
        assertTrue(p.endsWith("Screen (context only):\nbro are you still up for padel\n\nTheir text:\nya im in\n\nTheir rules and note: No em dashes."))
        assertTrue("{\"versions\"" in p && "1. Light touch" in p && "3. If it is a new post" in p)
        assertTrue("(none)" in Judge.rewritePrompt("ya im in", "", ""))
        val one = Judge.versionPrompt("ya im in", "", Judge.Version.TIGHTER)
        assertTrue(Judge.Version.TIGHTER.ask in one && Judge.Version.LIGHT.ask !in one && "JSON" !in one)
    }

    /** Answers the one-call prompt with [json] and each one-version prompt with its label; counts the calls. */
    private class Fake(val json: String?, val partials: List<String> = emptyList()) : DraftEngine {
        val calls = mutableListOf<String>()
        override suspend fun drafts(conversation: String, guide: String, status: (String) -> Unit) = emptyList<String>()
        override suspend fun ask(prompt: String, maxTokens: Int, partial: ((String) -> Unit)?): String {
            if ("{\"versions\"" in prompt) {
                calls += "all"
                partials.forEach { partial?.invoke(it) }
                return json ?: throw PlainError("Your phone is busy. Try again in a moment.")
            }
            val v = Judge.Version.entries.first { it.ask in prompt }
            calls += v.name
            return if (v == Judge.Version.TIGHTER && json == "") "" else "Here's the new version:\n\"${v.label} of it\""
        }
    }

    private fun run(engine: Fake): Pair<List<Pair<Judge.Version, String>>, List<String>> {
        val landed = mutableListOf<String>()
        val got = runBlocking { Judge.rewrite(engine, "ya im in", "", "") { v, text -> landed += "${v.name}=$text" } }
        return got to landed
    }

    @Test fun oneCallWhenTheAnswerIsJson() {
        val json = "{\"versions\":[\"a\",\"b\",\"c\"]}"
        val engine = Fake(json, partials = listOf("{\"versions\":[\"a\",", "{\"versions\":[\"a\",\"b\",\"c", json))
        val (got, landed) = run(engine)
        assertEquals(listOf("all"), engine.calls)
        assertEquals(listOf(Judge.Version.LIGHT to "a", Judge.Version.TIGHTER to "b", Judge.Version.FIRST to "c"), got)
        assertEquals("each lands once, in order", listOf("LIGHT=a", "TIGHTER=b", "FIRST=c"), landed)
    }

    @Test fun fallsBackToOneCallPerVersion() {
        val engine = Fake("Sure! Here are three versions: 1. ya im in")
        val (got, landed) = run(engine)
        assertEquals(listOf("all", "LIGHT", "TIGHTER", "FIRST"), engine.calls)
        assertEquals(listOf("Cleaned up of it", "Shorter of it", "Main point first of it"), got.map { it.second })
        assertEquals(3, landed.size)
    }

    @Test fun fillsOnlyTheVersionsACutShortAnswerMissed() {
        val engine = Fake("{\"versions\":[\"a\",\"b\",\"c is cut sh")
        val (got, _) = run(engine)
        assertEquals(listOf("all", "FIRST"), engine.calls)
        assertEquals(listOf("a", "b", "Main point first of it"), got.map { it.second })
    }

    @Test fun skipsAnEmptyVersionAndKeepsTooManyToThree() {
        assertEquals(listOf("LIGHT", "FIRST"), run(Fake("")).first.map { it.first.name })
        assertEquals(listOf("a", "b", "c"), run(Fake("{\"versions\":[\"a\",\"b\",\"c\",\"d\"]}")).first.map { it.second })
    }

    @Test(expected = PlainError::class) fun anErrorBeforeAnyVersionReachesTheUser() {
        run(Fake(null))
    }
}
