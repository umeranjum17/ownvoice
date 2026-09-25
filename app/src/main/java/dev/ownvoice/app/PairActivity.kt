package dev.ownvoice.app

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * "Use my computer": opens the scanner straight away for the code ownvoice-link pair shows, then asks the
 * person to check both screens show the same two words and answer yes on the computer. Google Play
 * services does the scanning, so Ownvoice needs no camera permission.
 */
class PairActivity : Activity() {
    private val scope = MainScope()
    private lateinit var status: TextView
    private lateinit var scan: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * dp).toInt()
        status = TextView(this).apply { textSize = 16f; setPadding(0, pad, 0, 0) }
        scan = Button(this).apply { text = "Scan the code again"; setOnClickListener { scan() } }
        setContentView(FrameLayout(this).apply { fitsSystemWindows = true; addView(ScrollView(context).apply { addView(LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            addView(TextView(context).apply { text = "Use my computer"; textSize = 24f })
            addView(TextView(context).apply {
                textSize = 16f
                setPadding(0, pad / 2, 0, pad / 2)
                text = "Scan the code your computer shows. To show it, run ownvoice-link pair on your computer.\n\n" +
                    "Use only your own computer: it writes with your own account there."
            })
            addView(status)
            addView(scan)
        }) }) })
        if (savedInstanceState == null) scan()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun scan() {
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { code -> code.rawValue?.let(::pair) }
            .addOnFailureListener { status.text = "Couldn't open the scanner. Update Google Play services and try again." }
    }

    private fun pair(qr: String) {
        scan.isEnabled = false
        scope.launch {
            status.text = try {
                Link.parse(qr)
                val check = withContext(Dispatchers.IO) { Link.fingerprint(Link.phoneKey().pin) }
                status.text = "Does your computer show the same two words?\n\n$check\n\nIf it does, answer y on your computer."
                withContext(Dispatchers.IO) { Link.pair(this@PairActivity, qr) }
                scan.text = "Done"
                scan.setOnClickListener { finish() }
                "Done. Your computer writes your drafts now, whenever ownvoice-link is running on it. When it isn't, this phone writes them."
            } catch (e: PlainError) {
                e.message
            } catch (e: Exception) {
                "Couldn't pair: something went wrong on this phone. Try again."
            }
            scan.isEnabled = true
        }
    }
}
