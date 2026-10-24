import { useEffect, useRef, useState } from 'react';
import { Share, Text, TextInput, View } from 'react-native';
import { classify } from '@byokit/accounts';
import Native from '../../modules/ownvoice-native';
import { askLocal } from '../core/localModel';
import { streamNotesPost, streamSelectionRewrite } from '../chatgpt/responses';
import { cloudConsent, fitBackends } from '../chatgpt/settings';
import * as Judge from '../core/judge';
import * as Slop from '../core/slop';
import * as Voice from '../core/voice';
import { loadVoice } from '../core/voiceStore';
import { phoneCanWrite } from '../core/phoneStatus';
import { failure, phoneReady } from '../panel/phoneWriter';
import { cloudOf, getSource, SOURCE_KEY, type CloudKey, type Source } from '../core/source';
import { store } from '../core/store';
import { AccountRefused, causeOf, cloudWords, devlog, isOtherWriterLine, PlanLimit, SendVeto, type WriterEvents } from '../core/writers';
import { words } from '../core/words';
import { dashesFor, preserveFragment, cleanSelection } from '../core/drafts';
import { notesPosts } from '../core/notesPosts';
import { platformForApp, type Platform } from '../core/platforms';
import { rate, type Ratings as CardRatings } from '../core/ratings';
import { abstain, judgeFit, rated, type Fit } from '../grow/fit';
import { phoneFit } from '../grow/phoneFit';
import { fixedSentenceSplits } from '../core/typing';
import { speller } from '../core/speller';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Choices } from '../ui/Choices';
import { Empty } from '../ui/Empty';
import { FitBar, fitBarVisible, fitHidesEngagement } from '../ui/FitBar';
import { Marked } from '../ui/Marked';
import { MeaningLine } from '../ui/MeaningLine';
import { Placeholder } from '../ui/Placeholder';
import { Ratings } from '../ui/Ratings';
import { Sheet } from '../ui/Sheet';
import { VerdictLine } from '../ui/VerdictLine';
import { shape, space, type, useTheme } from '../ui/theme';

/** Deterministic stand-ins for the e2e build (EXPO_PUBLIC_E2E_STUB); never wired into a normal build. */
function stubRewrite(text: string, how: Judge.Rewrite): string {
  if (text.includes('!!')) return `${text.replace('!!', '')} by Friday at 7:30`; // the e2e new-number case
  if (how === Judge.Rewrite.TIGHTEN) return text.split(/(?<=[.!?]) /)[0] ?? text;
  if (how === Judge.Rewrite.PLAINER) {
    const plain = text.replace(/\b(?:i think|just|really|very|actually)\s+/gi, '');
    return plain.charAt(0).toUpperCase() + plain.slice(1);
  }
  return text.replace(/\bi\b/g, 'I').replace(/\s+([,.!?])/g, '$1');
}

type Post = { text: string; label: string; slot: number; ratings: CardRatings | null };

/** The place posts from notes are for: the feed app the text came from, else X. */
function placeOf(app?: string | null): Platform {
  const found = platformForApp(app);
  return found.kind === 'feed' && found.id !== 'default' ? found : platformForApp('com.twitter.android');
}

/** Rewrites selected text from the selection menu or a share, with no accessibility needed (R1–R5),
 *  or turns raw notes into three posts for the place they came from. */
export default function Rewrite() {
  const t = useTheme();
  const [input, setInput] = useState<{ text: string; editable: boolean; app?: string | null } | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; meaning: Judge.Check | null; scores: Judge.Scores; verdict: Judge.Verdict | null } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Posts from notes: three cards that land one by one, the one being edited, and each post's fit.
  const [posts, setPosts] = useState<(Post | null)[] | null>(null);
  const [edit, setEdit] = useState<{ slot: number; text: string } | null>(null);
  const [fits, setFits] = useState<Map<string, Fit>>(new Map());
  const run = useRef(0); // a newer tap drops the earlier answer, as JudgeActivity's job cancel does
  const rules = useRef(loadVoice()).current;
  const place = placeOf(input?.app);
  const postsChoice = words.postsFor.replace('{name}', place.label);

  useEffect(() => {
    const value = Native.rewriteInput();
    setInput(value);
    setNote(value?.text.trim() ? "Pick how you'd like it. You'll see it before anything changes." : 'Select some text first, then choose Ownvoice.');
  }, []);

  /** The consent the cloud rewrite sends under: the chosen source plus the panel's full guard set (sign-in, pause, switch, never mid-sign-out); the sheet works in any app, so no per-app row applies. */
  const cloud = (): CloudKey | null => cloudOf(store.peek<Source>(SOURCE_KEY));
  const consent = (key: CloudKey): WriterEvents => {
    const guards = cloudConsent(key, null);
    return {
      beforeSend: async () => cloud() === key && await guards.beforeSend(),
      beforeFetch: () => cloud() === key && guards.beforeFetch(),
    };
  };

  /** One writing job on the chosen writer. A cloud failure falls back to this phone when it can write, and says
   *  so in the cloud's own plain line; `show` puts the result up and says whether anything usable showed. */
  const write = async <T,>(id: number, local: boolean, phone: () => Promise<T>, cloudJob: (key: CloudKey) => Promise<T>, show: (value: T, canWrite: boolean, byPhone: boolean) => Promise<boolean>) => {
    try {
      const source = await getSource().catch(() => null);
      const canWrite = await phoneCanWrite() !== 'cant';
      const key = cloudOf(source);
      if (local || key === null) {
        await show(await phone(), canWrite, true);
        return;
      }
      const lines = cloudWords(key);
      try {
        await show(await cloudJob(key), canWrite, false);
      } catch (error) {
        if (id !== run.current) return;
        const veto = error instanceof SendVeto ? error.message : null;
        const offline = classify(error instanceof Error ? error.message : String(error))?.kind === 'network';
        const limit = error instanceof PlanLimit ? error.message : null;
        // A plan limit is not a transient slip: say the limit and its reset rather than retrying.
        if (limit) { setNote(limit); return; }
        // The cloud failure's own plain line, whatever the phone then says: the phone's own
        // error (for example "get this phone ready") must never mask the selected writer's.
        // A veto stays the switch-off line, as when the phone cannot write at all below.
        // A refused account says so, by name, with what to do next.
        const refused = error instanceof AccountRefused ? error.message : null;
        const cloudLine = veto ? lines.offNoPhone : (offline ? words.offlineNoPhone : refused ?? lines.failedNoPhone);
        if (canWrite) {
          let shown = false;
          try { shown = await show(await phone(), true, true); }
          catch (fallback) {
            if (id !== run.current) return;
            const cause = causeOf(error);
            const phoneCause = fallback instanceof Error ? fallback.message : String(fallback);
            devlog(`Ownvoice cloud rewrite failed: ${cause} (phone fallback: ${phoneCause})`);
            setNote(cloudLine); return;
          }
          if (!shown || id !== run.current) return;
          setNote(veto ?? (offline ? words.offlinePhone : refused ?? lines.fallback));
          return;
        }
        setNote(cloudLine);
      }
    } catch (error) {
      if (id !== run.current) return;
      // Only the phone path throws here, already in its plain line.
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      if (id === run.current) setBusy(false);
    }
  };

  const rewrite = async (how: Judge.Rewrite) => {
    if (!input?.text.trim()) return;
    const id = ++run.current;
    setChoice(how);
    setBusy(true);
    setResult(null);
    setPosts(null);
    setEdit(null);
    setNote(words.writing);
    const stub = process.env.EXPO_PUBLIC_E2E_STUB === '1' ? stubRewrite(input.text, how) : null;
    const guide = Voice.guide(rules, false);
    const finish = async (raw: string) => {
      const spell = await speller().catch(() => null);
      const text = fixedSentenceSplits(input.text, cleanSelection(input.text, Judge.clean(raw)), spell);
      return how === Judge.Rewrite.GRAMMAR ? preserveFragment(input.text, text) : text;
    };
    // The phone path waits for the phone writer as the panel does; a model failure keeps its cause in logcat.
    const phoneRewrite = async () => {
      if (stub !== null) return finish(stub);
      await phoneReady();
      const raw = await askLocal(Judge.selectionRewritePrompt(input.text, how, guide), 256).catch((error: unknown) => {
        devlog(`Ownvoice phone rewrite failed: ${causeOf(error)}`);
        throw failure(error);
      });
      return finish(raw);
    };
    // The meaning check stays on the phone when it can write; otherwise only the number check runs.
    const showResult = async (text: string, canWrite: boolean) => {
      if (id !== run.current) return false;
      if (!text) { setNote("Couldn't rewrite that. Try again."); return false; }
      setNote(input!.editable ? "Replace puts it in the field. If not, it's copied for you to paste." : 'Copy it, then paste it where you like.');
      setResult({ text, meaning: Judge.meaning(input.text, text, null), scores: Judge.scoreDraft(text, null, true, rules), verdict: null });
      setBusy(false);
      const answer = stub === null && canWrite ? await askLocal(Judge.rewriteCheckPrompt(input.text, text), 80).catch(() => null) : null;
      if (id !== run.current) return false;
      const scores = Judge.scoreDraft(text, answer, true, rules);
      setResult({ text, meaning: Judge.meaning(input.text, text, answer), scores, verdict: answer && scores.generic !== null && scores.specific !== null ? Judge.verdict(scores) : null });
      return true;
    };
    await write(id, stub !== null, phoneRewrite, async key => finish(await streamSelectionRewrite(key, input.text, how, guide, consent(key))), showResult);
  };

  /** Three posts from the notes, one per angle, in their voice for this place; each lands as soon as it passes the checks. */
  const makePosts = async () => {
    if (!input?.text.trim()) return;
    const id = ++run.current;
    setChoice(postsChoice);
    setBusy(true);
    setResult(null);
    setPosts([null, null, null]);
    setEdit(null);
    setFits(new Map());
    setNote(words.writing);
    // One selection per run: the writer's guide line and the fit call share these samples.
    const picked = Voice.selectedGuide(rules, true);
    const request = { notes: input.text, guide: picked.line, platform: place, never: rules.never, dashes: dashesFor(rules, input.text) };
    const landed = (text: string, slot: number, label: string) => {
      if (id !== run.current) return;
      setPosts(prev => { const next = [...prev ?? [null, null, null]]; next[slot] = { text, label, slot, ratings: rate(text, place, null, rules) }; return next; });
    };
    const phonePosts = async () => {
      await phoneReady();
      return notesPosts(askLocal, request, landed).catch((error: unknown) => {
        devlog(`Ownvoice phone posts failed: ${causeOf(error)}`);
        throw failure(error);
      });
    };
    // The fit rates the shown posts once, on the writer that wrote them, as for a new post in the panel.
    const showPosts = async (made: string[], canWrite: boolean, byPhone: boolean) => {
      if (id !== run.current) return false;
      if (!made.length) { setNote(words.postsNone); return false; }
      setNote(input!.editable ? words.postsReplace : words.postsCopy);
      setBusy(false);
      if (!rated(place, 'post')) return true;
      const backends = byPhone ? (canWrite ? [phoneFit()] : []) : fitBackends(null);
      const found = await judgeFit({ post: '', candidates: made, platform: place, samples: picked.samples, backends, voice: !byPhone, kind: 'post' }).catch(() => made.map(abstain));
      if (id === run.current) setFits(new Map(made.map((text, i) => [text, found[i].level == null && byPhone ? { ...found[i], onPhone: true } : found[i]])));
      return true;
    };
    await write(id, false, phonePosts, key => notesPosts(prompt => streamNotesPost(key, prompt, consent(key)), request, landed), showPosts);
  };

  const exportBlocked = result?.meaning?.ok === false;
  /** A plan limit is not stuck: leave for the writer list so the person can pick another writer. */
  const openSource = () => { void Native.openRoute('ownvoice://source').catch(() => {}).finally(() => { void Native.finishRewrite(null, false).catch(() => {}); }); };
  const enabled = !!input?.text.trim();
  const shownPosts = posts?.filter((post): post is Post => !!post) ?? [];
  // The phone writer gave no level on a post that shows no bar: one line for the set says why, as in the panel.
  const phoneUnsure = shownPosts.some(post => fits.get(post.text)?.onPhone && !fitBarVisible(fits.get(post.text), post.ratings));
  return <Sheet title="Make it better" note={enabled ? note : undefined} mood={enabled ? (busy ? 'thinking' : result || shownPosts.length ? 'ready' : 'idle') : undefined} onClose={() => { void Native.finishRewrite(null, false); }}>
    {!enabled ? (input ? <Empty mood="check" text={note} /> : null) : <>
      <Card variant="filled" label="You selected"><Marked text={input!.text} hits={Slop.hits(input!.text, rules)} /></Card>
      <View style={{ marginVertical: space.m }}>
        <Choices options={[...Object.values(Judge.Rewrite), postsChoice]} value={choice} onPick={how => { void (how === postsChoice ? makePosts() : rewrite(how as Judge.Rewrite)); }} />
      </View>
      {isOtherWriterLine(note) ?<View style={{ marginBottom: space.m }}><Button kind="filled" label={words.claudeChooseWriter} onPress={openSource} /></View> : null}
      {busy && !posts ? <Placeholder /> : null}
      {result ? <>
        <Card variant="outlined" label={choice ?? undefined}>
          <Marked text={result.text} hits={result.scores.hits} />
          <MeaningLine check={result.meaning} same="Same meaning as yours" />
          <VerdictLine verdict={result.verdict} />
          <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.m }}>
            {input!.editable && <Button kind="filled" label="Replace" disabled={exportBlocked} onPress={() => { if (exportBlocked) return; void Native.finishRewrite(result.text, true); }} />}
            <Button kind={input!.editable ? 'text' : 'filled'} label="Copy" disabled={exportBlocked} onPress={() => { if (exportBlocked) return; void Native.finishRewrite(result.text, false); }} />
            <Button kind="text" label={words.shareText} disabled={exportBlocked} onPress={() => { if (exportBlocked) return; void Share.share({ message: result.text }).catch(() => {}); }} />
          </View>
        </Card>
      </> : null}
      {posts?.map((post, i) => {
        if (!post) return busy ? <View key={`empty-${i}`} style={{ marginBottom: space.m }}><Placeholder /></View> : null;
        const editing = edit?.slot === post.slot ? edit : null;
        // While editing, the text is unrated: no fit, no bar, and the rating rows follow the edit.
        const fit = editing ? undefined : fits.get(post.text);
        const text = editing ? editing.text : post.text;
        return <View key={post.slot} style={{ marginBottom: space.m }}>
          <Card variant="outlined" label={post.label}>
            {editing
              ? <TextInput accessibilityLabel={words.editField} multiline autoFocus value={editing.text} onChangeText={value => setEdit({ slot: post.slot, text: value })}
                style={[type.body, { color: t.text, backgroundColor: t.raised, borderRadius: shape.card, paddingHorizontal: space.l, paddingVertical: space.m, minHeight: 88, textAlignVertical: 'top' }]} />
              : <Marked text={post.text} hits={Slop.hits(post.text, rules, true)} />}
            <Ratings ratings={editing ? rate(editing.text, place, null, rules) : post.ratings} fit={fit} showClear hideEngagement={!editing && fitHidesEngagement(fit, post.ratings)} />
            {editing ? null : <FitBar fit={fit} ratings={post.ratings} />}
            <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.m }}>
              {input!.editable && <Button kind="filled" label="Replace" disabled={!text.trim()} onPress={() => { void Native.finishRewrite(text, true); }} />}
              <Button kind={input!.editable ? 'text' : 'filled'} label="Copy" disabled={!text.trim()} onPress={() => { void Native.finishRewrite(text, false); }} />
              {editing
                ? <Button kind="text" label={words.cancel} onPress={() => setEdit(null)} />
                : <Button kind="text" label={words.edit} onPress={() => setEdit({ slot: post.slot, text: post.text })} />}
            </View>
          </Card>
        </View>;
      })}
      {phoneUnsure ? <View style={{ marginBottom: space.m }}>
        <Text style={[type.note, { color: t.muted }]}>{words.fitNeedsOnline}</Text>
        <Button kind="text" label={words.claudeChooseWriter} onPress={openSource} />
      </View> : null}
    </>}
  </Sheet>;
}
