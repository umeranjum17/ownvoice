package dev.ownvoice.app

import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Drafting time with and without Your voice rules in the prompt, on the real model. Runs only when
 * asked, since it needs Gemini Nano: `adb shell am instrument -w -e speed true -e class dev.ownvoice.app.DraftSpeedTest ...`.
 */
@RunWith(AndroidJUnit4::class)
class DraftSpeedTest {
    @Test
    fun draftingWithVoiceRules() {
        val instr = InstrumentationRegistry.getInstrumentation()
        assumeTrue(InstrumentationRegistry.getArguments().getString("speed") == "true")
        // The model only runs for the app in front.
        val screen = instr.startActivitySync(Intent(instr.targetContext, TestScreenActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        // A typical import (a handful of phrases and one rule) and the longest guide Voice.guide allows.
        val never = listOf("powerful", "intuitive", "next-level", "we think", "we believe", "arguably")
        val typical = Voice.guide(Voice.Rules(never, noDashes = true), post = false)
        val longest = Voice.guide(Voice.Rules(never, noDashes = true, statementEndings = true, note = "Short sentences, mostly lowercase. ".repeat(6)), post = true)
        val guides = listOf("none" to "", "typical" to typical, "longest" to longest)
        val times = guides.associate { it.first to mutableListOf<Long>() }
        runBlocking {
            Nano.drafts(TestScreenActivity.CHAT, "") {}
            repeat(8) {
                for ((name, g) in guides) {
                    val start = SystemClock.elapsedRealtime()
                    Nano.drafts(TestScreenActivity.CHAT, g) {}
                    times.getValue(name) += SystemClock.elapsedRealtime() - start
                }
            }
        }
        instr.runOnMainSync { screen.finish() }
        val report = guides.joinToString("\n") { (k, g) -> times.getValue(k).sorted().let { "$k (${g.length} chars): median ${it[it.size / 2]} ms, all $it" } }
        Log.i(OwnvoiceService.TAG, "draft speed:\n$report")
        instr.sendStatus(0, Bundle().apply { putString("stream", "draft speed:\n$report\n") })
    }
}
