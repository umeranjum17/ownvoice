// Expo config. Cleartext is on for "Use my computer" (see usesCleartextTraffic below); proof builds that point
// sign-in or the writer at a host stand-in over plain HTTP (EXPO_PUBLIC_E2E_AUTH_BASE, EXPO_PUBLIC_E2E_OPENROUTER_BASE)
// rely on it too.
module.exports = {
  expo: {
    name: 'Ownvoice',
    slug: 'ownvoice-mobile',
    version: '1.0.5',
    scheme: 'ownvoice',
    icon: './assets/icon/dot-icon.png',
    android: {
      package: 'dev.ownvoice.next',
      versionCode: 6,
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
            // Use my computer dials ws:// on the home network; the link is encrypted end to end by @byokit/pair. Every other address in the app is https.
            usesCleartextTraffic: true,
          },
        },
      ],
      './plugins/withOwnvoice',
      'expo-sqlite',
    ],
  },
};
