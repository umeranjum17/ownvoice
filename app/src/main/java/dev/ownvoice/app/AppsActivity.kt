package dev.ownvoice.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.ImageView
import android.widget.LinearLayout
import com.google.android.material.materialswitch.MaterialSwitch

/** Where the bubble shows: one switch per app with a launcher icon, switched-on ones first. */
class AppsActivity : Activity() {
    companion object {
        /** Every app with a launcher icon, as (package, label). */
        fun launcherApps(context: Context): List<Pair<String, String>> {
            val pm = context.packageManager
            return pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
                .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
                .distinctBy { it.first }
                .sortedWith(compareBy({ !Privacy.allowed(context, it.first) }, { it.second.lowercase() }))
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val page = page("Where the bubble shows", "In apps that are off, the bubble doesn't show and nothing is read.")
        val list = page.add(group())
        launcherApps(this).forEach { (app, label) ->
            val icon = ImageView(this).apply {
                setImageDrawable(runCatching { packageManager.getApplicationIcon(app) }.getOrNull())
                layoutParams = LinearLayout.LayoutParams(px(40), px(40))
            }
            val switch = MaterialSwitch(this).apply {
                contentDescription = label
                isChecked = Privacy.allowed(context, app)
                setOnCheckedChangeListener { _, on -> Privacy.setAllowed(context, app, on) }
            }
            list.row(item(icon, label, end = switch) { switch.toggle() })
        }
    }
}
