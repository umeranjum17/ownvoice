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
    // Expo/Metro inlines EXPO_PUBLIC_* values into the JS at bundle time, but the
    // createBundle<Variant>JsAndAssets task does not list them as inputs, so Gradle
    // reuses the last JS bundle: a release build right after a flagged one ships the
    // stand-in (Expo's Gradle gap). Register every EXPO_PUBLIC_* value as a task input,
    // so a flag change re-bundles. One place, all flags; new flags need no change here.
    const flagInputs = `
// Expo/Metro inlines EXPO_PUBLIC_* values into the JS at bundle time. Without these as
// task inputs Gradle reuses the last bundle, and a release build after a flagged build
// ships that build's stand-in. Adding them as inputs makes a flag change re-bundle.
tasks.configureEach { task ->
    if (task.name.startsWith("createBundle") && task.name.endsWith("JsAndAssets")) {
        System.getenv().each { name, value ->
            if (name.startsWith("EXPO_PUBLIC_")) task.inputs.property("expoPublic." + name, value)
        }
    }
}
`;
    if (!config.modResults.contents.includes('task.inputs.property("expoPublic."')) {
      config.modResults.contents += flagInputs;
    }
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
