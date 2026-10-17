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
    // llama.rn's native code comes from its postinstall download, and its CMake step skips a
    // missing set without failing: the APK then installs, but the phone writer can never start.
    const nativeLibs = `
// The phone writer needs llama.rn's downloaded native libraries; fail the build without them.
tasks.register("ownvoiceNativeLibs") {
    def lib = file("\${rootDir}/../node_modules/llama.rn/android/src/main/jniLibs/arm64-v8a/librnllama.so")
    doLast {
        if (!lib.exists()) throw new GradleException("Missing llama.rn native libraries (" + lib + "). Run: node node_modules/llama.rn/install/download-native-artifacts.js")
    }
}
tasks.named("preBuild") { dependsOn("ownvoiceNativeLibs") }
`;
    if (!config.modResults.contents.includes('tasks.register("ownvoiceNativeLibs")')) {
      config.modResults.contents += nativeLibs;
    }
    // CMake builds llama.rn's JNI wrappers only when a prebuilt set exists at configure time, so a stale
    // build cache packages an APK without them and the phone writer never starts. Check the APK itself.
    const apkNativeLibs = `
def llamaRnLibs = [
    "arm64-v8a": ["librnllama.so", "librnllama_jni.so", "librnllama_jni_v8.so", "librnllama_jni_v8_2.so", "librnllama_jni_v8_2_dotprod.so", "librnllama_jni_v8_2_dotprod_i8mm.so", "librnllama_jni_v8_2_i8mm.so", "librnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl.so"],
    "x86_64": ["librnllama.so", "librnllama_jni.so", "librnllama_jni_x86_64.so"],
]
tasks.matching { it.name == "assembleRelease" }.configureEach { task ->
    task.doLast {
        def apk = layout.buildDirectory.dir("outputs/apk/release").get().asFile.listFiles().find { it.name.endsWith(".apk") }
        def entries = new java.util.zip.ZipFile(apk).withCloseable { zip -> zip.entries().collect { it.name } }
        def missing = []
        llamaRnLibs.each { abi, libs ->
            if (entries.any { it.startsWith("lib/" + abi + "/") }) libs.each { lib -> if (!entries.contains("lib/" + abi + "/" + lib)) missing << abi + "/" + lib }
        }
        if (missing) throw new GradleException("The APK lacks llama.rn native libraries: " + missing.join(", ") + ". Delete android/app/.cxx and build again.")
    }
}
`;
    if (!config.modResults.contents.includes('def llamaRnLibs')) {
      config.modResults.contents += apkNativeLibs;
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
