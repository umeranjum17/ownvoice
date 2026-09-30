#!/bin/sh
# Run after Expo prebuild; both Android apps use the same Dot artwork.
set -eu
cd "$(dirname "$0")/.."
for density in mdpi hdpi xhdpi xxhdpi xxxhdpi anydpi-v26; do
  target="../app/src/main/res/mipmap-$density"
  mkdir -p "$target"
  for source in android/app/src/main/res/mipmap-"$density"/ic_launcher*; do
    filename=${source##*/}
    # Expo exports PNG bytes with a .webp suffix; retain the bytes and resource name.
    case "$filename" in
      *.webp) filename="${filename%.webp}.png" ;;
    esac
    cp "$source" "$target/$filename"
  done
done
cp modules/ownvoice-native/android/src/main/res/drawable/ic_stat_ownvoice.xml ../app/src/main/res/drawable/
# Adaptive XML references the same background as app.config.js.
node - <<'NODE'
const fs = require('fs');
const background = require('./app.config').expo.android.adaptiveIcon.backgroundColor;
fs.writeFileSync('../app/src/main/res/values/icon.xml', `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="iconBackground">${background}</color>\n</resources>\n`);
NODE
mkdir -p assets/icon/store
# Play applies its own corner mask; the upload must be an opaque square.
background=$(node -p "require('./app.config').expo.android.adaptiveIcon.backgroundColor")
magick assets/icon/dot-icon.png -background "$background" -alpha remove -alpha off -resize 512x512 assets/icon/store/play-store.png
