package dev.ownvoice.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import com.google.android.material.materialswitch.MaterialSwitch
import dev.ownvoice.app.InsertFlowTest.Companion.DRAFT
import dev.ownvoice.app.InsertFlowTest.Companion.waitUntil
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The whole first run on a real device, with a stand-in for the model: welcome, the permission (the test
 * flips the switch the user would flip), setup coming back by itself, "Try it" ending in an inserted draft,
 * and "Where should I help?" offering only the apps on the phone. Counts the taps it takes.
 */
@RunWith(AndroidJUnit4::class)
class FirstRunTest {
    private val instr = InstrumentationRegistry.getInstrumentation()
    private val ctx = instr.targetContext
    private val offered = Onboarding.OFFERED
    private val prefs = ctx.getSharedPreferences("privacy", Context.MODE_PRIVATE)
    // The phone owner's own switches, read log and setup state, put back afterwards.
    private val before = prefs.all.toMap()
    private val wasOn = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty().contains("dev.ownvoice.app/")
    private var taps = 0
    /** Every text setup showed or held hidden, checked for technical words at the end. */
    private val seen = mutableSetOf<String>()

    @After
    fun restore() {
        Onboarding.OFFERED = offered
        prefs.edit().clear().apply {
            before.forEach { (k, v) -> if (v is Boolean) putBoolean(k, v) else putString(k, v.toString()) }
        }.commit()
        if (wasOn && OwnvoiceService.instance == null) InsertFlowTest.enableService()
        if (!wasOn && OwnvoiceService.instance != null) InsertFlowTest.disableService()
        instr.runOnMainSync { OwnvoiceService.instance?.updateBubble() }
    }

    @Test
    fun installToFirstInsertedDraft() {
        OwnvoiceService.engine = InsertFlowTest.Companion.Stub
        // Ownvoice itself stands in for an installed app from the list; the other entry isn't on any phone.
        Onboarding.OFFERED = listOf("dev.ownvoice.not.installed" to "Nowhere", ctx.packageName to "Practice")
        InsertFlowTest.disableService()
        prefs.edit().clear().commit()

        // Opening the app for the first time opens setup.
        instr.startActivitySync(Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        var setup = waitFor(SetupActivity::class.java)
        assertEquals(listOf("Write replies that sound like you.", "Continue"), texts(setup))
        tap(setup, "Continue")

        assertTrue(texts(setup).toString(), texts(setup).containsAll(listOf("Reads only when you tap the bubble", "Stays on this phone", "You always press Send", "Turn on")))
        val settings = instr.addMonitor(IntentFilter(Settings.ACTION_ACCESSIBILITY_SETTINGS), null, false)
        tap(setup, "Turn on")
        waitUntil("the phone's accessibility settings") { settings.hits == 1 }
        instr.removeMonitor(settings)

        // The user switches Ownvoice on; setup comes back to the front by itself.
        waitUntil("setup to leave the front") { resumed() !is SetupActivity }
        InsertFlowTest.enableService()
        waitUntil("setup back in front", 15_000) { resumed() is SetupActivity }
        setup = resumed() as SetupActivity
        waitUntil("Try it") { "Try it" in texts(setup) }
        assertTrue(texts(setup).toString(), "Skip" in texts(setup))

        // The bubble is already there, and the practice field already has focus.
        val service = OwnvoiceService.instance!!
        waitUntil("bubble over the practice chat") { service.bubbleVisible }
        waitUntil("practice field focused") { service.focusedField()?.packageName?.toString() == ctx.packageName }
        val panel = instr.addMonitor(DraftActivity::class.java.name, null, false)
        taps++
        instr.runOnMainSync { service.readScreen() }
        val sheet = panel.waitForActivityWithTimeout(5_000) as DraftActivity
        instr.removeMonitor(panel)
        waitUntil("drafts") { sheet.drafts.isNotEmpty() }
        tap(sheet, "Insert")
        waitUntil("insert verified") { service.insertVerified == true }
        waitUntil("Continue after the insert") { "Continue" in texts(setup) }
        assertEquals("taps from opening the app to the first inserted draft, not counting the phone's settings", 4, taps)
        assertEquals(DRAFT, views(setup).filterIsInstance<EditText>().single().text.toString())
        assertTrue(texts(setup).toString(), "That’s it. In your apps, read it over and press Send yourself." in texts(setup))
        tap(setup, "Continue")

        // Only the apps on the phone are offered, switched on to start.
        assertTrue("Where should I help?" in texts(setup))
        assertTrue(texts(setup).toString(), "Practice" in texts(setup) && "Nowhere" !in texts(setup))
        assertTrue(views(setup).filterIsInstance<MaterialSwitch>().single().isChecked)
        assertFalse(Privacy.allowed(ctx, ctx.packageName))
        // Same list as PlainWordsTest: no technical word may reach the user.
        val banned = Regex("(?i)gemini|gemma|\\bnano\\b|aicore|ml ?kit|\\bllm\\b|\\bmodel\\b|/100|/10\\b|judge|slop|characters|\\bprompt|\\btokens?\\b|on-device")
        assertTrue(seen.toString(), seen.size > 20 && "Switch greyed out?" in seen && seen.any { it.startsWith("In App info") })
        assertEquals("Technical words in setup", emptyList<String>(), seen.filter { banned.containsMatchIn(it) })
        assertTrue("Done" in texts(setup))
        // Back keeps what the screen showed, just like Done.
        instr.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        waitUntil("setup to close") { setup.isDestroyed }
        assertTrue(Privacy.allowed(ctx, ctx.packageName))
        assertTrue(Privacy.setUp(ctx))
        waitUntil("home") { resumed() is MainActivity }
        // Home's first view already shows the choices just saved: a fresh resume reads the same lines.
        val home = resumed()!!
        fun appsLine() = texts(home).let { it[it.indexOf("Where the bubble shows") + 1] }
        val first = appsLine()
        instr.runOnMainSync { instr.callActivityOnPause(home); instr.callActivityOnResume(home) }
        assertEquals(appsLine(), first)
        instr.runOnMainSync { home.finish() }
    }

    private fun resumed(): Activity? {
        var found: Activity? = null
        instr.runOnMainSync { found = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).firstOrNull() }
        return found
    }

    private fun <T : Activity> waitFor(type: Class<T>): T {
        waitUntil(type.simpleName) { type.isInstance(resumed()) }
        instr.waitForIdleSync()
        return type.cast(resumed())!!
    }

    private fun views(activity: Activity): List<View> {
        val out = ArrayList<View>()
        fun walk(v: View) {
            if (v.isShown) out += v
            if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i))
        }
        instr.runOnMainSync { walk(activity.window.decorView) }
        return out
    }

    private fun texts(activity: Activity): List<String> {
        instr.waitForIdleSync()
        if (activity is SetupActivity) instr.runOnMainSync {
            fun walk(v: View) {
                if (v is TextView) seen += listOf(v.text, v.hint, v.contentDescription).filterNotNull().map { it.toString() }
                if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i))
            }
            walk(activity.window.decorView)
        }
        return views(activity).filterIsInstance<TextView>().filter { it !is EditText && it.text.isNotEmpty() }.map { it.text.toString() }
    }

    private fun tap(activity: Activity, label: String) {
        val view = views(activity).filterIsInstance<TextView>().first { it.text.toString() == label }
        taps++
        instr.runOnMainSync { view.performClick() }
        instr.waitForIdleSync()
    }
}
