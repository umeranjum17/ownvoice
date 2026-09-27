import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('refuses a release install whose installed APK differs', () => {
  const dir = mkdtempSync(join(here, '.rn08-setup-'));
  try {
    const apk = join(dir, 'app-release.apk');
    writeFileSync(apk, 'expected build');
    const adb = join(dir, 'adb');
    writeFileSync(adb, `#!/bin/sh
printf '%s\\n' "$*" >> "$RN08_ADB_LOG"
case "$*" in
  '-s emulator-5600 emu avd name') printf 'owned_avd\\nOK\\n' ;;
  '-s emulator-5600 shell wm size') printf 'Physical size: 1080x2400\\n' ;;
  '-s emulator-5600 shell input keyevent KEYCODE_WAKEUP'|'-s emulator-5600 shell svc power stayon true'|'-s emulator-5600 shell settings put system screen_off_timeout 1800000'|'-s emulator-5600 uninstall dev.ownvoice.next') : ;;
  '-s emulator-5600 install '*) printf 'Success\\n' ;;
  '-s emulator-5600 shell pm path dev.ownvoice.next') printf 'package:/data/app/base.apk\\n' ;;
  '-s emulator-5600 shell sha256sum /data/app/base.apk') printf '0000000000000000000000000000000000000000000000000000000000000000  /data/app/base.apk\\n' ;;
  *) echo 'unexpected device operation' >&2; exit 9 ;;
esac
`, { mode: 0o755 });
    const log = join(dir, 'adb.log');
    const result = spawnSync(process.execPath, [join(here, 'rn08.mjs'), apk, join(dir, 'shots')], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, ANDROID_SERIAL: 'emulator-5600', OWNVOICE_AVD_NAME: 'owned_avd', RN08_ADB_LOG: log },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /installed APK differs from release build/i);
    assert.doesNotMatch(readFileSync(log, 'utf8'), /force-stop|enabled_accessibility_services|su 0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
