package dev.ownvoice.bridge

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

/** The drafts panel: the "panel" React Native component in a see-through activity over the app the person was in. */
class PanelActivity : ReactActivity() {
  override fun getMainComponentName() = "panel"
  override fun createReactActivityDelegate(): ReactActivityDelegate = DefaultReactActivityDelegate(this, mainComponentName, true)

  override fun onStart() {
    super.onStart()
    current = this
    OwnvoiceService.sheetShown(this, true)
  }

  override fun onStop() {
    OwnvoiceService.sheetShown(this, false)
    if (current === this) current = null
    super.onStop()
  }

  override fun onDestroy() {
    PhoneModel.release()
    super.onDestroy()
  }

  companion object {
    @Volatile var current: PanelActivity? = null
  }
}
