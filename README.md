<p align="center">
  <img src="mobile/assets/icon/dot-icon.png" width="112" alt="Ownvoice icon: Dot, a smiling coral drop" />
</p>

<h1 align="center">Ownvoice</h1>

<p align="center">
  <strong>Sound like yourself, just a little better.</strong><br />
  A friendly bubble over your chats that polishes what you wrote, right where you wrote it.
</p>

<p align="center">
  <a href="https://github.com/umeranjum17/ownvoice/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/umeranjum17/ownvoice?style=flat-square&label=release&color=f2765f" /></a>
  <img alt="Android 8 or later" src="https://img.shields.io/badge/Android-8%2B-3ddc84?style=flat-square" />
  <a href="https://github.com/umeranjum17/ownvoice/actions/workflows/android.yml"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/umeranjum17/ownvoice/android.yml?branch=main&style=flat-square&label=build" /></a>
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-8a8a8a?style=flat-square" /></a>
</p>

<p align="center">
  <a href="https://github.com/umeranjum17/ownvoice/releases/latest/download/Ownvoice.apk"><img alt="Download for Android" src="https://img.shields.io/badge/Download_for_Android-f2765f?style=for-the-badge&logo=android&logoColor=white" /></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/readme/hero-dark.webp" />
    <img src="docs/readme/hero-light.webp" width="320" alt="A practice chat: you type a reply, tap the coral bubble, and Ownvoice shows your words with a stock phrase marked, then cleaner versions to use instead" />
  </picture>
</p>

## Why Ownvoice

Most writing help asks you to paste your message somewhere else, then hands back words that sound like everyone. Ownvoice stays where you already write. Tap the bubble, and it marks the stock phrases and offers a few cleaner versions that still sound like you. You pick one, and you always press Send yourself.

## See it

<table>
  <tr>
    <td align="center" width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/polish-dark.webp" />
        <img src="docs/readme/polish-light.webp" width="100%" alt="Polish your message over a chat: the typed reply with a stock phrase marked, then a Cleaned up version and a Shorter one, each with Use this" />
      </picture>
      <br /><strong>Polish what you wrote</strong><br />Tap the bubble in any chat.
    </td>
    <td align="center" width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/rewrite-dark.webp" />
        <img src="docs/readme/rewrite-light.webp" width="100%" alt="Make it better: a selected sentence and its shorter version, with buttons for Shorter, Simpler, Fix spelling, Friendlier and Firmer" />
      </picture>
      <br /><strong>Make any text better</strong><br />Select text, choose Ownvoice.
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/writer-dark.webp" />
        <img src="docs/readme/writer-light.webp" width="100%" alt="How should Ownvoice write? On this phone, private and free, or with an AI plan you already pay for" />
      </picture>
      <br /><strong>Choose who writes</strong><br />On your phone, or your own plan.
    </td>
    <td align="center" width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/voice-dark.webp" />
        <img src="docs/readme/voice-light.webp" width="100%" alt="Your voice: phrases you never say, a note on how you write, and simple writing rules" />
      </picture>
      <br /><strong>Teach it your voice</strong><br />Phrases you never say, rules you like.
    </td>
  </tr>
</table>

## Quick start

1. **Get the app.** On your Android phone, [download Ownvoice](https://github.com/umeranjum17/ownvoice/releases/latest/download/Ownvoice.apk), then tap **Open** and **Install**.
2. **Allow the bubble.** Open Ownvoice, choose how it writes, then tap **Turn on** and switch on **Use Ownvoice**.
3. **Tap it in a chat.** Write your reply, tap the bubble, and pick the version you like.

Switch greyed out? Open Ownvoice's **App info**, tap **⋮**, choose **Allow restricted settings**, and try again. Step-by-step help is in the [user guide](docs/readme/guide.md#get-started).

Want to build it yourself? See [Build and run](mobile/README.md#android-build-and-device-checks).

## What it does

- ✨ **Polishes in place.** Marks stock phrases and fixes clear slips like "shoud" or "dont".
- ✂️ **Rewrites any selection.** Shorter, simpler, friendlier or firmer, from any app.
- 🔒 **Writes on your phone,** private, free and offline, or with the AI plan you already pay for.
- 🗣️ **Learns your voice.** Your never-say list and writing rules shape every draft.
- 👀 **Honest about every draft.** Plain notes on what it checked, never a score to chase.
- 📱 **Only where you want it.** Pick the apps that show the bubble, or pause it any time.
- 🌗 **Feels like your phone.** Your colours, your font, light and dark.

## Your words stay yours

- Ownvoice reads the screen **only when you tap the bubble**, and only in apps you switched on.
- It **never sends, posts or taps anything** for you.
- On this phone, nothing leaves the phone. With your own plan, the chat goes there only when you tap.
- **What Ownvoice read** lists every tap (never your text), and **Wipe everything** clears it all.

Full details: [Your words stay yours](docs/readme/guide.md#your-words-stay-yours).

## Known limits

Reply ideas are paused in 1.0.3: write your reply first, then tap to polish it ([why](docs/readme/guide.md#reply-ideas-are-unavailable-for-now)). The download is the latest release; pictures here show the coming 1.0.3, so a few screens may differ.

## Learn more

- 📖 [User guide](docs/readme/guide.md): every screen and check in detail
- 🛠️ [Android app](mobile/README.md): build, checks and how Ownvoice writes
- 🧩 [Writing core](packages/engine/README.md) and its [quality gate](mobile/eval/README.md)
- 🎨 [Icons](docs/icons/README.md) · 🤖 [Agent notes](AGENTS.md) · 📦 [All releases](https://github.com/umeranjum17/ownvoice/releases)
- The original Kotlin app lives in [app/](app/README.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
