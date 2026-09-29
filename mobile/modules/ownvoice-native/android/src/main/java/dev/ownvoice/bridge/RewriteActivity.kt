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
    PhoneModel.release()
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

  /**
   * Copy-only everywhere: the sheet never hands text back to a field. Chrome drops the page's
   * selection when another activity comes to the front, so a handback may be ignored or
   * inserted at the caret next to the original - doubling the user's text while claiming success.
   * The rewrite is copied and the notice says plainly where to put it.
   */
  fun finishRewrite(text: String?, replace: Boolean) {
    if (text == null) {
      Log.i(OwnvoiceService.TAG, "rewrite closed")
      finish()
      return
    }
    getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice rewrite", text))
    // `replace` is kept for the bridge signature; the policy below is always copy-only.
    if (shouldHandBack(replace)) {
      setResult(RESULT_OK, Intent().putExtra(Intent.EXTRA_PROCESS_TEXT, text))
      Log.i(OwnvoiceService.TAG, "rewrite returned sha=${sha(text)}")
    } else {
      Toast.makeText(this, "Copied.", Toast.LENGTH_SHORT).show()
      Log.i(OwnvoiceService.TAG, "rewrite copied sha=${sha(text)}")
    }
    finish()
  }

  companion object {
    /** The live sheet, so the module reads the intent of the activity that actually opened. */
    @Volatile
    var current: RewriteActivity? = null

    /** Whether the sheet may hand the rewrite back to the field instead of copying.
     * Always false: no field - own or another app's - gets a handback, so the sheet can never
     * double or lose the user's text. Pinned by CopyOnlyTest. */
    @JvmStatic
    fun shouldHandBack(@Suppress("UNUSED_PARAMETER") replace: Boolean) = false

    /** A stable fingerprint for the on-device test; the text itself never goes to the log. */
    fun sha(text: String) = MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }.take(12)
  }
}
