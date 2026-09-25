const { withProjectBuildGradle } = require('@expo/config-plugins');
module.exports = config => withProjectBuildGradle(config, config => {
  const flag = `subprojects {\n  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {\n    kotlinOptions.freeCompilerArgs += "-Xskip-metadata-version-check"\n  }\n}`;
  if (!config.modResults.contents.includes('-Xskip-metadata-version-check')) {
    config.modResults.contents += `\n${flag}\n`;
  }
  return config;
});
