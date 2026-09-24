package dev.ownvoice.app

import android.app.UiAutomation
import android.content.Intent
import android.os.ParcelFileDescriptor
import android.view.View
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
            OwnvoiceService.engine = DraftEngine { _, typed, _ -> this.typed = typed; listOf(DRAFT) }
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
    private fun draftAndInsert(): Boolean {
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
