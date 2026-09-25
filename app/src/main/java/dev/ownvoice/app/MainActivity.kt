package dev.ownvoice.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.progressindicator.LinearProgressIndicator
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** Home: whether Ownvoice is on and ready, then plain rows for where it works, your voice, what it read and pause. */
class MainActivity : Activity() {
    private val scope = MainScope()
    private var check: Job? = null
    private var ready = false
    private var problem: String? = null
    private lateinit var status: LinearLayout
    private lateinit var headline: TextView
    private lateinit var detail: TextView
    private lateinit var power: MaterialSwitch
    private lateinit var bar: LinearProgressIndicator
    private lateinit var retry: TextView
    private lateinit var pause: MaterialSwitch
    private lateinit var apps: View
    private lateinit var voice: View
    private lateinit var reads: View

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val page = page("Ownvoice", "Your writing helper. It stays on this phone.", Type.HEADLINE_LARGE)
        headline = text("", Type.HEADLINE_SMALL)
        detail = text("", Type.BODY)
        power = MaterialSwitch(this).apply { contentDescription = "Ownvoice on or off" }
        bar = LinearProgressIndicator(this).apply { isIndeterminate = true; visibility = View.GONE }
        retry = ghost("Try again") { checkModel() }
        status = page.add(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(24), px(20), px(20), px(16))
            addView(LinearLayout(context).apply {
                gravity = Gravity.CENTER_VERTICAL
                addView(LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(headline)
                    addView(detail)
                }, LinearLayout.LayoutParams(0, -2, 1f))
                addView(power)
            })
            add(bar, top = 12f)
            add(retry, width = -2)
        }, bottom = 18f)
        apps = item(icon(R.drawable.ic_apps), "Where the bubble shows", "", chevron()) { open(AppsActivity::class.java) }
        voice = item(icon(R.drawable.ic_voice), "Your voice", "", chevron()) { open(VoiceActivity::class.java) }
        reads = item(icon(R.drawable.ic_eye), "What Ownvoice read", "", chevron()) { open(ReadsActivity::class.java) }
        page.add(group().apply { row(apps); row(voice); row(reads) }, bottom = 14f)
        pause = MaterialSwitch(this).apply { contentDescription = "Pause for now" }
        page.add(group().apply {
            row(item(icon(R.drawable.ic_pause), "Pause for now", "Hides the bubble everywhere", pause) { pause.toggle() })
            row(item(icon(R.drawable.ic_pen), "Rewrite any text", "Select text in any app, then choose Ownvoice"))
        })
        if (savedInstanceState == null && !Privacy.setUp(this) && OwnvoiceService.instance == null) open(SetupActivity::class.java)
    }

    override fun onResume() {
        super.onResume()
        pause.setOnCheckedChangeListener(null)
        pause.isChecked = Privacy.paused(this)
        pause.setOnCheckedChangeListener { _, on -> Privacy.setPaused(this, on); showStatus() }
        apps.subtitle(appsLine())
        val never = Voice.rules(this).never.size
        voice.subtitle(if (never == 0) "Add phrases you never say" else if (never == 1) "1 phrase you never say" else "$never phrases you never say")
        val week = Privacy.reads(this).count { System.currentTimeMillis() - it.time < 7L * 24 * 60 * 60 * 1000 }
        reads.subtitle(when (week) { 0 -> "Nothing this week"; 1 -> "Once this week"; else -> "$week times this week" })
        if (!ready) checkModel()
        showStatus()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun open(activity: Class<out Activity>) = startActivity(Intent(this, activity))

    /** The apps the bubble shows in, as "WhatsApp, Gmail and 2 more". */
    private fun appsLine(): String {
        val on = AppsActivity.launcherApps(this).filter { Privacy.allowed(this, it.first) }.map { it.second }
        return when (on.size) {
            0 -> "No apps yet"
            1 -> on[0]
            2 -> "${on[0]} and ${on[1]}"
            3 -> "${on[0]}, ${on[1]} and ${on[2]}"
            else -> "${on[0]}, ${on[1]} and ${on.size - 2} more"
        }
    }

    /** The big card: off, getting ready, not ready, paused, or ready to help. */
    private fun showStatus() {
        val on = OwnvoiceService.instance != null
        val paused = Privacy.paused(this)
        val green = on && !paused && problem == null
        status.background = rounded(if (green) primaryContainer else container, 28f)
        headline.setTextColor(if (green) onPrimaryContainer else onSurface)
        detail.setTextColor(if (green) onPrimaryContainer else muted)
        power.setOnCheckedChangeListener(null)
        power.isChecked = on
        power.setOnCheckedChangeListener { _, want ->
            if (want) open(SetupActivity::class.java).also { power.isChecked = false }
            else {
                OwnvoiceService.instance?.disableSelf()
                power.postDelayed({ showStatus() }, 400)
            }
        }
        headline.text = when {
            !on -> "Ownvoice is off"
            problem != null -> "Not ready yet"
            !ready -> "Getting ready…"
            paused -> "Paused"
            else -> "Ready to help"
        }
        detail.text = when {
            !on -> "Turn it on to use the bubble"
            problem != null -> problem
            !ready -> Nano.GETTING_READY
            paused -> "The bubble is hidden everywhere"
            else -> "Tap the bubble in your chats"
        }
        bar.visibility = if (on && !ready && problem == null) View.VISIBLE else View.GONE
        retry.visibility = if (problem != null) View.VISIBLE else View.GONE
    }

    private fun checkModel() {
        if (check?.isActive == true) return
        problem = null
        check = scope.launch {
            try {
                OwnvoiceService.engine.ensureReady({}, { bar.setProgressCompat((it * 100).toInt(), true) })
                ready = true
            } catch (e: PlainError) {
                problem = e.message
            }
            showStatus()
        }
    }
}
