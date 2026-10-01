const { withProjectBuildGradle, withAppBuildGradle } = require('@expo/config-plugins');
module.exports = config => {
  config = withProjectBuildGradle(config, config => {
    const flag = `subprojects {\n  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {\n    kotlinOptions.freeCompilerArgs += "-Xskip-metadata-version-check"\n  }\n}`;
    if (!config.modResults.contents.includes('-Xskip-metadata-version-check')) {
      config.modResults.contents += `\n${flag}\n`;
    }
    return config;
  });
  return withAppBuildGradle(config, config => {
    // Read credentials only in Gradle's build process, never bake them into config.
    const signing = `
// Dedicated release signing; local builds keep Expo's development key.
if (System.getenv("OWNVOICE_RELEASE_SIGNING") == "1") {
    def required = ["OWNVOICE_KEYSTORE_PATH", "OWNVOICE_STORE_PASSWORD", "OWNVOICE_KEY_ALIAS", "OWNVOICE_KEY_PASSWORD"]
    required.each { name ->
        if (!System.getenv(name)) throw new GradleException("Missing release signing credential: " + name)
    }
    android.signingConfigs.create("ownvoiceRelease") {
        storeFile file(System.getenv("OWNVOICE_KEYSTORE_PATH"))
        storePassword System.getenv("OWNVOICE_STORE_PASSWORD")
        keyAlias System.getenv("OWNVOICE_KEY_ALIAS")
        keyPassword System.getenv("OWNVOICE_KEY_PASSWORD")
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.ownvoiceRelease
}
`;
    if (!config.modResults.contents.includes('// Dedicated release signing;')) {
      config.modResults.contents += signing;
    }
    return config;
  });
};
