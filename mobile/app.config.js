// Expo config. Proof builds that point sign-in at a host stand-in over plain HTTP
// (EXPO_PUBLIC_E2E_AUTH_BASE, mobile/e2e/signin-wait.mjs) need cleartext there;
// distributable builds never set that flag, so the shipped manifest keeps it off.
module.exports = {
  expo: {
    name: 'Ownvoice',
    slug: 'ownvoice-mobile',
    version: '1.0.1',
    scheme: 'ownvoice',
    icon: './assets/icon/dot-icon.png',
    android: {
      package: 'dev.ownvoice.next',
      versionCode: 2,
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
            // Proof builds only (see above): plain HTTP to the host stand-in.
            ...(process.env.EXPO_PUBLIC_E2E_AUTH_BASE ? { usesCleartextTraffic: true } : {}),
          },
        },
      ],
      './plugins/withOwnvoice',
      'expo-sqlite',
    ],
  },
};
