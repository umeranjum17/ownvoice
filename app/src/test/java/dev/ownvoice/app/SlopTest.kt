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
        flags("Let's delve into the data.", "a phrase people say to anyone")
        flags("This tool is a game-changer for us.", "a phrase people say to anyone")
        flags("I'll circle back on Monday.", "a phrase people say to anyone")
        clear("I'll call you back on Monday.", "a phrase people say to anyone")
        clear("The tent fits four people.", "a phrase people say to anyone")
    }

    @Test fun contrastFrames() {
        flags("It's not about speed, it's about trust.", "“not this, but that” pattern")
        flags("This isn't just a phone.", "“not this, but that” pattern")
        flags("Not a bug but a feature.", "“not this, but that” pattern")
        flags("The real question is who pays.", "“not this, but that” pattern")
        clear("I'm not sure but I think so.", "“not this, but that” pattern")
        clear("It is not raining.", "“not this, but that” pattern")
    }

    @Test fun listsOfThree() {
        flags("It's fast, simple, and fun.", "three things in a row")
        flags("Bring tea, coffee or juice.", "three things in a row")
        clear("Bring tea and coffee.", "three things in a row")
        clear("Yes, Saturday works, and I'll bring the stove.", "three things in a row")
        clear("Yes, Saturday works, and the stove is ready.", "three things in a row")
        clear("Sure, 9 works, and Sam will bring food.", "three things in a row")
    }

    @Test fun emDashes() {
        flags("Saturday works — see you then.", Slop.LONG_DASH)
        flags("Saturday works—see you then.", Slop.LONG_DASH)
        clear("Saturday works - see you then.", Slop.LONG_DASH)
        clear("Pages 3-5.", Slop.LONG_DASH)
    }

    @Test fun flatteryOpeners() {
        flags("Great question! It depends.", "starts with flattery")
        flags("Love this take. I'd add one thing.", "starts with flattery")
        flags("Couldn't agree more, honestly.", "starts with flattery")
        clear("Saturday works, great.", "starts with flattery")
        clear("I think it depends.", "starts with flattery")
    }

    @Test fun closingCallsToAction() {
        flags("Saturday works. What do you think?", "ends by asking for their thoughts")
        flags("Here is the plan. Let me know if you have questions.", "ends by asking for their thoughts")
        flags("Shipped the fix. Thoughts?", "ends by asking for their thoughts")
        clear("Let me know if you're coming. I'll bring the stove.", "ends by asking for their thoughts")
        clear("See you at 9.", "ends by asking for their thoughts")
    }

    @Test fun metaPreambles() {
        flags("Here's a reply you could send: Saturday works.", "starts with “Here’s a reply”")
        flags("Sure! Here's a reply: Saturday works.", "starts with “Here’s a reply”")
        flags("Here is a short, friendly response:\nSaturday works.", "starts with “Here’s a reply”")
        clear("Here we go again.", "starts with “Here’s a reply”")
        clear("Saturday works.", "starts with “Here’s a reply”")
        clear("Sure, 9 works.", "starts with “Here’s a reply”")
    }

    @Test fun emojiAndHashtagStuffing() {
        flags("Launch day 🚀🔥🎉", "lots of emoji")
        flags("New post #ai #buildinpublic", "lots of hashtags")
        clear("Nice 🙂", "lots of emoji")
        clear("See issue #42 in the repo", "lots of hashtags")
    }

    @Test fun plainReplyIsClean() {
        val text = "Saturday works.\nI'll bring the stove.\n\nSee you at 9"
        assertEquals(emptyList<String>(), reasons(text))
        assertEquals("Sounds natural", Slop.words(Slop.score(0, 1, 9)))
    }

    @Test fun hitSpansPointAtThePhrase() {
        val text = "Honestly, let's delve in."
        val hit = Slop.hits(text).single()
        assertEquals("delve", text.substring(hit.start, hit.end))
    }

    @Test fun scoreWords() {
        assertEquals("Sounds natural", Slop.words(Slop.score(1, null, null)))
        assertEquals("A bit stock", Slop.words(Slop.score(1, 4, 6)))
        assertEquals("Sounds canned", Slop.words(Slop.score(3, 8, 2)))
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
