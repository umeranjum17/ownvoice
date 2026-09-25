package dev.ownvoice.app

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.text.Layout
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import com.google.android.material.materialswitch.MaterialSwitch
import dev.ownvoice.app.Onboarding.Step
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** Which setup step comes next, kept apart from the screens so it can be tested on its own. */
object Onboarding {
    enum class Step { WELCOME, PERMISSION, TRY, APPS, DONE }

    /** The apps "Where should I help?" offers, as (package, name), when they are on the phone. Swapped by the on-device test. */
    var OFFERED = listOf(
        "com.twitter.android" to "X",
        "com.linkedin.android" to "LinkedIn",
        "com.reddit.frontpage" to "Reddit",
        "com.Slack" to "Slack",
        "com.whatsapp" to "WhatsApp",
        "com.google.android.gm" to "Gmail",
    )

    /** The offered apps that are on this phone, in the list's order. */
    fun offered(installed: (String) -> Boolean) = OFFERED.filter { installed(it.first) }

    /** Where setup opens: the welcome the first time, or straight to the permission from the home switch later. */
    fun first(setUp: Boolean) = if (setUp) Step.PERMISSION else Step.WELCOME

    /**
     * The step after [step]. [on] is whether Ownvoice is switched on (at the permission step, off means
     * "Not now"), [setUp] whether setup was finished before, and [apps] whether any offered app is on the phone.
     */
    fun next(step: Step, on: Boolean, setUp: Boolean, apps: Boolean): Step = when (step) {
        Step.WELCOME -> if (on) Step.TRY else Step.PERMISSION
        Step.PERMISSION -> when {
            setUp -> Step.DONE
            on -> Step.TRY
            apps -> Step.APPS
            else -> Step.DONE
        }
        Step.TRY -> if (apps) Step.APPS else Step.DONE
        Step.APPS, Step.DONE -> Step.DONE
    }
}

/**
 * The first run: a one-line welcome (which starts the one-time download), the permission explained kindly,
 * "Try it" on a practice chat ending in a first inserted draft, and "Where should I help?". The permission
 * step is also the disclosure and consent Google Play asks for before an accessibility service is switched
 * on: nothing is turned on until the user switches Ownvoice on in the phone's settings themselves.
 */
class SetupActivity : Activity() {
    private val scope = MainScope()
    private var download: Job? = null
    private var ready = false
    private var setUpBefore = false
    private var step = Step.WELCOME
    private var inserted = false
    private lateinit var offered: List<Pair<String, String>>
    private val chosen = mutableMapOf<String, Boolean>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setUpBefore = Privacy.setUp(this)
        offered = Onboarding.offered { packageManager.getLaunchIntentForPackage(it) != null }
        step = savedInstanceState?.getString("step")?.let(Step::valueOf) ?: Onboarding.first(setUpBefore)
        inserted = savedInstanceState?.getBoolean("inserted") ?: false
        show()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString("step", step.name)
        outState.putBoolean("inserted", inserted)
    }

    // The service brings this screen back to the front once it's switched on.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        OwnvoiceService.comeBack = false
        getReady()
        if (step == Step.PERMISSION && OwnvoiceService.instance != null) next()
        OwnvoiceService.practice = step == Step.TRY
    }

    override fun onPause() {
        OwnvoiceService.practice = false
        super.onPause()
    }

    // Saved here, not in onDestroy, so home (which resumes before onDestroy runs) already shows the choices.
    // Leaving with Back counts as done too, so setup doesn't open again by itself; the home switch reopens it.
    override fun finish() {
        // What "Where should I help?" showed is what the user gets, whether they tap Done or Back.
        if (step == Step.APPS) offered.forEach { (app, _) -> Privacy.setAllowed(this, app, chosen[app] ?: true) }
        Privacy.setSetUp(this)
        super.finish()
    }

    override fun onDestroy() {
        OwnvoiceService.inserted = null
        scope.cancel()
        super.onDestroy()
    }

    /** Runs the one-time download quietly while setup shows (Ownvoice must be in front for it); the home card shows any problem. */
    private fun getReady() {
        if (ready || download?.isActive == true) return
        download = scope.launch {
            try {
                OwnvoiceService.engine.ensureReady({})
                ready = true
            } catch (_: PlainError) {
            }
        }
    }

    private fun next() {
        step = Onboarding.next(step, OwnvoiceService.instance != null, setUpBefore, offered.isNotEmpty())
        if (step == Step.DONE) return finish()
        OwnvoiceService.practice = step == Step.TRY
        show()
    }

    private fun show() {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(18), px(16), px(18), px(28))
        }
        when (step) {
            Step.WELCOME -> welcome(column)
            Step.PERMISSION -> permission(column)
            Step.TRY -> practice(column)
            else -> apps(column)
        }
        setContentView(FrameLayout(this).apply {
            fitsSystemWindows = true
            addView(ScrollView(context).apply { isFillViewport = true; addView(column) })
        })
    }

    /** A centred title and, if given, a plain subtitle under it, which is returned. */
    private fun title(column: LinearLayout, title: String, subtitle: String?) =
        column.add(text(title, Type.HEADLINE).apply { gravity = Gravity.CENTER; breakStrategy = Layout.BREAK_STRATEGY_BALANCED }, top = 20f, bottom = if (subtitle == null) 20f else 0f).let {
            subtitle?.let { column.add(text(it, Type.BODY_LARGE, muted).apply { gravity = Gravity.CENTER; breakStrategy = Layout.BREAK_STRATEGY_BALANCED; setPadding(px(8), 0, px(8), 0) }, top = 8f, bottom = 20f) }
        }

    private fun spacer(column: LinearLayout) = column.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))

    private fun welcome(column: LinearLayout) {
        spacer(column)
        // The bubble itself, as it will look in other apps.
        column.addView(badge(R.drawable.ic_pen, primary, onPrimary))
        title(column, "Write replies that sound like you.", null)
        spacer(column)
        column.add(filled("Continue") { next() }, top = 24f)
    }

    private fun permission(column: LinearLayout) {
        title(column, "Let Ownvoice see your chats, only when you tap",
            "Android calls this “accessibility”. It’s the only way a helper can read a chat and fill in a message box for you.")
        column.add(group().apply {
            row(item(icon(R.drawable.ic_hand, primary), "Reads only when you tap the bubble", "Never in the background"))
            row(item(icon(R.drawable.ic_lock, primary), "Stays on this phone", "Nothing is sent anywhere"))
            row(item(icon(R.drawable.ic_chat, primary), "You always press Send", "Ownvoice never sends for you"))
        })
        column.add(text("On the next screen, tap Ownvoice, then switch on “Use Ownvoice”:", Type.BODY).apply { gravity = Gravity.CENTER; breakStrategy = Layout.BREAK_STRATEGY_BALANCED }, top = 18f, bottom = 8f)
        column.add(switchHint())
        column.add(text("Android then asks to allow “full control”. It asks that of every helper like this one. Tap Allow.", Type.BODY).apply {
            gravity = Gravity.CENTER
            breakStrategy = Layout.BREAK_STRATEGY_BALANCED
        }, top = 10f)
        spacer(column)
        column.add(filled("Turn on") { openSwitch() }, top = 20f)
        // Apps installed from a download rather than a store have the switch greyed out until the user allows it in App info.
        val greyed = text("In App info, tap ⋮ at the top, then “Allow restricted settings”. Then come back and tap Turn on.", Type.BODY).apply {
            gravity = Gravity.CENTER
            visibility = View.GONE
        }
        column.add(actions(
            ghost("Not now") { next() },
            ghost("Switch greyed out?") {
                greyed.visibility = View.VISIBLE
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
            },
        ).apply { gravity = Gravity.CENTER }, top = 6f)
        column.add(greyed, top = 4f)
    }

    /** A small copy of the phone's own row and switch, the switch flipping on and off, so the user knows what to look for. */
    private fun switchHint() = group().apply {
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        val switch = MaterialSwitch(context).apply { isClickable = false; isFocusable = false }
        val app = item(null, "Ownvoice", "Off", chevron())
        row(app)
        row(item(null, "Use Ownvoice", end = switch))
        switch.postDelayed(object : Runnable {
            override fun run() {
                if (!switch.isAttachedToWindow) return
                switch.isChecked = !switch.isChecked
                app.subtitle(if (switch.isChecked) "On" else "Off")
                switch.postDelayed(this, 1_400)
            }
        }, 1_400)
    }

    /** Opens the phone's accessibility settings, as close to Ownvoice's own switch as the phone allows. */
    private fun openSwitch() {
        val me = ComponentName(this, OwnvoiceService::class.java).flattenToString()
        OwnvoiceService.comeBack = true
        // Android lets only its own apps open Ownvoice's page, so open the list, with Ownvoice's row
        // highlighted on phones whose settings support it.
        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            .putExtra(":settings:fragment_args_key", me)
            .putExtra(":settings:show_fragment_args", Bundle().apply { putString(":settings:fragment_args_key", me) }))
    }

    private fun practice(column: LinearLayout) {
        val on = OwnvoiceService.instance != null
        val done = "That’s it. In your apps, read it over and press Send yourself."
        val line = title(column, "Try it", when {
            inserted -> done
            on -> "Tap the round bubble on the right, then Insert."
            else -> "Turn Ownvoice on first, then come back here to try it."
        })!!
        lateinit var field: EditText
        column.add(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(16), px(16), px(16), px(16))
            background = rounded(container, 24f)
            add(text("Sam", Type.TITLE), bottom = 10f)
            listOf("Are we still on for Saturday?", "I can bring the tent if you bring the stove.").forEach {
                add(text(it).apply { background = rounded(containerHighest, 18f); setPadding(px(14), px(10), px(14), px(10)) }, bottom = 8f, width = -2)
            }
            field = add(EditText(context).apply {
                hint = "Message"
                setTextAppearance(Type.BODY_LARGE.style)
                setTextColor(onSurface)
                setHintTextColor(muted)
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                background = rounded(surface, 24f, outline)
                setPadding(px(16), px(12), px(16), px(12))
            }, top = 8f).apply { (layoutParams as LinearLayout.LayoutParams).marginEnd = px(34) }
        })
        // Focused without the keyboard, so one tap on the bubble is enough.
        field.requestFocus()
        column.add(text("It’s only practice: nothing here goes to anyone.", Type.BODY).apply { gravity = Gravity.CENTER }, top = 12f)
        spacer(column)
        val end = column.add(FrameLayout(this), top = 20f)
        fun finished() {
            line.text = done
            end.removeAllViews()
            end.addView(filled("Continue") { next() }, FrameLayout.LayoutParams(-1, -2))
        }
        if (inserted) finished()
        else end.addView(ghost("Skip") { next() }, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER_HORIZONTAL))
        // The first draft inserted into the practice chat ends the step.
        OwnvoiceService.inserted = {
            if (step == Step.TRY && !inserted) {
                inserted = true
                finished()
            }
        }
    }

    private fun apps(column: LinearLayout) {
        title(column, "Where should I help?", "The bubble shows only in these apps. You can change this any time.")
        column.add(group().apply {
            offered.forEach { (app, name) ->
                val icon = ImageView(context).apply {
                    setImageDrawable(runCatching { packageManager.getApplicationIcon(app) }.getOrNull())
                    layoutParams = LinearLayout.LayoutParams(px(40), px(40))
                }
                val switch = MaterialSwitch(context).apply {
                    contentDescription = name
                    isChecked = chosen[app] ?: true
                    setOnCheckedChangeListener { _, on -> chosen[app] = on }
                }
                row(item(icon, name, end = switch) { switch.toggle() })
            }
        })
        spacer(column)
        column.add(filled("Done") { finish() }, top = 20f)
    }
}
