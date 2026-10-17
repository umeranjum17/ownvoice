// The live-writer leg of the own-posts journey (done-done journey own-posts), driven from
// mobile/e2e/own-post.mjs when OWN_POST_WRITER=opencode or phone. The opencode writer is the real
// OpenCode Go plan gateway connected through the app's own connect field (ownvoice://source), exactly
// as a person would. The phone writer is the lab phone's own model, already got ready by the person
// (the driver never starts its download); it is chosen on the same screen. No stub text anywhere in
// this path. On a blank X-style composer the panel asks
// for the one line the post is about, then drafts from it. Every draft is checked: on topic, at
// most 280 characters, no placeholder, no "**", no assistant chatter, and no two drafts differing
// by one word. One draft is edited, inserted, and the composer is read back for exactly that text.
// Two cases run in each round: a realistic line and the longest line (near the X 280 cap).
// The key comes from OC_KEY and is never printed, logged or written; connect does not spend, each
// case spends one live generation.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const REALISTIC_LINE = 'shipped offline notes for my app this week';
export const LONGEST_LINE = 'shipped offline notes in the app this week, everything I write stays on the phone and syncs when I get home wifi, no account and no server and no tracking, which took two months of late nights to get right, and it is finally done and working today';
export const EDITED = 'Shipping offline notes, learned a lot.';

// Plain-language checks for one draft against the line the person typed. Pure and host-side.
const STOP = new Set(['this', 'that', 'with', 'from', 'have', 'they', 'your', 'about', 'into', 'over', 'when', 'what', 'will', 'just', 'like', 'them', 'then', 'than', 'been', 'were', 'some', 'more', 'most', 'only', 'also', 'very', 'much', 'many', 'does', 'done', 'make', 'made', 'here', 'there', 'where', 'which', 'while', 'after', 'before', 'because', 'would', 'could', 'should', 'their', 'other', 'same', 'both', 'each', 'between', 'everything', 'finally', 'working', 'today', 'nights', 'months']);
const words = text => (text.toLowerCase().match(/[a-z0-9']+/g) ?? []);
const content = text => words(text).filter(word => word.length >= 4 && !STOP.has(word));
const CHATTER = [/^here (are|is|'s)\b/, /\bas an ai\b/, /\bi'?d be happy\b/, /\bi hope this helps\b/, /\blet me know (if|your)\b/, /^sure[,!]/, /^certainly\b/, /^of course\b/, /^option \d/, /^draft \d/, /^version \d/, /^feel free\b/, /\bwould you like me\b/, /\bi can also\b/];
const PLACEHOLDER = /[[\]{}<>]|lorem ipsum|\bplaceholder\b|\bTODO\b|\bXXX+\b|your (text|post|topic|line) here|\binsert .* here\b/i;

/** The judgment of one draft: every way it can fail the bar, with the shared content words kept. */
export function checkDraft(line, draft) {
  const topic = new Set(content(line));
  const shared = [...new Set(content(draft))].filter(word => topic.has(word));
  return {
    chars: draft.length,
    within280: draft.length <= 280,
    shared,
    onTopic: shared.length >= 1,
    placeholder: PLACEHOLDER.test(draft),
    markdown: draft.includes('**'),
    chatter: CHATTER.find(pattern => pattern.test(draft.trim().toLowerCase()))?.source ?? null,
  };
}

/** True when two drafts are the same or differ in exactly one word: not meaningfully different. */
export function tooSimilar(a, b) {
  const one = words(a), two = words(b);
  if (one.join(' ') === two.join(' ')) return true;
  if (one.length !== two.length) return false;
  let diff = 0;
  for (let i = 0; i < one.length; i++) if (one[i] !== two[i]) diff++;
  return diff === 1;
}

/** The panel's draft card texts: long text nodes that are not the typed line, a heading, a note or
 *  a control. Ratings rows read out as labels, and card labels are short, so this keeps the drafts. */
export function draftTexts(list, line) {
  const skip = t => !t || t === line.trim()
    || /^(start|polish) your\b/.test(t) || /^pick one\b/.test(t) || /^write (one line|a line)\b/.test(t)
    || /^these are quick\b/.test(t) || /^sounds\b/.test(t) || /^no different version\b/.test(t)
    || /^read it over\b/.test(t) || /^couldn't\b/.test(t) || /^this text has\b/.test(t)
    || /^(shorter|cleaned up|main point first|yours|use this|copy|edit|why|why\?|write new ones|try again|cancel|insert)\b/.test(t)
    || /^(same meaning|check this|why this version|how it reads)\b/.test(t);
  const out = [];
  for (const node of list) {
    const text = (node.text ?? '').trim();
    if (text.length < 12 || skip(text.toLowerCase())) continue;
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

export async function proveOwnPostLive(ctx) {
  const { adb, nodes, bubble, wait, evidence, theme, out, fixturePkg, pkg, type, key, withNodes, composerText, screenText, center, rebind, rebindCycle, bound, phone } = ctx;
  const narrow = process.env.OWN_POST_NARROW === '1';
  const round = narrow ? 'narrow' : theme;
  const workspace = process.env.OPENCODE_WORKSPACE ?? 'Working2';
  const planKey = phone ? '' : (process.env.OC_KEY ?? '');
  if (!phone && planKey.length < 20) throw new Error('OC_KEY is not set to the OpenCode Go plan key.');
  const masked = text => (planKey ? String(text).replaceAll(planKey, '<key>') : String(text));
  mkdirSync(out, { recursive: true });
  const results = { writer: phone ? 'phone' : 'opencode', workspace: phone ? null : workspace, round, cases: [] };
  const shot = screen => {
    evidence('shot', 'ov-own-posts', screen, 'live', round);
    try { writeFileSync(resolve(out, `${screen}-live-${round}.nodes.json`), JSON.stringify(nodes(), null, 1)); } catch (error) { console.error(`nodes dump skipped: ${error.message}`); }
  };
  const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
  const swipeUp = async () => { adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300'); await wait(1200); };

  // The setup welcome ("Write replies that sound like you."). A fresh boot can leave the
  // keyguard up or a wedged MainActivity on top that redelivered intents never revive (run 8:
  // forty "delivered to currently running top-most instance" with no welcome), so: dismiss the
  // keyguard first, cold-start once with -S, and if the welcome still does not show, force-stop
  // and cold-start again mid-loop instead of redelivering forever. On failure the last screen
  // text, the focused app and a screenshot stay in the out dir, so the next diagnosis (run 8
  // saved none of these) does not fly blind.
  const openUntil = async (phrase, tries = 40) => {
    try { adb('shell', 'wm', 'dismiss-keyguard'); } catch { /* already unlocked or old API: the loop still tries */ }
    await wait(1000);
    adb('shell', 'am', 'start', '-S', '-n', `${pkg}/.MainActivity`);
    await wait(2500);
    for (let i = 0; i < tries; i++) {
      const seen = screenText();
      if (seen.includes(phrase.toLowerCase())) return;
      if (/isn't responding|not responding/i.test(seen)) { adb('shell', 'input', 'keyevent', '4'); await wait(2000); }
      else if (i % 10 === 9) {
        adb('shell', 'am', 'force-stop', pkg);
        await wait(1500);
        adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
        await wait(2500);
      } else {
        adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
        await wait(1500);
      }
    }
    const stuck = screenText();
    shot('setup-stuck');
    const focused = adb('shell', 'dumpsys', 'activity', 'activities').split('\n').filter(l => /mFocusedApp|mResumedActivity/.test(l)).join('\n').slice(0, 400);
    writeFileSync(resolve(out, `own-post-live-${round}-setup-stuck.json`), JSON.stringify({
      phrase, focused, screen: masked(stuck).slice(0, 500),
    }, null, 2));
    throw new Error(`The "${phrase}" screen never showed.`);
  };
  const findText = label => nodes().find(node => `${node.label} ${node.text}`.toLowerCase().includes(label.toLowerCase()));
  const waitText = async (labels, tries = 40) => {
    for (let i = 0; i < tries; i++) { const found = labels.map(findText).find(Boolean); if (found) return found; await wait(1000); }
    throw new Error(`Could not see "${labels.join('" or "')}" on screen: ${masked(nodes().map(n => n.text || n.label).filter(Boolean).join(' | ')).slice(0, 300)}`);
  };
  const tapText = async (label, tries = 20) => { const node = await waitText([label], tries); const point = center(node); adb('shell', 'input', 'tap', String(Math.round(point[0])), String(Math.round(point[1]))); };

  // Connect the real plan key through the app's own connect field: card, key field, Connect, the
  // kit's workspace pick when the key acts for several. The key is typed once and never read back.
  // A connect failure saves the panel text, the focused app and a screenshot (the narrow round
  // died on an empty node tree with no record of what the screen showed).
  const connectWriter = async () => {
    try {
      await (phone ? connectPhoneInner() : connectOpenCodeInner());
    } catch (error) {
      shot('connect-stuck');
      const focused = adb('shell', 'dumpsys', 'activity', 'activities').split('\n').filter(l => /mFocusedApp|mResumedActivity/.test(l)).join('\n').slice(0, 400);
      writeFileSync(resolve(out, `own-post-live-${round}-connect-stuck.json`), JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        focused, screen: masked(nodes().map(n => n.text || n.label).filter(Boolean).join(' | ')).slice(0, 2000),
      }, null, 2));
      throw error;
    }
  };
  const connectOpenCodeInner = async () => {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
    await waitText(['how ownvoice writes'], 30);
    for (let i = 0; i < 5 && !findText('with your opencode go'); i++) await swipeUp();
    await tapText('with your opencode go');
    const field = await waitText(['paste your opencode go key'], 30);
    const point = center(field); adb('shell', 'input', 'tap', String(Math.round(point[0])), String(Math.round(point[1])));
    for (let i = 0; i < 15 && !/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method')); i++) await wait(1000);
    adb('shell', 'input', 'text', `'${planKey}'`);
    if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) adb('shell', 'input', 'keyevent', '4');
    await wait(700);
    await tapText('connect', 20);
    const seen = await waitText(['more than one workspace', 'opencode go is connected', 'not accepted'], 40);
    const seenText = `${seen.label} ${seen.text}`.toLowerCase();
    if (seenText.includes('not accepted')) throw new Error('OpenCode Go rejected the key.');
    if (seenText.includes('more than one workspace')) {
      // The keyboard can cover the pick's list, and a cold emulator fetches it slowly; close the
      // keyboard once, then hunt the workspace with swipes for half a minute before giving up.
      if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(1200); }
      let pick = null;
      for (let i = 0; i < 20 && !pick; i++) {
        pick = nodes().find(node => (node.text || node.label || '').trim() === workspace);
        if (!pick) { if (i % 2) await swipeUp(); else await wait(1500); }
      }
      if (!pick) throw new Error(`The workspace pick shows no "${workspace}". On screen: ${masked(nodes().map(n => n.text || n.label).filter(Boolean).join(' | ')).slice(0, 400)}`);
      const pickPoint = center(pick); adb('shell', 'input', 'tap', String(Math.round(pickPoint[0])), String(Math.round(pickPoint[1])));
      await waitText(['opencode go is connected'], 60);
    }
    // Otherwise the seen node was the connected line itself; the screen may already have moved on,
    // so the connected node is not required to still be there.
  };

  // The phone's own writer: "On this phone" on the same chooser, and the phone must already show it is
  // ready to write (the person's one-time yes and download came first). The driver never answers the
  // ask or starts the download, so a phone that still asks for it stops here.
  const connectPhoneInner = async () => {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
    // The deep link opens the chooser under its row title ("How Ownvoice writes"); the ask's title is the other one.
    await waitText(['how ownvoice writes', 'how should ownvoice write'], 30);
    await tapText('on this phone');
    await wait(2000);
    // The accessible tree and the screenshot both carry the line; either one is enough.
    const readyShown = () => findText('ready. it writes right here') || /ready\.\s*it writes right here/.test(screenText());
    for (let i = 0; i < 150 && !readyShown(); i++) {
      if (findText('get this phone ready to write')) throw new Error('This phone still asks for its one-time download; the driver does not start it.');
      await wait(2000);
    }
    if (!readyShown()) {
      // Keep what the driver saw, so the next miss can be read from the record.
      writeFileSync(resolve(out, 'connect-nodes.json'), JSON.stringify(nodes(), null, 1));
      throw new Error('This phone never showed that it is ready to write.');
    }
    key(4);
    await wait(1500);
  };

  const clearComposer = async () => {
    adb('shell', 'am', 'force-stop', fixturePkg);
    await wait(1200);
    adb('shell', 'am', 'start', '-n', `${fixturePkg}/com.twitter.android.Composer`);
    await withNodes('the blank composer', list => list.some(n => n.className === 'android.widget.EditText' && n.editable), 25);
    if (!composerText()) return;
    key(123);
    key(67, 60);
    await wait(800);
    if (composerText()) throw new Error(`The fixture composer did not start empty (saw "${composerText()}").`);
  };

  // Tap the bubble on a blank composer; the panel must ask for the one line and draft nothing.
  const tapForAsk = async () => {
    const asked = () => nodes().some(n => /one line about what your post is about/i.test(n.text ?? ''));
    for (let attempt = 0; attempt < 3; attempt++) {
      bubble();
      await wait(2500);
      try { await withNodes('the ask', asked, 40); return; }
      catch { if (attempt === 2) throw new Error('The panel never asked for the one line on a blank composer.'); key(4); await wait(1500); }
    }
  };

  // Tap the bubble over the typed line; wait for the live drafts (>= 2 "Use this" cards). Opening the
  // panel can recreate the fixture activity and lose the line, so a retry re-types it; a "Try again"
  // the panel offers for a failed generation is tapped once and the wait goes on. Tall cards (the
  // longest case) push the lower card's buttons below the fold, where the tree has no "Use this"
  // to count — so the wait scrolls the sheet every tenth look (run 12 landed both versions yet
  // never saw the second button). On final failure the whole panel text and a screenshot stay in
  // the out dir.
  const tapForDrafts = async (line, id) => {
    const useThis = list => list.filter(n => /^Use this$/.test((n.text ?? '').trim())).length >= 2;
    const retype = async () => {
      adb('shell', 'am', 'force-stop', fixturePkg);
      await wait(1500);
      adb('shell', 'am', 'start', '-n', `${fixturePkg}/com.twitter.android.Composer`);
      await withNodes('the composer', list => list.some(n => n.className === 'android.widget.EditText' && n.editable), 15);
      type(line);
      await wait(1500);
      key(4);
      await wait(1200);
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await retype();
      bubble();
      await wait(2500);
      let tapped = false;
      for (let i = 0; i < 60; i++) {
        if (useThis(nodes())) return;
        const retry = nodes().find(n => /^Try again$/.test((n.text ?? '').trim()));
        if (retry && !tapped) { tapped = true; const p = center(retry); adb('shell', 'input', 'tap', String(Math.round(p[0])), String(Math.round(p[1]))); }
        if (i % 10 === 9) await swipeUp();
        await wait(3000);
      }
        if (attempt === 2) {
          const notes = nodes().map(n => (n.text ?? '').trim()).filter(Boolean);
          shot(`${id}-no-drafts`);
          writeFileSync(resolve(out, `own-post-live-${round}-${id}-no-drafts.json`), JSON.stringify({ line, screen: masked(notes.join(' | ')).slice(0, 2000) }, null, 2));
          throw new Error(`No live drafts arrived. On screen: ${masked(notes.join(' | ')).slice(0, 300)}`);
        }
    }
  };

  const runCase = async item => {
    await clearComposer();
    shot(`${item.id}-blank-composer`);
    await tapForAsk();
    shot(`${item.id}-ask`);
    key(4);
    await wait(1500);
    type(item.line);
    await wait(1500);
    if (composerText() !== item.line) throw new Error(`The composer did not take the ${item.id} line (saw "${composerText() || 'nothing'}").`);
    shot(`${item.id}-one-line`);
    await tapForDrafts(item.line, item.id);
    await wait(1500);
    const drafts = draftTexts(nodes(), item.line);
    if (drafts.length < 2 || drafts.length > 3) throw new Error(`Expected 2 or 3 drafts for ${item.id}, saw ${drafts.length}: ${JSON.stringify(drafts)}`);
    const checks = drafts.map(draft => ({ draft, ...checkDraft(item.line, draft) }));
    const problems = [];
    checks.forEach((check, i) => {
      if (!check.within280) problems.push(`draft ${i + 1} is ${check.chars} characters`);
      if (!check.onTopic) problems.push(`draft ${i + 1} is off topic (no shared words with the line)`);
      if (check.placeholder) problems.push(`draft ${i + 1} has a placeholder`);
      if (check.markdown) problems.push(`draft ${i + 1} has "**"`);
      if (check.chatter) problems.push(`draft ${i + 1} has assistant chatter (${check.chatter})`);
    });
    for (let i = 0; i < drafts.length; i++) for (let j = i + 1; j < drafts.length; j++) {
      if (tooSimilar(drafts[i], drafts[j])) problems.push(`drafts ${i + 1} and ${j + 1} differ by at most one word`);
    }
    shot(`${item.id}-drafts`);
    const record = { id: item.id, line: item.line, drafts, checks, problems, edited: EDITED };
    results.cases.push(record);
    writeFileSync(resolve(out, `own-post-live-${round}-${item.id}.json`), JSON.stringify(record, null, 2));
    if (problems.length) throw new Error(`The live drafts for ${item.id} failed the bar: ${problems.join('; ')}. Drafts: ${JSON.stringify(drafts)}`);

    // Edit the first draft: replace it with a fixed text, then insert exactly that.
    nodes('Edit');
    const editor = () => nodes().find(n => n.editable && n.windowType !== 4);
    await withNodes('the opened editor', list => list.some(n => n.editable && n.windowType !== 4), 15);
    // A live draft runs to the X cap (280), so select all and delete instead of a fixed DEL count;
    // the DEL walk stays as the fallback for a keyboard that drops the key combination.
    adb('shell', 'input', 'keycombination', '113', '29');
    await wait(400);
    key(67);
    await wait(600);
    if ((editor()?.text ?? '').length > 0) { key(67, 320); await wait(600); }
    type(EDITED);
    await wait(1200);
    shot(`${item.id}-edited`);
    const edited = editor();
    if (edited?.text !== EDITED) throw new Error(`The edit did not take (saw "${edited?.text}").`);
    // The keyboard covers the card's controls once the editor grows, so drop it before the insert;
    // the click retries while the sheet settles.
    key(4);
    await wait(1000);
    let used = false;
    for (let i = 0; i < 3 && !used; i++) { try { nodes('Use this'); used = true; } catch { await wait(1500); } }
    if (!used) throw new Error('The Use this control never took the insert click.');
    await wait(4000);
    if (nodes().some(n => /^(Polish your post|Start your post)/.test((n.text ?? '').trim()))) { key(4); await wait(2000); }
    shot(`${item.id}-inserted`);
    if (composerText() !== EDITED) throw new Error(`The composer does not hold the inserted text (saw "${composerText() || 'nothing'}").`);
    if (!/insert result ok=true/.test(adb('logcat', '-d', '-s', 'OwnvoiceNative:I'))) throw new Error('The native module did not confirm the insertion.');
    record.inserted = EDITED;
    record.readBack = composerText();
    shot(`${item.id}-read-back`);
    return record;
  };

  // Setup finished with no writer (Back on the welcome), then the real key connected on the writer
  // screen; the bubble needs the service, which is bound only now so the setup walk stays first-run.
  // The phone keeps its setup as the person left it; the OpenCode leg starts from a first install.
  if (!phone) {
    await openUntil('sound like you');
    key(4);
    await wait(2500);
  }
  await connectWriter();
  await rebind();
  // A process restart around the connect eats the first bind (the setting changed only before the
  // death, and Android does not rebind until the setting changes again): fresh off/on cycles.
  for (let i = 0; i < 3 && !bound(); i++) { await rebindCycle(); await wait(3000); }
  await withNodes('the Ownvoice service to bind after connecting the writer', () => bound(), 15);

  const light = process.env.OWN_POST_NARROW === '1' ? false : theme === 'light';
  // Steer: the longest case reruns alone while its single-card panel is diagnosed.
  const only = process.env.OWN_POST_CASE ?? '';
  const cases = [{ id: 'oneline', line: REALISTIC_LINE }, { id: 'longest', line: LONGEST_LINE }]
    .filter(item => !only || item.id === only);
  if (only && !cases.length) throw new Error(`Unknown OWN_POST_CASE "${only}".`);
  for (const item of cases) {
    if (light && item.id === 'oneline') evidence('motion-start', 'ov-own-posts', 'edit-and-insert-live');
    try { await runCase(item); }
    finally { if (light && item.id === 'oneline') evidence('motion-stop'); }
  }
  writeFileSync(resolve(out, `own-post-live-${round}.json`), JSON.stringify(results, null, 2));
  console.log(`own-post live (${round}): ${results.cases.map(c => `${c.id} ${c.drafts.length} drafts ok`).join('; ')}. Saved to ${out}.`);
}
