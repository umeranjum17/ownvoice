import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export async function proveOutcomes({ adb, nodes, bubble, wait, evidence, theme, before, out, fixturePkg, pkg }) {
  const task = 'ov-grow-f6a', shot = name => evidence('shot', task, name, before ? 'before' : 'after', theme);
  const motion = async (name, run) => {
    evidence('motion-start', task, name);
    try { return await run(); } finally { evidence('motion-stop'); }
  };
  const open = async route => {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `ownvoice://${route}`);
    await wait(3000);
  };
  const until = async (label, check) => {
    for (let n = 0; n < 25; n++) { if (check(nodes())) return; await wait(1000); }
    throw new Error(`Never saw ${label}: ${JSON.stringify(nodes().filter(n => n.editable || n.focused || n.accessibilityFocused))}\n${adb('logcat', '-d', '-s', 'OwnvoiceNative:I')}`);
  };
  const fixture = async () => {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source'); await wait(5000); const phone = nodes().find(n => n.clickable && n.label?.startsWith('On this phone,')); assert.ok(phone, 'Stub writer choice must be available'); nodes(phone.label);
    await wait(1000); assert.equal(database()['writer-source'], '"phone"', 'Writer chosen through the app UI'); await rebind();
    adb('shell', 'am', 'force-stop', fixturePkg);
    adb('shell', 'am', 'start', '-n', `${fixturePkg}/com.twitter.android.Composer`, '--ez', 'reply', 'true');
    await wait(2000);
    bubble();
    await until('reply cards', list => list.some(n => n.text === 'Use this'));
    await wait(1500);
  };
  const dbPath = `/data/data/${pkg}/files/SQLite/ExpoSQLiteStorage`;
  const local = resolve(out, 'outcomes.sqlite');
  const database = (sql = '') => {
    adb('shell', 'am', 'force-stop', pkg);
    writeFileSync(local, execFileSync('adb', ['-s', process.env.ANDROID_SERIAL, 'exec-out', 'su', '0', 'cat', dbPath]));
    const result = execFileSync('python3', ['-c', `import sqlite3,json,sys\nc=sqlite3.connect(sys.argv[1])\nif sys.argv[2]: c.executescript(sys.argv[2]); c.commit()\nprint(json.dumps(dict(c.execute('select key,value from storage'))))`, local, sql], { encoding: 'utf8' });
    if (sql) {
      adb('push', local, '/data/local/tmp/ov-grow-f6a.sqlite');
      adb('shell', 'su', '0', 'cp', '/data/local/tmp/ov-grow-f6a.sqlite', dbPath);
      adb('shell', 'rm', '/data/local/tmp/ov-grow-f6a.sqlite');
    }
    return JSON.parse(result);
  };
  const rebind = async () => {
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`); const service = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.example.disabled/NoService');
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', service);
    adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
    await until('Ownvoice service bound', () => /Bound services:\s*[\[{][^}\]]*Ownvoice/.test(adb('shell', 'dumpsys', 'accessibility'))); await until('Ownvoice Home ready', list => list.some(n => n.text === 'What Ownvoice read'));
  };
  await open('reads'); shot('records-empty');
  await fixture(); shot('cards'); if (process.env.OWNVOICE_CAPTURE_ONLY === '1') { writeFileSync(`${out}/results.json`, JSON.stringify({ captureOnly: true, theme })); return; }
  if (before) return;
  const source = readFileSync(new URL('../src/core/store.ts', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/^import .* from '(.*?)'/gm)].map(m => m[1]), ['expo-sqlite/kv-store']);
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''), /\b(fetch|XMLHttpRequest|WebSocket|sendEvent|respond)\s*\(/);
  const wifi = adb('shell', 'settings', 'get', 'global', 'wifi_on').trim() === '1';
  const data = adb('shell', 'settings', 'get', 'global', 'mobile_data').trim() === '1';
  try {
  adb('shell', 'svc', 'wifi', 'disable'); adb('shell', 'svc', 'data', 'disable');
  const insert = async (yours = false) => {
    const list = nodes(), buttons = list.filter(n => n.clickable && (n.text || n.label) === 'Use this');
    assert.ok(buttons.length > 1); assert.ok(list.some(n => n.text?.startsWith('Saturday is tricky for me.'))); assert.equal(list.filter(n => n.clickable && (n.text || n.label) === 'Why?')[1]?.bounds[1], buttons[1].bounds[1], 'Why must stay on the suggestion action row');
    adb('logcat', '-c');
    if (/\bmInputShown=true\b/.test(adb('shell', 'dumpsys', 'input_method'))) adb('shell', 'input', 'keyevent', '4');
    const focused = () => {
      const trail = nodes(), target = trail.filter(n => n.clickable && (n.text || n.label) === 'Use this')[yours ? 0 : 1];
      console.log('focus-step', JSON.stringify(trail.filter(n => n.focused || n.accessibilityFocused).map(n => ({ text: n.text || n.label, bounds: n.bounds, focused: n.focused, accessibilityFocused: n.accessibilityFocused }))));
      return !!target && (target.focused || target.accessibilityFocused);
    };
    for (let step = 0; step < 12 && !focused(); step++) adb('shell', 'input', 'keyevent', '61');
    if (!focused()) { shot('focus-step-limit'); throw new Error('The intended card never took focus'); }
    const key = process.env.OWNVOICE_ACTIVATION_KEY ?? '23'; if (key === 'tap') { shot('before-tap'); const b = nodes().filter(n => n.clickable && (n.text || n.label) === 'Use this')[yours ? 0 : 1].bounds; adb('shell', 'input', 'tap', String(Math.round((b[0] + b[2]) / 2)), String(Math.round((b[1] + b[3]) / 2))); } else adb('shell', 'input', 'keyevent', key); shot(`activation-${key}`);
    const expected = yours ? 'I keep my notes at https://example.com.' : list.find(n => n.text?.startsWith('Yes, still on!'))?.text;
    await until('confirmed caller insertion', list => !list.some(n => n.text === 'Use this') && list.some(n => n.editable && n.text === expected) && /insert result ok=true/.test(adb('logcat', '-d', '-s', 'OwnvoiceNative:I')));
    const field = nodes().find(n => n.editable && n.windowType !== 4);
    assert.equal(field?.text, expected, 'Exact insertion must be read back from the caller');
    console.log('insert-landed', yours ? 'yours' : 'suggestion'); return field.text;
  };
  const offText = await motion('insert-and-record', async () => {
    const text = await insert(); shot('insert-off'); await wait(3000); return text;
  });
  let saved = database();
  let rows = JSON.parse(saved['reply-outcomes']);
  assert.equal(rows.length, 1); assert.equal(rows[0].card, 'suggestion'); assert.equal(rows[0].platform, 'x');
  assert.ok(rows[0].at > 0); assert.ok('level' in rows[0]);
  const facts = execFileSync('python3', ['-c', 'import sys,xml.etree.ElementTree as E; print(E.fromstring(sys.stdin.read()).find("string[@name=\'tapFacts\']").text or "")'], { input: adb('exec-out', 'su', '0', 'cat', `/data/data/${pkg}/shared_prefs/ownvoice-native.xml`), encoding: 'utf8' });
  assert.ok(facts.includes(`${rows[0].id}\tfalse\ttrue`), 'Native TapFact.inserted must confirm this same tap');
  assert.equal(saved['keep-replies'], undefined);
  assert.ok(!JSON.stringify(saved).includes(offText));
  await rebind(); await open('reads'); shot('records-off');
  assert.ok(nodes().some(n => n.text === 'Replies you inserted'));
  assert.ok(nodes().some(n => n.text === 'Suggestion · X'));
  const changeRetention = () => {
    const row = nodes().find(n => n.clickable && `${n.text} ${n.label}`.includes('Keep my replies to learn from'));
    assert.ok(row); nodes(row.label || row.text);
  };
  await motion('reply-text-opt-in', async () => { changeRetention(); await wait(3000); shot('retention-on'); });
  await fixture(); const onText = await insert();
  saved = database(); rows = JSON.parse(saved['reply-outcomes']);
  assert.equal(rows.length, 2); assert.equal(rows[1].text, onText); assert.equal(rows[0].text, undefined);
  assert.equal(saved['keep-replies'], 'true');
  await rebind(); await open('reads'); shot('records-on');
  assert.ok(nodes().some(n => n.text?.includes(onText)), 'Saved reply can be read through the app');
  database("CREATE TRIGGER deny_reply_record BEFORE INSERT ON storage WHEN NEW.key='reply-outcomes' BEGIN SELECT RAISE(ABORT, 'Phone storage refused this reply record'); END;");
  await rebind(); await fixture(); await insert();
  assert.ok(nodes().some(n => `${n.text} ${n.label}`.includes('Storage refused the save.')), 'The saving failure must show its readable cause');
  shot('record-write-refused');
  saved = database(); assert.deepEqual(JSON.parse(saved['reply-outcomes']), rows);
  database('DROP TRIGGER deny_reply_record;');
  await rebind(); await open('reads'); changeRetention(); await wait(1000);
  saved = database(); assert.equal(saved['keep-replies'], 'false');
  assert.ok(JSON.parse(saved['reply-outcomes']).every(row => !('text' in row)));
  await rebind(); await fixture();
  await motion('insert-yours-and-record', async () => {
    await insert(true);
    saved = database(); rows = JSON.parse(saved['reply-outcomes']);
    assert.equal(rows.length, 3); assert.equal(rows[2].card, 'yours');
    assert.equal(rows[2].level, 'Likely to be skipped'); assert.equal(rows[2].text, undefined);
    await rebind(); await open('reads'); shot('records-off-again');
  });
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ serial: process.env.ANDROID_SERIAL, off: true, on: true, earlierRecordsPreserved: true, network: 'SQLite-only imports; offline insertion and persistence' }, null, 2));
  console.log('PASS: native insert -> real SQLite -> UI read-back; text off/on/off; failed append preserves earlier records and insertion.');
  } finally {
    adb('shell', 'svc', 'wifi', wifi ? 'enable' : 'disable');
    adb('shell', 'svc', 'data', data ? 'enable' : 'disable');
  }
}
