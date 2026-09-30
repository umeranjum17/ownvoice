# Android icon audit

Ownvoice ships two Android packages: Expo `dev.ownvoice.next` and legacy Kotlin
`dev.ownvoice.app`. There is no shipped iOS or web surface, so no iOS, favicon or
PWA icon set is added.

The three existing Dot masters in `mobile/assets/icon/` remain unchanged.
[Expo config](../../mobile/app.config.js) selects the main icon, adaptive foreground,
monochrome layer and background colour. Expo prebuild generates launcher,
round, foreground and monochrome resources at mdpi through xxxhdpi. The legacy
manifest now selects launcher and round resources generated from those same masters.
The sync script preserves Expo's image bytes but uses `.png` filenames in the
legacy app, matching their encoded format; Android resource names stay the same.
Accessibility services inherit their application's icon (neither overrides it).

To regenerate, with mobile dependencies installed and ImageMagick available:

```sh
cd mobile
npx expo prebuild --platform android --no-install
sh scripts/sync-icons.sh
mkdir -p ../.icon-scratch
python3 scripts/icon-contact-sheet.py --scratch ../.icon-scratch
rmdir ../.icon-scratch
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
Both apps use identical image bytes. The foreground and monochrome artwork live
in the [source assets](../../mobile/assets/icon/); use the generated contact sheet
to review their size and fit under launcher masks.
The checked-in sheet records the original export filenames: its legacy `.webp`
labels correspond to the `.png` files now used by the Kotlin app.

[Android launcher proof](OWNVOICE-icons-launcher.png) shows both release packages
installed on the task-owned `ov-icons` Android 16 emulator. The legacy unsigned
release was signed with a disposable proof key only for this emulator install.
The emulator was stopped after capture; no physical phone was modified.

Validation: Expo prebuild and both `assembleRelease` builds passed, as did mobile
lint, typecheck, 46 Jest suites (760 tests, 46 snapshots), and 50 legacy unit tests.
Legacy mipmap files retain the generated Expo exports byte for byte. Themed icons
are shown as rendered resource previews, while the launcher capture shows
full-colour icons; notification limitations are described above.
