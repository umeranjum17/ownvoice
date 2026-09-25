package dev.ownvoice.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.TextView
import com.google.android.material.button.MaterialButton
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
    private lateinit var words: TextView
    private lateinit var scan: MaterialButton

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val page = page("Use my computer", "On your computer, start the Ownvoice helper, then scan the code it shows.")
        page.add(label("Type this on your computer"), bottom = 6f)
        page.add(ghost("ownvoice-link pair") {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Computer command", "ownvoice-link pair"))
            status.text = "Copied. Paste this on your computer."
        }, bottom = 16f)
        page.add(badge(R.drawable.ic_computer, primaryContainer, onPrimaryContainer), top = 8f, bottom = 24f)
        words = page.add(text("", Type.HEADLINE_SMALL).apply { gravity = Gravity.CENTER; visibility = View.GONE }, bottom = 12f)
        status = page.add(text("", Type.BODY_LARGE).apply { setPadding(px(8), 0, px(8), 0) }, bottom = 20f)
        scan = page.add(filled("Scan the code") { scan() }, width = -2)
        page.add(text("Use only your own computer: it writes with your own account there.", Type.BODY).apply { setPadding(px(8), 0, px(8), 0) }, top = 24f)
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
                words.text = withContext(Dispatchers.IO) { Link.fingerprint(Link.phoneKey().pin) }
                words.visibility = View.VISIBLE
                status.text = "Does your computer show these same two words? If it does, answer y on your computer."
                withContext(Dispatchers.IO) { Link.pair(this@PairActivity, qr) }
                words.visibility = View.GONE
                scan.text = "Done"
                scan.setOnClickListener { finish() }
                "All set. Your computer writes your replies while the Ownvoice helper is open. When it isn't, this phone writes them."
            } catch (e: PlainError) {
                words.visibility = View.GONE
                scan.text = "Scan the code again"
                e.message
            } catch (e: Exception) {
                words.visibility = View.GONE
                scan.text = "Scan the code again"
                "Couldn't pair. Try again."
            }
            scan.isEnabled = true
        }
    }
}
