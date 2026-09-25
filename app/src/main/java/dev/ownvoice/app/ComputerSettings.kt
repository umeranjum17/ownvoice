package dev.ownvoice.app

import android.app.Activity
import android.content.Intent
import android.text.format.DateUtils
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.Switch
import android.widget.TextView

/**
 * The main screen's "Who writes your drafts" part: pair a computer, choose it or this phone, and pick
 * which apps' screens may go to it. Fills [box] afresh; [apps] are the (package, label) pairs where the bubble works.
 */
fun Activity.showComputer(box: LinearLayout, apps: List<Pair<String, String>>) {
    box.removeAllViews()
    val pad = (16 * dp).toInt()
    fun text(s: String, size: Float = 14f, top: Int = 0) = box.addView(TextView(this).apply { text = s; textSize = size; setPadding(0, top, 0, 0) })
    text("Who writes your drafts", 18f, pad)
    val computer = Link.computer(this)
    if (computer == null) {
        text("This phone writes them. Your computer can write better ones.")
        box.addView(Button(this).apply { text = "Use my computer"; setOnClickListener { startActivity(Intent(context, PairActivity::class.java)) } })
        return
    }
    val onComputer = RadioButton(this).apply { text = "My computer (this phone fills in when it's off)"; id = View.generateViewId() }
    val onPhone = RadioButton(this).apply { text = "This phone only"; id = View.generateViewId() }
    box.addView(RadioGroup(this).apply {
        addView(onComputer)
        addView(onPhone)
        check(if (Link.computerWrites(context)) onComputer.id else onPhone.id)
        setOnCheckedChangeListener { _, id -> Link.setComputerWrites(context, id == onComputer.id) }
    })
    val seen = if (computer.seen == 0L) "" else " Last answered " + DateUtils.getRelativeTimeSpanString(computer.seen).toString().replaceFirstChar { it.lowercase() } + "."
    text("Your computer (${computer.name}) writes while ownvoice-link runs on it.$seen " +
        "It uses the account you signed in to there; this phone never holds that login. Drafts are still checked on this phone.")
    text("Apps that may go to your computer", 16f, pad / 2)
    text("In these apps, what's on screen goes to your computer when it writes. Other apps stay on this phone, and the drafts panel lets you send one anyway.")
    apps.forEach { (app, label) ->
        box.addView(Switch(this).apply {
            text = label
            textSize = 16f
            setPadding(0, (8 * dp).toInt(), 0, (8 * dp).toInt())
            isChecked = Privacy.mayGoToComputer(context, app)
            setOnCheckedChangeListener { _, on -> Privacy.setMayGoToComputer(context, app, on) }
        })
    }
    box.addView(Button(this).apply {
        text = "Forget this computer"
        setOnClickListener { Link.forget(context); showComputer(box, apps) }
    })
}
