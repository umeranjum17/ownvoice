package dev.ownvoice.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SlopTest {
    private fun reasons(text: String) = Slop.hits(text).map { it.reason }
    private fun flags(text: String, reason: String) = assertTrue("expected $reason in: $text -> ${reasons(text)}", reason in reasons(text))
    private fun clear(text: String, reason: String) = assertFalse("unexpected $reason in: $text -> ${reasons(text)}", reason in reasons(text))

    @Test fun stockPhrases() {
        flags("Let's delve into the data.", "stock phrase")
        flags("This tool is a game-changer for us.", "stock phrase")
        flags("I'll circle back on Monday.", "stock phrase")
        clear("I'll call you back on Monday.", "stock phrase")
        clear("The tent fits four people.", "stock phrase")
    }

    @Test fun contrastFrames() {
        flags("It's not about speed, it's about trust.", "contrast frame")
        flags("This isn't just a phone.", "contrast frame")
        flags("Not a bug but a feature.", "contrast frame")
        flags("The real question is who pays.", "contrast frame")
        clear("I'm not sure but I think so.", "contrast frame")
        clear("It is not raining.", "contrast frame")
    }

    @Test fun listsOfThree() {
        flags("It's fast, simple, and fun.", "list of three")
        flags("Bring tea, coffee or juice.", "list of three")
        clear("Bring tea and coffee.", "list of three")
        clear("Yes, Saturday works, and I'll bring the stove.", "list of three")
        clear("Yes, Saturday works, and the stove is ready.", "list of three")
        clear("Sure, 9 works, and Sam will bring food.", "list of three")
    }

    @Test fun emDashes() {
        flags("Saturday works — see you then.", "em dash")
        flags("Saturday works—see you then.", "em dash")
        clear("Saturday works - see you then.", "em dash")
        clear("Pages 3-5.", "em dash")
    }

    @Test fun flatteryOpeners() {
        flags("Great question! It depends.", "flattery opener")
        flags("Love this take. I'd add one thing.", "flattery opener")
        flags("Couldn't agree more, honestly.", "flattery opener")
        clear("Saturday works, great.", "flattery opener")
        clear("I think it depends.", "flattery opener")
    }

    @Test fun closingCallsToAction() {
        flags("Saturday works. What do you think?", "closing call to action")
        flags("Here is the plan. Let me know if you have questions.", "closing call to action")
        flags("Shipped the fix. Thoughts?", "closing call to action")
        clear("Let me know if you're coming. I'll bring the stove.", "closing call to action")
        clear("See you at 9.", "closing call to action")
    }

    @Test fun metaPreambles() {
        flags("Here's a reply you could send: Saturday works.", "meta preamble")
        flags("Sure! Here's a reply: Saturday works.", "meta preamble")
        flags("Here is a short, friendly response:\nSaturday works.", "meta preamble")
        clear("Here we go again.", "meta preamble")
        clear("Saturday works.", "meta preamble")
        clear("Sure, 9 works.", "meta preamble")
    }

    @Test fun emojiAndHashtagStuffing() {
        flags("Launch day 🚀🔥🎉", "emoji stuffing")
        flags("New post #ai #buildinpublic", "hashtag stuffing")
        clear("Nice 🙂", "emoji stuffing")
        clear("See issue #42 in the repo", "hashtag stuffing")
    }

    @Test fun plainReplyIsClean() {
        val text = "Saturday works.\nI'll bring the stove.\n\nSee you at 9"
        assertEquals(emptyList<String>(), reasons(text))
        assertEquals("clean", Slop.words(Slop.score(0, 1, 9)))
    }

    @Test fun hitSpansPointAtThePhrase() {
        val text = "Honestly, let's delve in."
        val hit = Slop.hits(text).single()
        assertEquals("delve", text.substring(hit.start, hit.end))
    }

    @Test fun scoreWords() {
        assertEquals("clean", Slop.words(Slop.score(1, null, null)))
        assertEquals("a bit generic", Slop.words(Slop.score(1, 4, 6)))
        assertEquals("sloppy", Slop.words(Slop.score(3, 8, 2)))
        assertEquals(100, Slop.score(10, 10, 0))
    }

    @Test fun addedNumbers() {
        assertEquals(listOf("40"), Slop.addedNumbers("We grew a lot last year", "We grew 40 percent last year"))
        assertEquals(emptyList<String>(), Slop.addedNumbers("Meet at 9:30 on the 3rd", "Let's meet on the 3rd at 9:30"))
        assertEquals(emptyList<String>(), Slop.addedNumbers("We grew 40 percent last year", "We grew a lot last year"))
        assertEquals(emptyList<String>(), Slop.addedNumbers("We sold 1000 tents", "We sold 1,000 tents"))
        assertEquals(emptyList<String>(), Slop.addedNumbers("We sold 1,000 tents", "We sold 1000 tents"))
        assertEquals(emptyList<String>(), Slop.addedNumbers("Meet at 9.30", "Meet at 9:30"))
        assertEquals(emptyList<String>(), Slop.addedNumbers("Raised 12,500,000", "Raised 12500000"))
        assertEquals(listOf("15"), Slop.addedNumbers("Ran 1,5 km", "Ran 15 km"))
        assertEquals(listOf("1,5"), Slop.addedNumbers("Ran 15 km", "Ran 1,5 km"))
        assertEquals(listOf("23"), Slop.addedNumbers("Items 2,3", "Items 23"))
    }
}
