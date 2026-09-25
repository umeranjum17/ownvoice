package dev.ownvoice.app

import android.content.Intent
import android.util.Base64
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.ownvoice.app.InsertFlowTest.Companion.Stub
import dev.ownvoice.app.InsertFlowTest.Companion.waitUntil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The computer link on a real device, against the real ownvoice-link helper running a fake claude on the
 * computer, reached through `adb reverse tcp:7441 tcp:7441`. link/devicetest.sh runs these one at a time in
 * order, with the helper pairing, serving or stopped; each test skips unless it is given its `step`.
 */
@RunWith(AndroidJUnit4::class)
class ComputerFlowTest {
    companion object {
        /** The fake claude's drafts (link/testdata/bin/claude). */
        val FAKE = listOf("First draft\nwith a second line", "Second draft", "Third draft")
    }

    private val instr = InstrumentationRegistry.getInstrumentation()
    private val ctx get() = instr.targetContext
    private val args get() = InstrumentationRegistry.getArguments()
    private lateinit var screen: TestScreenActivity

    private fun step(name: String) = assumeTrue(args.getString("step") == name)

    @Before fun setUp() {
        InsertFlowTest.enableService()
        OwnvoiceService.engine = Stub
        Stub.drafts = listOf(InsertFlowTest.DRAFT)
        instr.runOnMainSync { Privacy.setPaused(ctx, false); Privacy.setAllowed(ctx, ctx.packageName, true) }
    }

    /** Pairs with the helper's code (base64 in `pairing`), using this phone's Keystore key. */
    @Test fun pair() {
        step("pair")
        Link.forget(ctx)
        val qr = String(Base64.decode(args.getString("pairing"), Base64.DEFAULT))
        Link.pair(ctx, qr)
        assertNotNull(Link.computer(ctx))
        assertTrue(Link.computerWrites(ctx))
    }

    /** With the helper on and the app allowed, the computer writes, says so, and its multi-line draft inserts intact. */
    @Test fun computerWrites() {
        step("on")
        instr.runOnMainSync { Privacy.setMayGoToComputer(ctx, ctx.packageName, true) }
        val sheet = openPanel()
        waitUntil("drafts", 20_000) { sheet.drafts.isNotEmpty() }
        assertEquals(FAKE, sheet.drafts)
        assertEquals(Writer.COMPUTER, sheet.writer)
        assertTrue(texts(sheet).count { it == Writer.COMPUTER.caption } == 3)
        assertTrue(Privacy.reads(ctx).first().summary.endsWith("Sent to your computer, which wrote the drafts."))
        waitUntil("scores", 20_000) { sheet.scores.all { it != null } }
        tap(sheet, texts(sheet).first { it.startsWith("Slop: ") })
        assertTrue(texts(sheet).any { it.startsWith("Slop: ") && Judge.CROSS_CHECK in it })
        insertFirst(sheet)
        waitUntil("insert") { OwnvoiceService.instance?.insertVerified != null }
        assertEquals(FAKE[0], screen.edit.text.toString())
    }

    /** An app that stays on the phone gets phone drafts, and one tap sends this one to the computer. */
    @Test fun appOffStaysOnThePhoneUnlessAsked() {
        step("on")
        instr.runOnMainSync { Privacy.setMayGoToComputer(ctx, ctx.packageName, false) }
        val sheet = openPanel()
        waitUntil("drafts") { sheet.drafts.isNotEmpty() }
        assertEquals(Writer.PHONE, sheet.writer)
        assertEquals(listOf(InsertFlowTest.DRAFT), sheet.drafts)
        assertTrue(Privacy.reads(ctx).first().summary.endsWith("in your field."))
        val monitor = instr.addMonitor(DraftActivity::class.java.name, null, false)
        tap(sheet, texts(sheet).first { it.startsWith("Write this one on my computer") })
        val again = monitor.waitForActivityWithTimeout(5_000) as DraftActivity
        instr.removeMonitor(monitor)
        waitUntil("computer drafts", 20_000) { again.drafts.isNotEmpty() }
        assertEquals(Writer.COMPUTER, again.writer)
        assertEquals(FAKE, again.drafts)
        instr.runOnMainSync { again.finish() }
    }

    /** On a phone whose own model can't write, an app that stays on the phone still offers the computer. */
    @Test fun phoneThatCantWriteStillOffersTheComputer() {
        step("on")
        OwnvoiceService.engine = CantWrite
        instr.runOnMainSync { Privacy.setMayGoToComputer(ctx, ctx.packageName, false) }
        val sheet = openPanel()
        waitUntil("the offer") { texts(sheet).contains("Write this one on my computer") }
        assertTrue(texts(sheet).contains(CantWrite.SAYS))
        val monitor = instr.addMonitor(DraftActivity::class.java.name, null, false)
        tap(sheet, "Write this one on my computer")
        val again = monitor.waitForActivityWithTimeout(5_000) as DraftActivity
        instr.removeMonitor(monitor)
        waitUntil("computer drafts", 20_000) { again.drafts.isNotEmpty() }
        assertEquals(FAKE, again.drafts)
        instr.runOnMainSync { again.finish() }
    }

    /** With the helper stopped and a phone that can't write either, the panel still says why the computer didn't. */
    @Test fun computerFailureShowsItsReasonWhenThePhoneCantWrite() {
        step("off")
        OwnvoiceService.engine = CantWrite
        instr.runOnMainSync { Privacy.setMayGoToComputer(ctx, ctx.packageName, true) }
        val sheet = openPanel()
        waitUntil("the offer", 20_000) { texts(sheet).contains("Try my computer again") }
        assertTrue(texts(sheet).any { it.startsWith("Your computer didn't answer") && it.endsWith(CantWrite.SAYS) })
        instr.runOnMainSync { sheet.finish() }
    }

    /** A phone engine that can't write, like a phone without its own model. */
    private object CantWrite : DraftEngine {
        const val SAYS = "This phone can't write here."
        override suspend fun drafts(conversation: String, guide: String, status: (String) -> Unit): List<String> = throw PlainError(SAYS)
        override suspend fun ask(prompt: String, maxTokens: Int): String = throw PlainError(SAYS)
    }

    /** With the helper stopped, the phone writes, says why in plain words, and offers to try again. */
    @Test fun phoneWritesWhenTheComputerIsOff() {
        step("off")
        instr.runOnMainSync { Privacy.setMayGoToComputer(ctx, ctx.packageName, true) }
        val sheet = openPanel()
        waitUntil("drafts", 20_000) { sheet.drafts.isNotEmpty() }
        assertEquals(Writer.PHONE, sheet.writer)
        assertEquals(listOf(InsertFlowTest.DRAFT), sheet.drafts)
        val all = texts(sheet)
        assertTrue(all.toString(), all.any { it.startsWith("Your computer didn't answer, so this phone wrote these.") })
        assertTrue(all.contains(Writer.PHONE.caption) && all.contains("Try my computer again"))
        assertTrue(Privacy.reads(ctx).first().summary.endsWith("Sent to your computer, which didn't write them; this phone did."))
        instr.runOnMainSync { sheet.finish() }
    }

    /**
     * By hand only, against the real helper and the real writer on the computer: one reply on the test
     * screen with the phone's own model left in place. Keeps the pairing; logs how long the drafts took.
     */
    @Test fun live() {
        step("live")
        OwnvoiceService.engine = Nano
        instr.runOnMainSync { Privacy.setMayGoToComputer(ctx, ctx.packageName, true) }
        try {
            val started = System.currentTimeMillis()
            val sheet = openPanel()
            waitUntil("drafts", 60_000) { sheet.drafts.isNotEmpty() }
            android.util.Log.i(OwnvoiceService.TAG, "live: ${sheet.drafts.size} drafts by ${sheet.writer} in ${System.currentTimeMillis() - started} ms")
            assertEquals(Writer.COMPUTER, sheet.writer)
            instr.runOnMainSync { sheet.finish() }
        } finally {
            instr.runOnMainSync { Privacy.setAllowed(ctx, ctx.packageName, false) }
            ctx.getSharedPreferences("privacy", 0).edit().remove("computer:${ctx.packageName}").commit()
        }
    }

    /** Forgets the test pairing and its key, and puts the per-app choice back. */
    @Test fun forget() {
        step("forget")
        Link.forget(ctx)
        instr.runOnMainSync { Privacy.setAllowed(ctx, ctx.packageName, false) }
        ctx.getSharedPreferences("privacy", 0).edit().remove("computer:${ctx.packageName}").commit()
        assertEquals(null, Link.computer(ctx))
    }

    private fun openPanel(): DraftActivity {
        screen = instr.startActivitySync(Intent(ctx, TestScreenActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as TestScreenActivity
        instr.runOnMainSync { screen.edit.setText(""); screen.edit.requestFocus() }
        val service = OwnvoiceService.instance!!
        waitUntil("the test screen's field to have input focus") { service.focusedField()?.packageName?.toString() == screen.packageName }
        val monitor = instr.addMonitor(DraftActivity::class.java.name, null, false)
        instr.runOnMainSync { service.readScreen() }
        val sheet = monitor.waitForActivityWithTimeout(5_000) as DraftActivity
        instr.removeMonitor(monitor)
        return sheet
    }

    private fun texts(sheet: DraftActivity): List<String> {
        val found = ArrayList<String>()
        instr.runOnMainSync {
            fun walk(v: View) {
                if (v is TextView && v.visibility == View.VISIBLE) found += v.text.toString()
                if (v is android.view.ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i))
            }
            walk(sheet.window.decorView)
        }
        return found
    }

    private fun tap(sheet: DraftActivity, text: String) = instr.runOnMainSync {
        val found = ArrayList<View>()
        sheet.window.decorView.findViewsWithText(found, text, View.FIND_VIEWS_WITH_TEXT)
        found.first { (it as TextView).text.toString() == text }.performClick()
    }

    private fun insertFirst(sheet: DraftActivity) = instr.runOnMainSync {
        val found = ArrayList<View>()
        sheet.window.decorView.findViewsWithText(found, "Insert", View.FIND_VIEWS_WITH_TEXT)
        found.filterIsInstance<Button>().first { it.text == "Insert" }.performClick()
    }
}
