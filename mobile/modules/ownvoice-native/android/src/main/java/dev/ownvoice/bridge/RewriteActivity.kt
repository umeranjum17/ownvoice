package dev.ownvoice.bridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.security.MessageDigest

/** React Native surface launched from Android's selection and share actions (R1). */
class RewriteActivity : ReactActivity() {
  override fun getMainComponentName() = "rewrite"
  override fun createReactActivityDelegate(): ReactActivityDelegate = DefaultReactActivityDelegate(this, mainComponentName, true)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    current = this
  }

  override fun onDestroy() {
    if (current === this) current = null
    super.onDestroy()
  }

  override fun onStart() {
    super.onStart()
    current = this
    OwnvoiceService.instance?.panelOpen = true // R5: the bubble hides while this sheet shows.
  }

  override fun onStop() {
    if (current === this) {
      current = null
      OwnvoiceService.instance?.panelOpen = false
    }
    super.onStop()
  }

  val markdownShare: Boolean
    get() = intent?.action == Intent.ACTION_SEND && intent?.type in setOf("text/markdown", "text/x-markdown")

  fun sharedMarkdown(): String? {
    if (!markdownShare) return null
    val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
    return if (uri != null) contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
      else intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
  }

  /** What the selection menu or share handed us (R1, R2). */
  val selectedText: String
    get() = (intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT) ?: intent.getCharSequenceExtra(Intent.EXTRA_TEXT))?.toString().orEmpty()

  /** Editable only from the selection menu of an editable field; a share never is (R4). */
  val editable: Boolean
    get() = intent.action == Intent.ACTION_PROCESS_TEXT && !intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false)

  /** The rewrite is only handed back where the replace is known reliable: our own editable fields.
   *  Browser pages drop the selection while the sheet is up and insert at the caret instead, so
   *  there the rewrite is copied only and the text is left exactly as it was. */
  val handbackAllowed: Boolean
    get() = handbackAllowed(callingPackage, packageName)

  fun finishRewrite(text: String?, replace: Boolean) {
    if (text == null) {
      Log.i(OwnvoiceService.TAG, "rewrite closed")
      finish()
      return
    }
    getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice rewrite", text))
    if (replace && editable && handbackAllowed) {
      setResult(RESULT_OK, Intent().putExtra(Intent.EXTRA_PROCESS_TEXT, text))
      Log.i(OwnvoiceService.TAG, "rewrite returned sha=${sha(text)}")
      // The handback cannot be trusted blindly: the service reads the field back and, if it does
      // not hold exactly one copy of the rewrite replacing the original, puts the original back.
      OwnvoiceService.instance?.verifyReplace(selectedText, text)
      finish()
    } else if (replace && editable) {
      Toast.makeText(this, COPY_ONLY_TOAST, Toast.LENGTH_LONG).show()
      Log.i(OwnvoiceService.TAG, "rewrite copied (page can't be replaced) sha=${sha(text)}")
      finish()
    } else {
      Toast.makeText(this, "Copied.", Toast.LENGTH_SHORT).show()
      Log.i(OwnvoiceService.TAG, "rewrite copied sha=${sha(text)}")
      finish()
    }
  }

  companion object {
    /** The live sheet, so the module reads the intent of the activity that actually opened. */
    @Volatile
    var current: RewriteActivity? = null

    /** Where the replace cannot be confirmed (browser pages and other unattributable callers), nothing is inserted: copy only. */
    const val COPY_ONLY_TOAST = "Copied. The text here wasn't replaced - paste it where you like."

    /** A stable fingerprint for the on-device test; the text itself never goes to the log. */
    fun sha(text: String) = MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }.take(12)

    /** The handback is only known reliable for our own editable fields; everything else copies only. */
    fun handbackAllowed(callingPackage: String?, ownPackage: String): Boolean = callingPackage == ownPackage
  }
}
