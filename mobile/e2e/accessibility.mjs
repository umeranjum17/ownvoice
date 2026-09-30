import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/** Build a standalone test APK: it instruments itself, leaving Ownvoice's process and service alone. */
export function accessibilityProbe(serial, scratch) {
  if (!/^emulator-\d+$/.test(serial)) throw new Error('Accessibility proof requires an owned emulator.');
  const avd = process.env.OWNVOICE_AVD_NAME;
  const actual = execFileSync('adb', ['-s', serial, 'emu', 'avd', 'name'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
  if (!avd || actual !== avd) throw new Error(`AVD ${actual} does not match OWNVOICE_AVD_NAME.`);
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) throw new Error('Set JAVA_HOME to the JDK used to build the app.');
  const env = { ...process.env, PATH: `${javaHome}/bin:${process.env.PATH}` };
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: 'pipe' });
  const build = resolve(scratch, '.accessibility-probe');
  const classes = join(build, 'classes');
  mkdirSync(classes, { recursive: true });
  const tools = join(sdk, 'build-tools', readdirSync(join(sdk, 'build-tools')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1));
  const platform = join(sdk, 'platforms', readdirSync(join(sdk, 'platforms')).filter(x => /^android-\d+$/.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1), 'android.jar');
  const manifest = join(build, 'AndroidManifest.xml');
  writeFileSync(manifest, '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.ownvoice.probe"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/><application android:label="Probe"/><instrumentation android:name="dev.ownvoice.probe.Probe" android:targetPackage="dev.ownvoice.probe"/></manifest>');
  run(join(javaHome, 'bin/javac'), ['-cp', platform, '-d', classes, fileURLToPath(new URL('./probe/Probe.java', import.meta.url))]);
  const jar = join(build, 'probe.jar');
  run(join(javaHome, 'bin/jar'), ['cf', jar, '-C', classes, '.']);
  run(join(tools, 'd8'), ['--lib', platform, '--output', build, jar]);
  const apk = join(build, 'probe.apk');
  run(join(tools, 'aapt'), ['package', '-f', '-M', manifest, '-I', platform, '-F', apk]);
  run('zip', ['-j', apk, join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', fileURLToPath(new URL('../android/app/debug.keystore', import.meta.url)), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', apk]);
  run('adb', ['-s', serial, 'install', '-r', apk]);
  return () => {
    const output = execFileSync('adb', ['-s', serial, 'shell', 'am', 'instrument', '-w', 'dev.ownvoice.probe/dev.ownvoice.probe.Probe'], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
    const json = output.match(/^INSTRUMENTATION_RESULT: nodes=(.+)$/m)?.[1];
    if (!json || !output.includes('INSTRUMENTATION_CODE: 0')) throw new Error(`Accessibility probe failed: ${output}`);
    return JSON.parse(json).filter(node => node.visible && node.bounds[2] > node.bounds[0] && node.bounds[3] > node.bounds[1]);
  };
}

export const center = node => [(node.bounds[0] + node.bounds[2]) / 2, (node.bounds[1] + node.bounds[3]) / 2];
