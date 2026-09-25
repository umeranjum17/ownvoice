package dev.ownvoice.app

import android.app.Activity
import android.os.Bundle
import android.text.format.DateUtils
import android.widget.ImageView
import android.widget.LinearLayout
import com.google.android.material.materialswitch.MaterialSwitch

/**
 * Your computer, once paired: whether it writes your replies, which apps' screens may go to it, and
 * forgetting it. Pairing itself is [PairActivity].
 */
class ComputerActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val computer = Link.computer(this) ?: return finish()
        val page = page("Your computer", "It writes your replies while the Ownvoice helper is open. When it isn't, this phone writes them.")
        val seen = if (computer.seen == 0L) "Paired with ${computer.name}"
        else "Last answered " + DateUtils.getRelativeTimeSpanString(computer.seen).toString().lowerFirst()
        val writes = MaterialSwitch(this).apply {
            contentDescription = "Let my computer write"
            isChecked = Link.computerWrites(context)
            setOnCheckedChangeListener { _, on -> Link.setComputerWrites(context, on) }
        }
        page.add(group().apply { row(item(icon(R.drawable.ic_computer), "Let my computer write", seen, writes) { writes.toggle() }) }, bottom = 20f)

        page.add(label("Apps that can use it").apply { setPadding(px(8), 0, 0, 0) }, bottom = 4f)
        page.add(text("In other apps, what's on screen stays on this phone. You can still send one reply at a time from the replies panel.", Type.BODY)
            .apply { setPadding(px(8), 0, px(8), 0) }, bottom = 10f)
        val list = page.add(group(), bottom = 20f)
        AppsActivity.launcherApps(this).filter { Privacy.allowed(this, it.first) }.forEach { (app, label) ->
            val icon = ImageView(this).apply {
                setImageDrawable(runCatching { packageManager.getApplicationIcon(app) }.getOrNull())
                layoutParams = LinearLayout.LayoutParams(px(40), px(40))
            }
            val switch = MaterialSwitch(this).apply {
                contentDescription = label
                isChecked = Privacy.mayGoToComputer(context, app)
                setOnCheckedChangeListener { _, on -> Privacy.setMayGoToComputer(context, app, on) }
            }
            list.row(item(icon, label, end = switch) { switch.toggle() })
        }

        page.add(text("It uses the account you signed in to on your computer. This phone never holds that login. " +
            "Replies are still checked on this phone.", Type.BODY).apply { setPadding(px(8), 0, px(8), 0) }, bottom = 12f)
        page.add(ghost("Forget this computer") { Link.forget(this); finish() }, width = -2)
    }
}
