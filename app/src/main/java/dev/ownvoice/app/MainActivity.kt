package dev.ownvoice.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** The on/off switch (Android's accessibility setting), the on-device model's state, and the privacy controls. */
class MainActivity : Activity() {
    private val scope = MainScope()
    private lateinit var service: TextView
    private lateinit var model: TextView
    private lateinit var pause: Switch
    private lateinit var reads: Button
    private lateinit var voice: Button
    private lateinit var apps: LinearLayout
    private lateinit var computer: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * resources.displayMetrics.density).toInt()
        service = TextView(this).apply { textSize = 16f }
        model = TextView(this).apply { textSize = 16f; setPadding(0, pad, 0, 0) }
        pause = Switch(this).apply { text = "Pause: hide the bubble everywhere"; textSize = 16f; setPadding(0, pad, 0, 0) }
        reads = Button(this).apply { setOnClickListener { startActivity(Intent(context, ReadsActivity::class.java)) } }
        voice = Button(this).apply { setOnClickListener { startActivity(Intent(context, VoiceActivity::class.java)) } }
        apps = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        computer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        setContentView(FrameLayout(this).apply { fitsSystemWindows = true; addView(ScrollView(context).apply { addView(LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            addView(TextView(context).apply { text = "Ownvoice"; textSize = 24f })
            addView(TextView(context).apply {
                textSize = 16f
                setPadding(0, pad / 2, 0, pad / 2)
                text = "Ownvoice reads the screen only when you tap its bubble. What it reads stays on this phone, " +
                    "unless you pair your own computer to write drafts. It never sends a message for you."
            })
            addView(TextView(context).apply {
                textSize = 14f
                text = "Tap the Ownvoice bubble in any app switched on below to get reply drafts from the model on this phone, " +
                    "or better versions of what you have already written. " +
                    "It changes a text field only when you tap Insert.\n\n" +
                    "To rewrite text without the bubble, select it in any app and choose Ownvoice in the selection menu."
            })
            addView(service)
            addView(Button(context).apply {
                text = "Turn Ownvoice on or off"
                setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
            })
            addView(model)
            addView(Button(context).apply {
                text = "Check or download the model"
                setOnClickListener { checkModel() }
            })
            addView(pause)
            addView(voice)
            addView(reads)
            addView(computer)
            addView(TextView(context).apply { text = "Apps where the bubble works"; textSize = 18f; setPadding(0, pad, 0, 0) })
            addView(TextView(context).apply { text = "In apps that are off, the bubble doesn't show and nothing is read."; textSize = 14f })
            addView(apps)
        }) }) })
    }

    override fun onResume() {
        super.onResume()
        service.text = if (OwnvoiceService.instance != null) "Ownvoice is on." else "Ownvoice is off."
        pause.setOnCheckedChangeListener(null)
        pause.isChecked = Privacy.paused(this)
        pause.setOnCheckedChangeListener { _, on -> Privacy.setPaused(this, on) }
        voice.text = "Your voice (${Voice.rules(this).never.size} never-say phrases)"
        reads.text = "What was read (${Privacy.reads(this).size} in the last 30 days)"
        showApps()
        showComputer()
    }

    private fun showComputer() = showComputer(computer, launcherApps().filter { Privacy.allowed(this, it.first) })

    /** Every app with a launcher icon, as (package, label). */
    private fun launcherApps() = packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
        .map { it.activityInfo.packageName to it.loadLabel(packageManager).toString() }
        .distinctBy { it.first }

    /** Every app with a launcher icon, switched-on ones first. */
    private fun showApps() {
        apps.removeAllViews()
        launcherApps()
            .sortedWith(compareBy({ !Privacy.allowed(this, it.first) }, { it.second.lowercase() }))
            .forEach { (app, label) ->
                apps.addView(Switch(this).apply {
                    text = label
                    textSize = 16f
                    setPadding(0, (8 * dp).toInt(), 0, (8 * dp).toInt())
                    isChecked = Privacy.allowed(context, app)
                    setOnCheckedChangeListener { _, on -> Privacy.setAllowed(context, app, on); showComputer() }
                })
            }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun checkModel() {
        scope.launch {
            model.text = "Checking the on-device model…"
            model.text = try {
                Nano.ensureReady { model.text = it }
                "The on-device model is ready (${Nano.modelName()})."
            } catch (e: PlainError) {
                e.message
            }
        }
    }
}
