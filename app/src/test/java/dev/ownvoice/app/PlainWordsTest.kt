package dev.ownvoice.app

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * Ownvoice is for people with no interest in how it works, so no technical word may reach them.
 * Scans every string in the app's code and resources that could show on screen. Prompts to the model,
 * log lines and patterns are not shown, so they are left out.
 */
class PlainWordsTest {
    private val banned = Regex("(?i)gemini|gemma|\\bnano\\b|aicore|ml ?kit|\\bllm\\b|\\bmodel\\b|/100|/10\\b|judge|slop|characters|\\bprompt|\\btokens?\\b|on-device")

    /** String literals on a line, template expressions and all. */
    private val literal = Regex("\"((?:[^\"\\\\]|\\\\.)*)\"")

    // Log lines, patterns and comments: never shown.
    private val hidden = Regex("Log\\.|Regex\\(|^\\s*(//|\\*|/\\*)")

    @Test fun noTechnicalWordsReachTheUser() {
        val main = File("src/main")
        val found = mutableListOf<String>()
        main.walk().filter { it.extension == "kt" }.forEach { file ->
            var inPrompt = false
            file.readLines().forEachIndexed { i, line ->
                // Prompt builders are whole functions: from "fun xPrompt(" or "fun prompt(" to their closing brace at the same indent.
                if (Regex("fun \\w*[pP]rompt\\(").containsMatchIn(line)) inPrompt = true
                if (inPrompt) { if (line.startsWith("    }")) inPrompt = false; return@forEachIndexed }
                if (hidden.containsMatchIn(line)) return@forEachIndexed
                literal.findAll(line).map { it.groupValues[1] }.filter { banned.containsMatchIn(it) }.forEach { found += "${file.name}:${i + 1}: \"$it\"" }
            }
        }
        main.walk().filter { it.extension == "xml" }.forEach { file ->
            Regex(">([^<]+)<|android:label=\"([^\"]+)\"").findAll(file.readText()).map { it.groupValues[1] + it.groupValues[2] }
                .filter { banned.containsMatchIn(it) }.forEach { found += "${file.name}: \"$it\"" }
        }
        assertEquals("Technical words the user could see:\n" + found.joinToString("\n"), emptyList<String>(), found)
    }

    @Test fun catchesATechnicalWord() {
        for (bad in listOf("Scored by the judge", "Slop: clean (10/100)", "The on-device model is ready (nano-v3).", "117 characters on screen", "Update AICore"))
            assertEquals(bad, true, banned.containsMatchIn(bad))
        for (fine in listOf("Sounds natural and answers Sam", "Getting Ownvoice ready… this happens once.", "A bit stock"))
            assertEquals(fine, false, banned.containsMatchIn(fine))
    }
}
