# Android icon audit

Ownvoice ships two Android packages: Expo `dev.ownvoice.next` and legacy Kotlin
`dev.ownvoice.app`. There is no shipped iOS or web surface, so no iOS, favicon or
PWA icon set is added.

The three existing Dot masters in `mobile/assets/icon/` remain unchanged.
`mobile/app.config.js` selects the main icon, adaptive foreground and monochrome
layer, with `#FFF0EA` as the adaptive background. Expo prebuild generates launcher,
round, foreground and monochrome resources at mdpi through xxxhdpi. The legacy
manifest now selects launcher and round resources generated from those same masters.
Accessibility services inherit their application's icon (neither overrides it).

To regenerate, with mobile dependencies installed and ImageMagick available:

```sh
cd mobile
npx expo prebuild --platform android --no-install
sh scripts/sync-icons.sh
python3 scripts/icon-contact-sheet.py --scratch /path/to/scratch
```

The contact-sheet script also needs Fontconfig (`fc-match`) for labels.

The sync also copies the existing white-on-transparent notification vector. This
checkout has no notification-producing call site in either app; the asset is
available for that future use. The contact sheet renders it at 24–96 pixels,
without colour. Notification display on a device is therefore not claimed.

The Play upload is `mobile/assets/icon/store/play-store.png`: an opaque 512×512
square. Its corners are filled with the configured background so Play can apply
its own mask. It is shared by both packages.

[Contact sheet](OWNVOICE-icons-contact-sheet.png) shows every exported density at
its actual pixel dimensions, then circle, squircle and themed adaptive previews.
Both apps use identical exports. The foreground's visible bounds at 1024 pixels
are 362×473 at (331,296); the monochrome bounds are 340×451 at (342,307).
Both fit inside the central 66% safe circle. The existing art is crisp and retains
its complete face under the launcher masks.

[Android launcher proof](OWNVOICE-icons-launcher.png) shows both release packages
installed on the task-owned `ov-icons` Android 16 emulator. The legacy unsigned
release was signed with a disposable proof key only for this emulator install.
The emulator was stopped after capture; no physical phone was modified.

Validation: Expo prebuild and both `assembleRelease` builds passed, as did mobile
lint, typecheck, 46 Jest suites (760 tests, 46 snapshots), and 50 legacy unit tests.
All 22 legacy mipmap files match the generated Expo exports byte for byte. The
Play asset is 512×512 and fully opaque. Notification display is untested because
neither package produces notifications in this checkout; themed icons are shown
as rendered resource previews, while the launcher capture shows full-colour icons.
