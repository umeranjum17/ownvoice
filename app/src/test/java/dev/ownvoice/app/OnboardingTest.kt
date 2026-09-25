package dev.ownvoice.app

import dev.ownvoice.app.Onboarding.Step
import org.junit.Assert.assertEquals
import org.junit.Test

class OnboardingTest {
    @Test fun offersOnlyTheListedAppsOnThePhoneInOrder() {
        val phone = setOf("com.google.android.gm", "com.whatsapp", "com.twitter.android", "org.thoughtcrime.securesms", "com.android.chrome")
        assertEquals(listOf("X", "WhatsApp", "Gmail"), Onboarding.offered { it in phone }.map { it.second })
        assertEquals(emptyList<Pair<String, String>>(), Onboarding.offered { false })
        assertEquals(listOf("X", "LinkedIn", "Reddit", "Slack", "WhatsApp", "Gmail"), Onboarding.offered { true }.map { it.second })
    }

    @Test fun firstRunGoesWelcomePermissionTryApps() {
        assertEquals(Step.WELCOME, Onboarding.first(setUp = false))
        assertEquals(Step.PERMISSION, Onboarding.next(Step.WELCOME, on = false, setUp = false, apps = true))
        assertEquals(Step.TRY, Onboarding.next(Step.PERMISSION, on = true, setUp = false, apps = true))
        assertEquals(Step.APPS, Onboarding.next(Step.TRY, on = true, setUp = false, apps = true))
        assertEquals(Step.DONE, Onboarding.next(Step.APPS, on = true, setUp = false, apps = true))
    }

    @Test fun skipsWhatIsNotNeeded() {
        // Already on: no permission step.
        assertEquals(Step.TRY, Onboarding.next(Step.WELCOME, on = true, setUp = false, apps = true))
        // None of the offered apps on the phone: no "Where should I help?".
        assertEquals(Step.DONE, Onboarding.next(Step.TRY, on = true, setUp = false, apps = false))
        // "Not now" skips the practice chat, which needs Ownvoice on.
        assertEquals(Step.APPS, Onboarding.next(Step.PERMISSION, on = false, setUp = false, apps = true))
        assertEquals(Step.DONE, Onboarding.next(Step.PERMISSION, on = false, setUp = false, apps = false))
    }

    @Test fun homeSwitchLaterOnlyAsksForThePermission() {
        assertEquals(Step.PERMISSION, Onboarding.first(setUp = true))
        assertEquals(Step.DONE, Onboarding.next(Step.PERMISSION, on = true, setUp = true, apps = true))
        assertEquals(Step.DONE, Onboarding.next(Step.PERMISSION, on = false, setUp = true, apps = true))
    }
}
