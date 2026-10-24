package dev.ownvoice.bridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.security.MessageDigest

/** React Native surface launched from Android's selection and share actions (R1). */
class RewriteActivity : ReactActivity() {
  override fun getMainComponentName() = "rewrite"
  override fun createReactActivityDelegate(): ReactActivityDelegate = DefaultReactActivityDelegate(this, mainComponentName, true)

  /** The editable field the selection came from, with its text and selection read before this sheet takes the
   *  focus (Chrome drops the selection then); Replace writes there. */
  private var sourceField: AccessibilityNodeInfo? = null
  private var sourceText = ""
  private var sourceStart = -1
  private var sourceEnd = -1

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    current = this
    sourceField = OwnvoiceService.instance?.editableBehindSheet()?.also {
      sourceText = it.text?.toString().orEmpty()
      sourceStart = it.textSelectionStart
      sourceEnd = it.textSelectionEnd
    }
    Log.i(OwnvoiceService.TAG, "rewrite source field=${sourceField != null} service=${OwnvoiceService.instance != null}")
  }

  override fun onDestroy() {
    if (current === this) current = null
    super.onDestroy()
  }

  override fun onStart() {
    super.onStart()
    current = this
    OwnvoiceService.panelShown(true) // R5: the bubble hides while this sheet shows.
  }

  override fun onStop() {
    if (current === this) {
      current = null
      OwnvoiceService.panelShown(false)
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

  /** The app the text came from, when Android or the field behind this sheet names it: posts are written for that place. */
  val sourceApp: String?
    get() = callingPackage ?: sourceField?.packageName?.toString()

  /** Editable only from the selection menu of an editable field; a share never is (R4). */
  val editable: Boolean
    get() = intent.action == Intent.ACTION_PROCESS_TEXT && !intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false)

  /**
   * Replace hands the rewrite back to the editable field that sent it, and copies it too:
   * Chrome drops the page's selection when another activity comes to the front, so it may
   * ignore the result or insert it at the caret - the copy is the fallback and the notice
   * says so. Anything else only copies.
   */
  fun finishRewrite(text: String?, replace: Boolean) {
    if (text == null) {
      Log.i(OwnvoiceService.TAG, "rewrite closed")
      finish()
      return
    }
    getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Ownvoice rewrite", text))
    val field = sourceField
    val service = OwnvoiceService.instance
    val whole = withReplaced(sourceText, sourceStart, sourceEnd, selectedText, text)
    if (shouldHandBack(replace, editable) && field != null && service != null && whole != null) {
      // One write path: the field's whole text with the selection swapped, set once the sheet closes.
      service.replaceField(field, whole)
      Toast.makeText(this, "Replaced. Also copied, in case the app didn't take it.", Toast.LENGTH_SHORT).show()
      Log.i(OwnvoiceService.TAG, "rewrite replaces the selection sha=${sha(text)}")
    } else if (shouldHandBack(replace, editable)) {
      setResult(RESULT_OK, Intent().putExtra(Intent.EXTRA_PROCESS_TEXT, text))
      Toast.makeText(this, "Replaced. Also copied, in case the app didn't take it.", Toast.LENGTH_SHORT).show()
      Log.i(OwnvoiceService.TAG, "rewrite returned sha=${sha(text)}")
    } else {
      Toast.makeText(this, "Copied, paste it in", Toast.LENGTH_LONG).show()
      Log.i(OwnvoiceService.TAG, "rewrite copied sha=${sha(text)}")
    }
    finish()
  }

  companion object {
    /** The live sheet, so the module reads the intent of the activity that actually opened. */
    @Volatile
    var current: RewriteActivity? = null

    /** Whether the sheet may hand the rewrite back to the field instead of only copying.
     * Only Replace from the editable selection that sent it; a share is never editable, and
     * Copy never hands back, so the sheet can never double or lose the user's text elsewhere.
     * Pinned by CopyOnlyTest. */
    @JvmStatic
    fun shouldHandBack(replace: Boolean, editable: Boolean) = replace && editable

    /** [field] with [selected] swapped for [text]: at the read selection, else at its only occurrence; null if unsure. */
    fun withReplaced(field: String, start: Int, end: Int, selected: String, text: String): String? {
      if (start in 0 until end && end <= field.length && field.substring(start, end) == selected) return field.replaceRange(start, end, text)
      val at = field.indexOf(selected)
      return if (selected.isNotEmpty() && at >= 0 && field.indexOf(selected, at + 1) < 0) field.replaceRange(at, at + selected.length, text) else null
    }

    /** A stable fingerprint for the on-device test; the text itself never goes to the log. */
    fun sha(text: String) = MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }.take(12)
  }
}
