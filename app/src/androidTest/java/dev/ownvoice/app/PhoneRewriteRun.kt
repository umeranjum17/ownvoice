package dev.ownvoice.app

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Runs made-up rewrite situations through the phone's own model and records whether its one call
 * answers in the {"versions":[...]} shape. Opt-in and only where the model is ready:
 * `am instrument -w -e rewrites 1 -e class dev.ownvoice.app.PhoneRewriteRun ...`; the results go to
 * the app's files/rewrite-run.jsonl.
 */
@RunWith(AndroidJUnit4::class)
class PhoneRewriteRun {
    /** A made-up writer, never a real person. */
    private val note = Voice.Rules(noDashes = true, statementEndings = true, note = "Solo founder of a small open-source Android app. Short, direct, casual. Lowercase is fine in chats. No em dashes.")

    /** id, what else is on screen ("" for a new post), and what they typed. */
    private val situations = listOf(
        Triple("bx1", "", "shipped a thing today. ownvoice now lets you pick text anywhere and rewrite it on your phone, nothing leaves the device. took way longer than i thought but its finally out"),
        Triple("bx2", "", "In today's fast-paced world, privacy is more important than ever. That's why I built Ownvoice, a game-changer for anyone who writes on their phone. It's not just an app, it's a movement. #privacy #AI #indiedev"),
        Triple("bx3", "", "week 3 numbers: 212 installs, 40 people use it daily, 3 bug reports all about the bubble disappearing after a restart. fixing that first. what should i build next?"),
        Triple("bx4", "@mara_builds · 2h\nHot take: most indie apps don't need a backend at all. Local-first + export to a file covers 90% of what users want.\n14 replies · 52 reposts · 310 likes", "this is so true!! we went local first and never looked back, backends are overrated for most small apps honestly"),
        Triple("bl1", "What do you want to talk about?", "I'm excited to announce that after months of hard work, I have launched Ownvoice! It's an open-source Android app that helps you write replies that sound like you, using the model on your phone so nothing leaves your device. I'd love to hear your thoughts and feedback!"),
        Triple("be1", "Raj Mehta\nHey! I'm in town Tuesday to Thursday next week. Want to grab coffee and catch up? Any day works for me.", "hey raj yes would love to, thursday works best for me maybe 10am at the usual place? let me know"),
        Triple("bc1", "Bilal: bro are you still up for padel tomorrow at 7\nBilal: court is booked", "ya im in but might be 10 min late cuz of a call, start without me if needed"),
        Triple("bl2", "Hannah Cole · Head of Content\nUnpopular opinion: AI writing tools are making everyone sound the same. The fix isn't better prompts, it's writing more yourself.\n48 comments", "Great post Hannah! I completely agree. That's actually why I built my app, it only rewrites what you already wrote instead of writing for you. Would love to hear your thoughts!"),
        Triple("bc2", "Sam: Are we still on for Saturday?\nSam: I can drive if you want", "Great question! Saturday works for me. This is not just a trip, but a real adventure. I'll bring the stove and snacks."),
        Triple("h_b1", "", "hot take: most writing apps want to write for you. i think the better product is one that makes what you already wrote a bit clearer and then gets out of the way"),
        Triple("h_b2", "Jenna Price\nHi, I bought the pro version by mistake last night, I meant to get the free one. Can I get a refund?", "Hi Jenna, no worries at all! I have went ahead and refunded you, it should show up in 3-5 business days. Thank you so much for reaching out and I hope you enjoy the free version!"),
        Triple("r_p1", "", "Title: I built an open source app that drafts replies with the on-device model, no cloud\nBody: Hey everyone! I'm super excited to share my side project. It reads the chat on screen when you tap a bubble and suggests replies, all on the phone. It's free and open source. Would love any feedback!"),
        Triple("r_p2", "", "Title: 3 weeks in, 40 daily users, here's what surprised me\nBody: the thing people use most isn't the reply drafts, it's fixing their own messages before sending. nobody asked for that feature, i added it late. also the bubble confuses people at first."),
        Triple("s_b1", "Priya: can you send me a quick status on the android pilot before the 11am?", "hey sorry for the delay!! so basically the pilot is going ok I think, we have 12 people on it, 2 of them reported the bubble thing again, I'm fixing it today and will send a new build tomorrow hopefully"),
        Triple("s_b2", "", "Hi team! I'm super excited to announce that the new writing assistant is now live for everyone! It's not just a tool, it's a whole new way to communicate. Let me know if you have any questions or feedback!"),
    )

    /** The phone's model, recording each call's prompt kind and answer. */
    private class Recording : DraftEngine by Nano {
        val calls = JSONArray()
        override suspend fun ask(prompt: String, maxTokens: Int, partial: ((String) -> Unit)?): String {
            val started = System.currentTimeMillis()
            val answer = Nano.ask(prompt, maxTokens, partial)
            calls.put(JSONObject().put("json", "{\"versions\"" in prompt).put("ms", System.currentTimeMillis() - started).put("answer", answer))
            return answer
        }
    }

    @Test fun run() {
        val instr = InstrumentationRegistry.getInstrumentation()
        assumeTrue("opt-in", InstrumentationRegistry.getArguments().getString("rewrites") == "1")
        assumeTrue("model ready", runBlocking { Generation.getClient().checkStatus() } == FeatureStatus.AVAILABLE)
        // The model answers only the app in front.
        val screen = ActivityScenario.launch(TestScreenActivity::class.java)
        val out = File(instr.targetContext.filesDir, "rewrite-run.jsonl").apply { delete() }
        for ((id, onScreen, typed) in situations) {
            val engine = Recording()
            val started = System.currentTimeMillis()
            var first = 0L
            val got = runBlocking {
                Judge.rewrite(engine, typed, onScreen, Voice.guide(note, post = onScreen.isEmpty() || onScreen == "What do you want to talk about?")) { _, _ ->
                    if (first == 0L) first = System.currentTimeMillis() - started
                }
            }
            val shape = Judge.versions(engine.calls.getJSONObject(0).getString("answer")).size
            out.appendText(JSONObject().put("id", id).put("typed", typed).put("jsonVersions", shape).put("firstMs", first)
                .put("totalMs", System.currentTimeMillis() - started).put("calls", engine.calls)
                .put("versions", JSONArray(got.map { it.second })).toString() + "\n")
        }
        screen.close()
    }
}
