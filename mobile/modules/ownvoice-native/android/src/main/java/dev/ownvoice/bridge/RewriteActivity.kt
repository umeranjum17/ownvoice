package dev.ownvoice.bridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import io.github.umeranjum17.byokit.overlay.FocusedFields
import java.security.MessageDigest

/** React Native surface launched from Android's selection and share actions (R1). */
class RewriteActivity : ReactActivity() {
  override fun getMainComponentName() = "rewrite"
  override fun createReactActivityDelegate(): ReactActivityDelegate = DefaultReactActivityDelegate(this, mainComponentName, true)
  private var pendingVerify: String? = null

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
    OwnvoiceService.sheetShown(this, true) // R5: the bubble hides while this sheet shows.
  }

  override fun onStop() {
    if (current === this) current = null
    OwnvoiceService.sheetShown(this, false)
    pendingVerify?.let { text -> verifyHandback(text) }
    pendingVerify = null
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
   * Replace hands the text back to the field via ACTION_PROCESS_TEXT result; Copy puts it on the
   * clipboard. Replace is verified after the sheet closes: the accessibility service reads the
   * focused field and confirms the exact draft landed, or falls back to copying with an honest
   * notice. The draft is always copied first as the fallback.
   */
  fun finishRewrite(text: String?, replace: Boolean) {
    if (text == null) {
      Log.i(OwnvoiceService.TAG, "rewrite closed")
      finish()
      return
    }
    getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice rewrite", text))
    if (shouldHandBack(replace)) {
      setResult(RESULT_OK, Intent().putExtra(Intent.EXTRA_PROCESS_TEXT, text))
      pendingVerify = text
      Log.i(OwnvoiceService.TAG, "rewrite handback pending sha=${sha(text)}")
    } else {
      Toast.makeText(this, "Copied, paste it in", Toast.LENGTH_LONG).show()
      Log.i(OwnvoiceService.TAG, "rewrite copied sha=${sha(text)}")
    }
    finish()
  }

  /** After the sheet closes, verify the handback landed through the accessibility service. */
  private fun verifyHandback(text: String) {
    val service = OwnvoiceService.instance ?: return fallbackCopy("no service")
    Handler(Looper.getMainLooper()).postDelayed({
      verifyWithRetries(service, text, remaining = 10)
    }, 150)
  }

  private fun verifyWithRetries(service: OwnvoiceService, text: String, remaining: Int) {
    val field = FocusedFields.read(service)
    val ok = field != null && field.text == text && field.selection?.start == text.length && field.selection?.end == text.length
    if (ok) {
      Log.i(OwnvoiceService.TAG, "rewrite verified sha=${sha(text)}")
      service.say("Replaced")
      return
    }
    if (remaining <= 1) return fallbackCopy("verify failed field=${field?.text?.take(20)}")
    Handler(Looper.getMainLooper()).postDelayed({ verifyWithRetries(service, text, remaining - 1) }, 150)
  }

  private fun fallbackCopy(reason: String) {
    Log.i(OwnvoiceService.TAG, "rewrite fallback to copy: $reason")
    OwnvoiceService.instance?.say("Copied, paste it in")
  }

  companion object {
    /** The live sheet, so the module reads the intent of the activity that actually opened. */
    @Volatile
    var current: RewriteActivity? = null

    /** Whether the sheet may hand the rewrite back to the field instead of copying.
     * True when the caller requests replace (the field was editable); the handback is verified
     * after the sheet closes, falling back to copy if it cannot be confirmed. */
    @JvmStatic
    fun shouldHandBack(replace: Boolean) = replace

    /** A stable fingerprint for the on-device test; the text itself never goes to the log. */
    fun sha(text: String) = MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }.take(12)
  }
}
