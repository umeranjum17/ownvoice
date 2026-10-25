// Expo config. Cleartext is on for "Use my computer" (see usesCleartextTraffic below); Android can't scope it to a
// LAN address, so src/core/plainAddress.ts refuses every other http:// or ws:// address. Proof builds that point
// sign-in or the writer at a host stand-in over plain HTTP (EXPO_PUBLIC_E2E_AUTH_BASE, EXPO_PUBLIC_E2E_OPENROUTER_BASE)
// are let through there only for the origins their own flags name.
module.exports = {
  expo: {
    name: 'Ownvoice',
    slug: 'ownvoice-mobile',
    version: '1.0.11',
    scheme: 'ownvoice',
    icon: './assets/icon/dot-icon.png',
    android: {
      package: 'dev.ownvoice.next',
      versionCode: 14,
      // Reply outcomes and opt-in text stay on this phone, including outside Android backups.
      allowBackup: false,
      adaptiveIcon: {
        foregroundImage: './assets/icon/dot-icon-foreground.png',
        monochromeImage: './assets/icon/dot-icon-monochrome.png',
        backgroundColor: '#FFF0EA',
      },
    },
    plugins: [
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 26,
            // Use my computer dials ws://; @byokit/pair's Noise handshake pins the host key (or the pairing code) and seals every frame with ChaCha20-Poly1305, so the link is encrypted and authenticated. Every other address in the app is https.
            usesCleartextTraffic: true,
          },
        },
      ],
      './plugins/withOwnvoice',
      'expo-sqlite',
    ],
  },
};
