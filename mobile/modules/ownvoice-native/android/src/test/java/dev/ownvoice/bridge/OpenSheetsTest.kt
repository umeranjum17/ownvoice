package dev.ownvoice.bridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The bubble stays hidden while any of Ownvoice's sheets is open (ov-pm-15: it covered the rewrite sheet's close X). */
class OpenSheetsTest {
  @Test fun aLatePanelStopKeepsTheRewriteSheetCovered() {
    val sheets = OpenSheets()
    val panel = Any()
    val rewrite = Any()
    assertTrue(sheets.shown(panel, true))
    assertTrue(sheets.shown(rewrite, true)) // the rewrite sheet starts before the closing panel stops
    assertTrue(sheets.shown(panel, false))
    assertFalse(sheets.shown(rewrite, false))
  }

  @Test fun aLateRewriteStopKeepsThePanelCovered() {
    val sheets = OpenSheets()
    val panel = Any()
    val rewrite = Any()
    sheets.shown(rewrite, true)
    sheets.shown(panel, true)
    assertTrue(sheets.shown(rewrite, false))
    assertFalse(sheets.shown(panel, false))
  }

  @Test fun anOldRewriteSheetStoppingAfterANewOneStarts() {
    val sheets = OpenSheets()
    val old = Any()
    val new = Any()
    sheets.shown(old, true)
    sheets.shown(new, true)
    assertTrue(sheets.shown(old, false))
    assertFalse(sheets.shown(new, false))
  }
}
