const { withProjectBuildGradle } = require('@expo/config-plugins');
module.exports = function withOwnvoice(config) {
  return withProjectBuildGradle(config, config => {
    const flag = 'tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach { kotlinOptions.freeCompilerArgs += "-Xskip-metadata-version-check" }';
    if (!config.modResults.contents.includes('-Xskip-metadata-version-check')) {
      config.modResults.contents = config.modResults.contents.replace(/subprojects\s*\{/,
        `subprojects {\n    ${flag}`);
    }
    return config;
  });
};
