package dev.ownvoice.bridge

import org.junit.Assert.assertEquals
import org.junit.Test

/** The pack-tag mapping: exact when downloadable, same-language fallback for a region
 *  with no pack, pass-through when the language has no pack at all. */
class DictatePackTest {
  private val supported = listOf("en-US", "de-DE", "en-AU", "fr-FR");

  @Test fun exactMatchReturnedAsIs() {
    assertEquals("de-DE", Dictate.pickPackTag("de-DE", supported))
  }

  @Test fun regionWithoutPackFallsBackToSameLanguage() {
    assertEquals("en-US", Dictate.pickPackTag("en-AE", supported))
  }

  @Test fun installedSameLanguagePackWinsOverFirstListed() {
    assertEquals("en-AU", Dictate.pickPackTag("en-AE", listOf("en-GB", "en-US", "en-AU"), listOf("en-AU")))
  }

  @Test fun languageWithoutPackPassesThrough() {
    assertEquals("xx-YY", Dictate.pickPackTag("xx-YY", supported))
  }
}
