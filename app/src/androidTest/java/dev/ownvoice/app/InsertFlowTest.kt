package dev.ownvoice.app

import android.app.Activity
import android.app.UiAutomation
import android.content.Intent
import android.os.ParcelFileDescriptor
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import android.widget.Button
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith
import kotlinx.coroutines.delay
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * End to end on a real device, without the model: bubble tap -> drafts panel -> Insert ->
 * the draft lands, newlines and all, in a native field, a web textarea and a web contenteditable.
 */
@RunWith(AndroidJUnit4::class)
class InsertFlowTest {
    companion object {
        const val DRAFT = "Saturday works.\nI'll bring the stove.\n\nSee you at 9"
        private val instr = InstrumentationRegistry.getInstrumentation()
        /** What the service told the engine the user had typed, on the last bubble tap. */
        @Volatile var typed: String? = null

        @BeforeClass
        @JvmStatic
        fun setUpService() {
            enableService()
            OwnvoiceService.engine = Stub
        }

        /** Turns the service on without turning off any other enabled service. */
        private fun enableService() {
            val me = "dev.ownvoice.app/dev.ownvoice.app.OwnvoiceService"
            // Keep accessibility services running while this test talks to the shell.
            val shell = instr.getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
            fun sh(cmd: String) = ParcelFileDescriptor.AutoCloseInputStream(shell.executeShellCommand(cmd)).bufferedReader().readText().trim()
            val others = sh("settings get secure enabled_accessibility_services").split(":").filter { it.isNotEmpty() && it != "null" && !it.startsWith("dev.ownvoice.app/") }
            // Starting the test restarted this process, and Android does not rebind a service it saw die
            // until the setting changes, so switch it off and on.
            sh(if (others.isEmpty()) "settings delete secure enabled_accessibility_services" else "settings put secure enabled_accessibility_services " + others.joinToString(":"))
            Thread.sleep(1_000)
            sh("settings put secure enabled_accessibility_services " + (others + me).joinToString(":"))
            sh("settings put secure accessibility_enabled 1")
            waitUntil("Ownvoice service to connect") { OwnvoiceService.instance != null }
        }

        /** Canned drafts, judge answers and rewrites; the judge is slow on purpose, to show drafts come first. */
        object Stub : DraftEngine {
            override suspend fun drafts(conversation: String, typed: String, status: (String) -> Unit): List<String> {
                InsertFlowTest.typed = typed
                return listOf(DRAFT)
            }

            override suspend fun ask(prompt: String, maxTokens: Int): String {
                delay(1000)
                return when {
                    prompt.startsWith("Below is the text") -> "MESSAGE"
                    prompt.startsWith("You check a reply") -> JUDGE
                    prompt.startsWith("Compare a rewrite") -> "GENERIC: 1\nSPECIFICITY: 8\nMEANING: pass - same meaning"
                    Judge.Rewrite.GRAMMAR.ask in prompt -> "I went to the shop at 9."
                    else -> "Went to the shop at 10."
                }
            }
        }

        const val JUDGE = "GENERIC: 1\nSPECIFICITY: 9\nSPECIFIC: pass - names the stove\nCLEAR: pass\nVOICE: pass\n" +
            "FITS: pass\nCLAIMS: concern - says they own a stove\nANSWERS: pass - confirms Saturday\nNEXT_STEP: pass - 9 o'clock"

        fun waitUntil(what: String, timeoutMs: Long = 10_000, check: () -> Boolean) {
            val end = System.currentTimeMillis() + timeoutMs
            while (System.currentTimeMillis() < end) {
                if (check()) return
                Thread.sleep(100)
            }
            throw AssertionError("Timed out waiting for $what")
        }
    }

    private lateinit var screen: TestScreenActivity

    // The test runner finishes every activity between tests, so each test opens its own screen.
    @Before
    fun openScreen() {
        screen = instr.startActivitySync(
            Intent(instr.targetContext, TestScreenActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ) as TestScreenActivity
        waitUntil("test page loaded") { js("document.getElementById('ce') != null") == "true" }
    }

    @Test
    fun nativeEditText() {
        instr.runOnMainSync { screen.edit.setText(""); screen.edit.requestFocus() }
        val verified = draftAndInsert()
        assertEquals(DRAFT, screen.edit.text.toString())
        assertTrue("service could not verify the insert", verified)
    }

    @Test
    fun scoresFillInAfterDrafts() {
        instr.runOnMainSync { screen.edit.setText(""); screen.edit.requestFocus() }
        assertTrue(draftAndInsert(checkScores = true))
    }

    /** Drafts show before their scores; then three separate chips fill in, each with reasons on tap. */
    private fun checkScores(sheet: DraftActivity) {
        instr.waitForIdleSync()
        assertEquals("drafts must not wait for scores", null, sheet.scores.single())
        assertEquals(listOf("Slop: checking…", "Quality: checking…", "Reach: checking…"), chips(sheet))
        waitUntil("scores") { sheet.scores.single() != null }
        instr.waitForIdleSync()
        assertEquals(listOf("Slop: clean", "Quality: 1 flag", "Response: good"), chips(sheet))
        tap(sheet, "Quality: 1 flag")
        val detail = texts(sheet).single { it.startsWith("Quality checks") }
        assertTrue(detail, "! Claims: Says they own a stove" in detail && Judge.SAME_MODEL in detail)
        tap(sheet, "Slop: clean")
        assertTrue(texts(sheet).any { it.startsWith("Slop: clean (10/100)") && Judge.SAME_MODEL in it })
    }

    @Test
    fun rewriteReplacesEditableText() {
        val scenario = ActivityScenario.launchActivityForResult<RewriteActivity>(processText("i has went to the shop at 9", readOnly = false))
        val sheet = activity(scenario)
        tap(sheet, "Fix grammar")
        waitUntil("meaning check") { sheet.meaning != null }
        instr.waitForIdleSync()
        assertEquals("I went to the shop at 9.", sheet.rewrite)
        assertTrue(sheet.meaning!!.ok)
        assertTrue(texts(sheet).toString(), "Slop: clean" in texts(sheet))
        tap(sheet, "Replace")
        assertEquals(Activity.RESULT_OK, scenario.result.resultCode)
        assertEquals("I went to the shop at 9.", scenario.result.resultData.getStringExtra(Intent.EXTRA_PROCESS_TEXT))
    }

    @Test
    fun rewriteWarnsOnChangedClaimAndOffersOnlyCopyWhenReadOnly() {
        val scenario = ActivityScenario.launchActivityForResult<RewriteActivity>(processText("i has went to the shop at 9", readOnly = true))
        val sheet = activity(scenario)
        tap(sheet, "Tighten")
        waitUntil("meaning check") { sheet.meaning != null }
        instr.waitForIdleSync()
        assertFalse(sheet.meaning!!.ok)
        assertTrue(texts(sheet).any { it.startsWith("! Meaning may have changed: Adds 10") })
        assertFalse("Replace" in texts(sheet))
        tap(sheet, "Copy")
        assertEquals(Activity.RESULT_CANCELED, scenario.result.resultCode)
    }

    private fun processText(text: String, readOnly: Boolean) = Intent(Intent.ACTION_PROCESS_TEXT)
        .setClass(instr.targetContext, RewriteActivity::class.java)
        .setType("text/plain")
        .putExtra(Intent.EXTRA_PROCESS_TEXT, text)
        .putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, readOnly)

    private fun activity(scenario: ActivityScenario<RewriteActivity>): RewriteActivity {
        var sheet: RewriteActivity? = null
        scenario.onActivity { sheet = it }
        return sheet!!
    }

    private fun views(activity: Activity): List<TextView> {
        val out = ArrayList<TextView>()
        fun walk(v: View) {
            if (v is TextView && v.isShown) out += v
            if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i))
        }
        instr.runOnMainSync { walk(activity.window.decorView) }
        return out
    }

    private fun texts(activity: Activity) = views(activity).map { it.text.toString() }

    private fun chips(sheet: DraftActivity) = texts(sheet).filter { Regex("^(Slop|Quality|Reach|Response): ").containsMatchIn(it) && "(" !in it && "\n" !in it }

    private fun tap(activity: Activity, label: String) {
        val view = views(activity).first { it.text.toString() == label }
        instr.runOnMainSync { view.performClick() }
        instr.waitForIdleSync()
    }

    @Test
    fun emptyNativeFieldHintIsNotTyped() {
        instr.runOnMainSync { screen.edit.setText(""); screen.edit.requestFocus() }
        draftAndInsert()
        assertEquals("", typed)
    }

    @Test
    fun webTextarea() {
        focusWeb("ta")
        val verified = draftAndInsert()
        assertEquals(DRAFT, JSONArray("[${js("document.getElementById('ta').value")}]").getString(0))
        assertTrue("service could not verify the insert", verified)
    }

    @Test
    fun webContentEditable() {
        focusWeb("ce")
        val verified = draftAndInsert()
        assertEquals(DRAFT, JSONArray("[${js("document.getElementById('ce').innerText")}]").getString(0))
        assertTrue("service could not verify the insert", verified)
    }

    private fun js(script: String): String {
        val done = CountDownLatch(1)
        var result = ""
        instr.runOnMainSync { screen.web.evaluateJavascript(script) { result = it; done.countDown() } }
        done.await(5, TimeUnit.SECONDS)
        return result
    }

    private fun focusWeb(id: String) {
        instr.runOnMainSync { screen.web.requestFocus() }
        js("document.getElementById('$id').focus()")
        waitUntil("web field focus") { js("document.activeElement.id") == "\"$id\"" }
    }

    /** Taps the bubble's action, then Insert on the first draft; returns the service's own verdict. */
    private fun draftAndInsert(checkScores: Boolean = false): Boolean {
        val service = OwnvoiceService.instance!!
        waitUntil("the test screen's field to have input focus") {
            service.focusedField()?.let { it.packageName?.toString() == screen.packageName } == true
        }
        val monitor = instr.addMonitor(DraftActivity::class.java.name, null, false)
        instr.runOnMainSync { service.readScreen() }
        val sheet = monitor.waitForActivityWithTimeout(5_000) as DraftActivity
        instr.removeMonitor(monitor)
        waitUntil("drafts") { sheet.drafts.isNotEmpty() }
        assertEquals(listOf(DRAFT), sheet.drafts)
        if (checkScores) checkScores(sheet)
        assertFalse("bubble shown over the drafts panel", service.bubbleVisible)
        instr.runOnMainSync {
            val found = ArrayList<View>()
            sheet.window.decorView.findViewsWithText(found, "Insert", View.FIND_VIEWS_WITH_TEXT)
            found.filterIsInstance<Button>().first { it.text == "Insert" }.performClick()
        }
        waitUntil("insert verdict") { service.insertVerified != null }
        waitUntil("drafts panel to close") { sheet.isDestroyed }
        instr.waitForIdleSync()
        assertTrue("bubble not back after the panel closed", service.bubbleVisible)
        // Toasts are dropped for background apps, so the bubble itself tells the user what happened.
        if (service.insertVerified == true) {
            var shown = ""
            instr.runOnMainSync { shown = service.bubbleText.toString() }
            assertTrue("bubble shows \"$shown\", not the insert result", shown.startsWith("Inserted"))
        }
        return service.insertVerified == true
    }
}
