package dev.ownvoice.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** The on/off switch (Android's accessibility setting) and the on-device model's state. */
class MainActivity : Activity() {
    private val scope = MainScope()
    private lateinit var service: TextView
    private lateinit var model: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * resources.displayMetrics.density).toInt()
        service = TextView(this).apply { textSize = 16f }
        model = TextView(this).apply { textSize = 16f; setPadding(0, pad, 0, 0) }
        setContentView(FrameLayout(this).apply { fitsSystemWindows = true; addView(LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            addView(TextView(context).apply { text = "Ownvoice"; textSize = 24f })
            addView(TextView(context).apply {
                textSize = 14f
                text = "Tap the Ownvoice bubble in any app to get reply drafts from the model on this phone. " +
                    "Ownvoice reads the screen only when you tap the bubble, inserts only when you tap Insert, " +
                    "and never sends anything. Nothing you write leaves your phone."
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
        }) })
    }

    override fun onResume() {
        super.onResume()
        service.text = if (OwnvoiceService.instance != null) "Ownvoice is on." else "Ownvoice is off."
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
