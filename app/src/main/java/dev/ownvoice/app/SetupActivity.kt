package dev.ownvoice.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Setting up, in three steps: welcome (and the one-time download), the permission explained kindly, and
 * "Try it" on a practice chat. The permission step is also the disclosure and consent Google Play asks
 * for before an accessibility service is switched on: nothing is turned on until the user taps
 * "Turn it on in Settings" and switches Ownvoice on there themselves.
 */
class SetupActivity : Activity() {
    private val scope = MainScope()
    private var step = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // From the home switch after setup, go straight to the permission.
        step = savedInstanceState?.getInt("step") ?: if (Privacy.setUp(this)) 2 else 1
        show()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt("step", step)
    }

    override fun onResume() {
        super.onResume()
        // Once Ownvoice is on, setup is done even if "Try it" is skipped with Back.
        if (step == 2 && OwnvoiceService.instance != null) Privacy.setSetUp(this).also { go(3) }
        OwnvoiceService.practice = step == 3
    }

    override fun onPause() {
        OwnvoiceService.practice = false
        super.onPause()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun go(to: Int) {
        step = to
        OwnvoiceService.practice = step == 3
        show()
    }

    private fun done() {
        Privacy.setSetUp(this)
        finish()
    }

    private fun show() {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(18), px(16), px(18), px(28))
        }
        column.addView(LinearLayout(this).apply {
            (1..3).forEach { i ->
                addView(View(context).apply { background = rounded(if (i <= step) primary else containerHighest, 2f) },
                    LinearLayout.LayoutParams(0, px(4), 1f).apply { marginEnd = if (i < 3) px(6) else 0 })
            }
        })
        when (step) {
            1 -> welcome(column)
            2 -> permission(column)
            else -> practice(column)
        }
        setContentView(FrameLayout(this).apply {
            fitsSystemWindows = true
            addView(ScrollView(context).apply { isFillViewport = true; addView(column) })
        })
    }

    private fun title(column: LinearLayout, title: String, subtitle: String) {
        column.add(text(title, Type.HEADLINE).apply { gravity = Gravity.CENTER }, top = 20f)
        column.add(text(subtitle, Type.BODY_LARGE, muted).apply { gravity = Gravity.CENTER; setPadding(px(8), 0, px(8), 0) }, top = 8f, bottom = 20f)
    }

    private fun spacer(column: LinearLayout) = column.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))

    private fun welcome(column: LinearLayout) {
        // The bubble itself, as it will look in other apps.
        column.addView(badge(R.drawable.ic_pen, primary, onPrimary).apply { (layoutParams as LinearLayout.LayoutParams).topMargin = px(40) })
        title(column, "Meet Ownvoice", "Your writing helper. Tap its bubble in your chats for reply ideas, or to polish what you wrote.")
        val getReady = item(icon(R.drawable.ic_check, primary), "Getting Ownvoice ready", "One-time download, about a minute")
        column.add(group().apply {
            row(item(icon(R.drawable.ic_chat, primary), "Reply ideas in your chats", "Pick one, change it if you like, send it"))
            row(item(icon(R.drawable.ic_pen, primary), "Polish what you wrote", "Clearer and shorter, still in your words"))
            row(getReady)
        })
        getReady(getReady)
        spacer(column)
        column.add(filled("Get started") { go(2) }, top = 24f)
    }

    /** Runs the one-time download while the welcome shows (Ownvoice is in front, which the phone requires). */
    private fun getReady(row: View) {
        scope.launch {
            try {
                OwnvoiceService.engine.ensureReady({ row.subtitle(it) })
                row.title("Ownvoice is ready")
                row.subtitle("All set")
            } catch (e: PlainError) {
                row.subtitle(e.message.orEmpty() + " Tap to try again.")
                row.setOnClickListener { row.setOnClickListener(null); row.subtitle("One-time download, about a minute"); getReady(row) }
            }
        }
    }

    private fun permission(column: LinearLayout) {
        column.addView(badge(R.drawable.ic_hand, primaryContainer, onPrimaryContainer).apply { (layoutParams as LinearLayout.LayoutParams).topMargin = px(24) })
        title(column, "Let Ownvoice see your chats, only when you tap",
            "Android calls this “accessibility”. It’s the only way a helper can read a chat and fill in a message box for you.")
        column.add(group().apply {
            row(item(icon(R.drawable.ic_hand, primary), "Reads only when you tap the bubble", "Never in the background"))
            row(item(icon(R.drawable.ic_lock, primary), "Stays on this phone", "Nothing is sent anywhere"))
            row(item(icon(R.drawable.ic_chat, primary), "Never sends for you", "You always press Send yourself"))
        })
        column.add(text("In Settings, tap Ownvoice and switch it on. You can switch it off any time.", Type.BODY).apply {
            gravity = Gravity.CENTER
        }, top = 14f)
        spacer(column)
        column.add(filled("Turn it on in Settings") {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }, top = 20f)
        column.add(ghost("Not now") { done() }, top = 6f, width = -2).apply { (layoutParams as LinearLayout.LayoutParams).gravity = Gravity.CENTER_HORIZONTAL }
    }

    private fun practice(column: LinearLayout) {
        val on = OwnvoiceService.instance != null
        title(column, "Try it", if (on) "Tap the message box, then tap the round bubble on the right." else "Turn Ownvoice on first, then come back here to try it.")
        column.add(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(16), px(16), px(16), px(16))
            background = rounded(container, 24f)
            add(text("Sam", Type.TITLE), bottom = 10f)
            listOf("Are we still on for Saturday?", "I can bring the tent if you bring the stove.").forEach {
                add(text(it).apply { background = rounded(containerHighest, 18f); setPadding(px(14), px(10), px(14), px(10)) }, bottom = 8f, width = -2)
            }
            add(EditText(context).apply {
                hint = "Message"
                setTextAppearance(Type.BODY_LARGE.style)
                setTextColor(onSurface)
                setHintTextColor(muted)
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                background = rounded(surface, 24f, outline)
                setPadding(px(16), px(12), px(16), px(12))
            }, top = 8f).apply { (layoutParams as LinearLayout.LayoutParams).marginEnd = px(34) }
        })
        column.add(text("It’s only practice: nothing here goes to anyone.", Type.BODY).apply { gravity = Gravity.CENTER }, top = 12f)
        spacer(column)
        column.add(filled("Done") { done() }, top = 20f)
    }
}
