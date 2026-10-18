import { askLocal } from '../core/localModel';
import { InferError, type InferState } from '@byokit/infer';
import { errorCode, message } from '../core/nano';
import { agreed, getReady, modelStatus, settle, watch } from '../core/phoneDownload';
import { words } from '../core/words';
import { canPolish, polishAcceptor, polishVersions } from '../core/polish';
import { acceptReplies, latestMessage, phoneReplyPrompt, phoneSlotPrompt, slotsFor } from '../core/drafts';
import { versionsList } from '../core/judge';
import { devlog, type Choice, type DraftRequest, type Writer, type WriterEvents } from '../core/writers';
// Demo fixture drafts live in their own module so normal bundles carry none of them: the
// constant-false branch drops the require (as app/agent.tsx drops the lab screen).
const demoStubs = process.env.EXPO_PUBLIC_DEMO_PLATFORM === '1' ? require('./demoStubs') as typeof import('./demoStubs') : null;

// Drafts on the phone (spec 5): replies fill three fixed slots from one numbered call,
// then one retry per empty slot; polish runs the C2 rewrite through the local model.
// `ponytail: if the local model returns fewer than 2 distinct drafts from the numbered call
// in at least half of the real-phone chats (spec §6 P3), switch to three slot calls from the start.

const FILL_MS = 8000;

async function ask(prompt: string, maxTokens: number): Promise<string> {
  return askLocal(prompt, maxTokens);
}

async function askPolish(prompt: string, maxTokens: number, run: number, callNo: number): Promise<string> {
  const kind = prompt.startsWith('Does the text below say') ? 'point-check'
    : prompt.includes('Their text came back unchanged') ? 'rewrite-again'
    : prompt.includes('Rewrite each row of THEIR text') ? 'layout-retry' : 'rewrite';
  const started = Date.now();
  try {
    const answer = await ask(prompt, maxTokens);
    devlog(`Ownvoice polish-call run=${run} n=${callNo} kind=${kind} ms=${Date.now() - started} chars=${answer.length}`);
    return answer;
  } catch (error) {
    devlog(`Ownvoice polish-call run=${run} n=${callNo} kind=${kind} ms=${Date.now() - started} error=${errorCode(error)}`);
    throw error;
  }
}

/** Polish and compose: the C2 rewrite, streamed as versions land, with layout kept and near-duplicates dropped. */
async function polish(request: DraftRequest, on: WriterEvents): Promise<Choice> {
  // A new post's one-line topic is asked too: the point check counts a line about a post as clear.
  // Its verdict is advisory: polishVersions still asks for versions; with none usable, only UNCLEAR keyboard mash is declined.
  const run = Date.now();
  let callNo = 0;
  devlog(`Ownvoice polish-run start=${run} chars=${request.typed.length}`);
  const outcome = await polishVersions((prompt, maxTokens) => askPolish(prompt, maxTokens, run, ++callNo), {
    typed: request.typed,
    conversation: request.conversation,
    guide: request.guide ?? '',
    dashes: request.dashes ?? 'remove',
    platform: request.platform,
    avoid: request.avoid ?? [],
    clear: () => canPolish(request.typed, prompt => ask(prompt, 8)).catch(error => {
      if (error instanceof Error && error.message === words.noVersions) return false;
      throw error;
    }),
  }, (text, slot, label) => {
    devlog(`Ownvoice polish-card run=${run} slot=${slot} accepted=1`);
    on.landed?.(text, slot, label);
  });
  devlog(`Ownvoice polish-result run=${run} calls=${callNo} cards=${outcome.drafts.length} declined=${!!outcome.declined}`);
  return outcome;
}

/** Replies: one numbered call, then one retry per empty slot within 8 s of its answer. */
async function replies(request: DraftRequest, on: WriterEvents, started: number): Promise<string[]> {
  const dashes = request.dashes ?? 'remove';
  const input = { latest: latestMessage(request.nodes, request.fieldTop), conversation: request.conversation, point: request.point, guide: request.guide, samples: request.samples, platform: request.platform };
  const slots = slotsFor(request.platform);
  const landed = on.landed ?? (() => {});
  const exclude = [...request.avoid ?? []];
  const controls = request.nodes?.filter(node => node.clickable).map(node => node.text) ?? [];
  const never = request.never ?? [];
  const made: (string | null)[] = [null, null, null];
  const take = (source: string, complete: boolean) => {
    // Match the acceptor's Markdown cleanup before looking for slot boundaries.
    source = source.replace(/\*\*/g, '');
    const markers = [...source.matchAll(/(?:^|\s)(?:draft|option|version)\s*([1-3])[.):]/gi)]
      .filter((marker, index, all) => index === 0 || marker[1] !== all[index - 1][1]);
    // Keep repeated same-slot headings with their bodies for the acceptor's cleanup.
    // The next distinct slot closes a streamed reply; the final answer closes the last.
    const closed = markers.flatMap((marker, index) => {
      const next = markers[index + 1];
      return next || complete ? [source.slice(marker.index, next?.index ?? source.length)] : [];
    });
    if (complete && !markers.length) closed.push(source);
    for (const card of closed) {
      acceptReplies([card], exclude, 3, dashes, controls, never, input.point ?? '', slots).forEach((text, slot) => {
        if (!text || made[slot]) return;
        made[slot] = text; exclude.push(text); landed(text, slot);
        if (exclude.length === (request.avoid?.length ?? 0) + 1) console.log(`Ownvoice first draft ms=${Date.now() - started}`);
      });
    }
  };
  const answer = await ask(phoneReplyPrompt(input), 220);
  take(answer, true);
  const fillStarted = Date.now();
  for (let slot = 0; slot < slots.length && Date.now() - fillStarted <= FILL_MS; slot++) {
    if (made[slot]) continue;
    try {
      const asked = phoneSlotPrompt(slots[slot], input, exclude);
      const [draft] = acceptReplies([await ask(asked, 120)], exclude, 1, dashes, controls, never, input.point ?? '', [slots[slot]]);
      if (draft) { exclude.push(draft); made[slot] = draft; landed(draft, slot); }
    } catch { /* one retry per slot; a failure leaves the slot empty */ }
  }
  return made.filter((text): text is string => !!text);
}

/** The phone writer's error as its plain line. */
export function failure(error: unknown): Error {
  if (error instanceof Error && error.message === words.readyStopped) return error;
  if (error instanceof InferError) {
    if (error.code === 'busy') return new Error(words.busy);
    if (error.code === 'no-space') return new Error(words.noSpace);
    if (error.code === 'unsupported') return new Error(words.unsupported);
    if (error.code === 'network') return new Error(words.offlineNoPhone);
    if (error.code === 'not-installed') return new Error(words.readyPanel);
  }
  return new Error(message(errorCode(error)));
}

/** Waits until the phone can write: refuses an unsupported phone or a download nobody agreed to, else joins or resumes the agreed one. */
export async function phoneReady(on: WriterEvents = {}): Promise<void> {
  let status: InferState;
  try { status = await modelStatus(); } catch (error) { throw failure(error); }
  if (status.phase === 'unsupported') throw new Error(words.unsupported);
  // The one-time download needs the person's yes, which only Ownvoice itself asks for.
  if ((status.phase === 'not-installed' || status.phase === 'failed') && !agreed()) throw new Error(words.readyPanel);
  if (status.phase === 'ready' || status.phase === 'busy' || status.phase === 'installed') return;
  on.state?.('downloading');
  const stop = watch(fraction => { if (fraction != null) on.fraction?.(fraction); });
  try { await (status.phase === 'not-installed' || status.phase === 'failed' ? getReady() : settle()); }
  catch (error) { throw failure(error); }
  finally { stop(); }
}

export const phoneWriter = {
  async write(request: DraftRequest, on: WriterEvents = {}): Promise<Choice> {
    if (process.env.EXPO_PUBLIC_E2E_STUB === '1') {
      // Grow-mode captures on the demo fixture get their own fixed drafts, keyed to the fixture post.
      const demo = !request.typed.trim() ? demoStubs?.demoDrafts(request.conversation) : null;
      if (demo) { demo.forEach((text, slot) => on.landed?.(text, slot)); return { drafts: demo }; }
      // A typed 'Quick update' comes back as it was, through the real acceptor: the already-minimal case.
      if (request.typed.startsWith('Quick update')) {
        const acceptor = await polishAcceptor(request.typed, request.dashes ?? 'remove', request.avoid ?? []);
        versionsList.slice(1).forEach((version, index) => acceptor.accept(request.typed, index + 1, version.label));
        if (acceptor.local != null) on.landed?.(acceptor.local, 0, versionsList[0].label);
        return { drafts: acceptor.results.map(result => result.text), unchanged: acceptor.unchanged };
      }
      // 'stock' in the typed text picks one deliberately stockier draft, so the e2e can show
      // the verdict line (cards differ) as well as the hidden shared note (cards agree).
      const drafts = request.typed.includes('multiline draft')
        ? ["Saturday works.\nI'll bring the stove.", 'Saturday is tricky for me. Could we do Sunday instead?', 'What time should I arrive?']
        : ['Yes, still on! I\'ll bring the stove.', 'Saturday is tricky for me. Could we do Sunday instead?', 'Should be. What time were you thinking?'];
      if (request.typed.trim()) {
        const acceptor = await polishAcceptor(request.typed, request.dashes ?? 'remove', request.avoid ?? []);
        if (acceptor.local != null) on.landed?.(acceptor.local, 0, versionsList[0].label);
        drafts.slice(1).forEach((text, index) => {
          const slot = index + 1;
          const accepted = acceptor.accept(text, slot, versionsList[slot].label);
          if (accepted != null) on.landed?.(accepted, slot, versionsList[slot].label);
        });
        return { drafts: acceptor.results.map(result => result.text), unchanged: acceptor.unchanged };
      }
      drafts.forEach((text, slot) => on.landed?.(text, slot));
      return { drafts };
    }
    const started = Date.now();
    await phoneReady(on);
    try {
      on.state?.('writing');
      return request.typed.trim()
        ? await polish(request, on)
        : { drafts: await replies(request, on, started) };
    } catch (error) {
      throw failure(error);
    }
  },
} satisfies Writer;
