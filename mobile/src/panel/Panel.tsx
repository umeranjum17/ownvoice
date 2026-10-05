import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import Native, { type Capture } from '../../modules/ownvoice-native';
import * as Judge from '../core/judge';
import * as Typing from '../core/typing';
import { speller } from '../core/speller';
import { dashesFor } from '../core/drafts';
import { DEFAULT_PLATFORM, platformForApp, type Platform } from '../core/platforms';
import { prefillFor, prefillUrl } from '../core/prefill';
import { feedRead } from '../core/feed';
import { rate, type Ratings as CardRatings } from '../core/ratings';
import { fitBackends, gptRoute } from '../chatgpt/settings';
import { judgeFit, rated, UNAVAILABLE, type Fit } from '../grow/fit';
import { guide as voiceGuide } from '../core/voice';
import { loadVoice } from '../core/voiceStore';
import { words } from '../core/words';
import type { Check, Scores, Verdict } from '../core/judge';
import { retryLines, type Writer, type WriterRoute } from '../core/writers';
import { Button, IconButton } from '../ui/Button';
import { Card } from '../ui/Card';
import { Empty } from '../ui/Empty';
import { CheckIcon, ChevIcon, CopyIcon, OpenIcon, ShareIcon } from '../ui/icons';
import { MeaningLine } from '../ui/MeaningLine';
import { Marked } from '../ui/Marked';
import { Placeholder } from '../ui/Placeholder';
import { Progress } from '../ui/Progress';
import { Ratings } from '../ui/Ratings';
import { ReasonRow } from '../ui/ReasonRow';
import { Sheet } from '../ui/Sheet';
import { VerdictLine } from '../ui/VerdictLine';
import { shape, space, type, useReducedMotion, useTheme } from '../ui/theme';
import { phoneCanWrite } from '../core/phoneStatus';
import { phoneWriter } from './phoneWriter';

type Mode = 'reply' | 'polish' | 'compose' | 'empty' | 'grow';

/** What each reply card is for, in the order the writers fill that app's slots (platforms.ts). */
const TAGS: Record<string, [string, string, string]> = {
  x: [words.tagAgree, words.tagPushBack, words.tagQuestion],
  linkedin: [words.tagAgree, words.tagOtherView, words.tagFollowUp],
  reddit: [words.tagAnswer, words.tagDisagree, words.tagDetail],
  slack: [words.tagConfirm, words.tagBlocker, words.tagUnclear],
  gmail: [words.tagAccept, words.replyNo, words.replyAsk],
};
const CHAT_TAGS: [string, string, string] = [words.replyYes, words.replyNo, words.replyAsk];
type Phase = 'loading' | 'writing' | 'ready' | 'failed';
type Draft = { text: string; label?: string; slot: number; scores: Scores; meaning: Check | null; ratings: CardRatings | null };
type WhyState = { state: 'running' | 'none' | 'done'; meaning: Check | null };

/** Lines only Ownvoice itself can fix (choosing a writer, signing in, the phone's one-time download): the panel offers to open it. */
const opensApp: Set<string> = new Set([words.needWriterPanel, words.needWriterNote, words.phoneOnlyCant, words.readyPanel]);
const openOwnvoice = () => { void Linking.openURL('ownvoice://').catch(() => {}).finally(() => { void Native.closePanel().catch(() => {}); }); };

/** Prefill hand-off: the app's own compose opens with this text, or the share
 *  sheet when it has no compose link; either way the person presses Send. */
const openPrefill = (platform: Platform, draft: Draft) => {
  if (draft.meaning?.ok === false) return;
  const text = draft.text;
  const url = prefillUrl(prefillFor(platform).dest, text);
  if (url) void Linking.openURL(url).catch(() => { void Share.share({ message: text }).catch(() => {}); });
  else void Share.share({ message: text }).catch(() => {});
};

const namesPlatform = (platform: Platform) => platform.id === 'x' || platform.id === 'reddit';

/** Their reply typed under a post on X or Reddit (the places the fit can rate) grows: their own text stays as Yours
 *  and the replies, started from their point, are ranked for that place. With nothing typed the reply stays withheld. */
const modeOf = (typed: string, written: string, platform: Platform): Mode =>
  typed.trim() ? (Judge.replying(written) ? (namesPlatform(platform) ? 'grow' : 'polish') : 'compose') : Judge.replying(written) ? 'reply' : 'empty';

/** The pulsing "Checking…" row while the model checks run; still when motion is reduced. */
function Checking() {
  const t = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced !== false) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return <Animated.Text style={[type.note, { color: t.muted, paddingVertical: space.s, opacity: pulse }]}>{words.checking}</Animated.Text>;
}

/** A card's verdict line, shown only when the cards differ: one note shared by every card tells the person nothing. */
function distinctVerdict(card: Draft, cards: Draft[]): Verdict | null {
  const signature = (item: Draft) => {
    const value = Judge.verdict(item.scores);
    return value ? `${value.good}:${value.lead}:${value.rest}` : 'unchecked';
  };
  return new Set(cards.map(signature)).size > 1 ? Judge.verdict(card.scores) : null;
}

/** One plain tone word under a card's text ("Sounds friendly"), once the writer names it on tap; nothing until then. */
function ToneLine({ text, tones }: { text: string; tones: Map<string, string> }) {
  const t = useTheme();
  const tone = tones.get(text);
  if (!tone) return null;
  return <Text style={[type.note, { color: t.muted, marginTop: space.s }]}>{words.toneSounds} {tone}</Text>;
}

function WhyCover({ draft, checks, who, slips }: { draft: Draft; checks: WhyState; who: string | null; slips: number }) {
  const t = useTheme();
  const rows = [
    ...Judge.reasons(draft.scores, draft.text, slips),
    ...(draft.label && checks.meaning ? [{ ok: checks.meaning.ok, name: checks.meaning.ok ? 'Same meaning' : 'Check this', detail: checks.meaning.ok ? undefined : checks.meaning.reason }] : []),
  ];
  return <View>
    <View style={[styles.quote, { backgroundColor: t.raised }]}>
      <View style={[styles.quoteBar, { backgroundColor: t.primary }]} />
      <View style={{ flex: 1 }}><Marked text={draft.text} hits={draft.scores.hits} /></View>
    </View>
    <Text style={[type.label, { color: t.primary, marginTop: space.xl, marginBottom: space.s }]}>{words.howItReads}</Text>
    <Card variant="outlined">
      {rows.map((row, i) => <ReasonRow key={i} {...row} />)}
      {checks.state === 'running' ? <Checking /> : null}
      {checks.state === 'none' ? <Text style={[type.note, { color: t.muted, paddingVertical: space.s }]}>{words.noChecks}</Text> : null}
    </Card>
    <Text style={[type.note, { color: t.muted, marginTop: space.l, marginBottom: space.l }]}>{Judge.quickChecks(who)}</Text>
  </View>;
}

export default function Panel({ writer, select = gptRoute }: { writer?: Writer; select?: (app: string) => Promise<WriterRoute> } = {}) {
  const t = useTheme();
  const [capture, setCapture] = useState<Capture | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [note, setNote] = useState<string | null>(null);
  const [fraction, setFraction] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [yours, setYours] = useState<Draft | null>(null);
  const [unchanged, setUnchanged] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [cards, setCards] = useState<(Draft | null)[]>([null, null, null]);
  const [why, setWhy] = useState<number | null>(null);
  const [whys, setWhys] = useState<Map<string, WhyState>>(new Map());
  const [tones, setTones] = useState<Map<string, string>>(new Map());
  const toneFor = useRef(0);
  // Jev's fit per shown text, asked once per tap after the cards land; only when the writer's text left the phone.
  const [fits, setFits] = useState<Map<string, Fit>>(new Map());
  const fitFor = useRef(0);
  const leaves = useRef(false);
  const [spelling, setSpelling] = useState<{ text: string; slips: Typing.Slip[] }>({ text: '', slips: [] });
  const slips = yours?.text === spelling.text ? spelling.slips : [];
  // The text just copied: its card's copy button shows a tick for a moment.
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  const copy = (draft: Draft) => {
    if (draft.meaning?.ok === false) return;
    const text = draft.text;
    void Native.copy(text).then(() => {
      setCopied(text);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 1600);
    }).catch(() => {});
  };
  const run = useRef(0);
  const startedTap = useRef<string | null>(null);
  const inserting = useRef(false);
  const [insertBusy, setInsertBusy] = useState(false);
  const kind = useRef<{ message: boolean } | null>(null);
  const platformOf = useRef<Platform>(DEFAULT_PLATFORM);
  const postOf = useRef<string | null>(null);
  // The card being edited and its current text; Insert uses this text, Cancel drops it.
  const [edit, setEdit] = useState<{ slot: number; text: string } | null>(null);
  const voice = useRef(loadVoice());

  const shown = cards.filter((card): card is Draft => !!card);

  // With "Check my spelling as I type" on, the tap also lists what to check in what they typed, each with its own Fix.
  const findSlips = useCallback(async (text: string, id: number) => {
    try {
      if (!text || !await Native.typingCheck()) {
        if (run.current === id) setSpelling({ text, slips: [] });
        return;
      }
      const spell = await speller().catch(() => null);
      const found = Typing.slips(text, spell);
      // One word at a time, giving the screen a turn in between: an unusual word can take a moment.
      for (const slip of found) if (spell && slip.fix === undefined && slip.reason === Typing.SPELLING) {
        await new Promise(resolve => setTimeout(resolve, 0));
        slip.fix = Typing.suggestion(text.slice(slip.start, slip.end), spell);
      }
      if (run.current === id) setSpelling({ text, slips: found });
    } catch {}
  }, []);

  const start = useCallback((value: Capture, avoid?: string[]) => {
    const id = ++run.current;
    const rules = voice.current = loadVoice();
    const platform = platformForApp(value.app, value.nodes);
    const nextMode = modeOf(value.typed, value.written, platform);
    const typed = value.typed.trim();
    const grow = nextMode === 'grow';
    const post = nextMode === 'compose';
    const publicScreen = post || namesPlatform(platform);
    const person = Judge.who(value.written);
    platformOf.current = platform;
    setMode(nextMode);
    setCards([null, null, null]);
    setYours(null);
    setTones(new Map());
    toneFor.current = 0;
    setFits(new Map());
    fitFor.current = 0;
    leaves.current = false;
    setUnchanged(false);
    setDeclined(false);
    setReason(null);
    setFraction(null);
    setWhy(null);
    setWhys(new Map());
    setEdit(null);
    kind.current = null;
    void findSlips(typed, id);
    if (nextMode === 'empty') {
      setNote(null); setPhase('ready'); return;
    }
    // Neither writer has a qualified grounding check for replies from screen text.
    // Stop before routing: no streamed card, retry, fallback or outward request.
    if (nextMode === 'reply') {
      setNote(words.replyWithheld); setPhase('failed'); return;
    }
    setNote(words.writing);
    setPhase('writing');
    // What the reply answers: the post block when the layout shows one, else the screen text the
    // writer drafts from; '' only when nothing was read. A new post has no parent to compare with.
    const shownPost = postOf.current = post ? null : feedRead(value.nodes, value.fieldTop).post || value.conversation.trim();
    setYours({ text: typed, slot: -1, scores: Judge.scoreDraft(typed, null, !publicScreen, rules, post, person, platform), meaning: null, ratings: rate(typed, platform, shownPost, rules) });
    void (async () => {
      let path: WriterRoute;
      try { path = writer ? { writer, note: null } : await select(value.app); }
      catch { path = { writer: phoneWriter, note: words.phoneWrote }; }
      if (run.current !== id) return;
      leaves.current = path.writer !== phoneWriter;
      let sent = false;

      try {
        const choice = await path.writer.write({
          conversation: value.conversation,
          written: value.written,
          nodes: value.nodes,
          fieldTop: value.fieldTop ?? undefined,
          // Grow writes replies that start from their point; polish rewrites what they typed.
          typed: grow ? '' : typed,
          point: grow ? typed : undefined,
          platform,
          guide: voiceGuide(rules, post),
          dashes: dashesFor(rules, value.typed),
          avoid,
        }, {
          sent: async () => { if (!sent) { await Native.markTapSent(value.id); sent = true; } },
          unsent: async () => { if (sent && startedTap.current !== value.id) { await Native.unmarkTapSent(value.id); sent = false; } },
          started: () => { startedTap.current = value.id; },
          state: state => {
            if (run.current !== id) return;
            setNote(state === 'downloading' ? words.gettingReady : words.writing);
            if (state === 'writing') setFraction(null);
          },
          fraction: value2 => { if (run.current === id) setFraction(value2); },
          reset: () => { if (run.current === id) { setCards([null, null, null]); setWhy(null); } },
          landed: (text, slot, label) => {
            if (run.current !== id) return;
            const scores = Judge.scoreDraft(text, null, !publicScreen, rules, post, person, platform);
            const meaning = label ? Judge.meaning(value.typed, text, null) : null;
            const ratings = rate(text, platform, shownPost, rules);
            setCards(prev => { const next = [...prev]; next[slot] = { text, label, slot, scores, meaning, ratings }; return next; });
          },
        });
        if (run.current !== id) return;
        setFraction(null);
        setUnchanged(!!choice.unchanged && !choice.drafts.length);
        setDeclined(!!choice.declined);
        setReason(choice.reason ?? path.note);
        setNote(null);
        setPhase('ready');
      } catch (error) {
        if (run.current !== id) return;
        setFraction(null);
        setNote(error instanceof Error ? error.message : words.failed);
        setPhase('failed');
      }
    })();
  }, [writer, select, findSlips]);

  useEffect(() => {
    const progress = Native.addListener('onModelProgress', ({ fraction: value }) => setFraction(value));
    void Native.capture().then(value => {
      setCapture(value);
      if (!value) { setPhase('failed'); setNote(words.noCapture); return; }
      setWho(Judge.who(value.written));
      start(value);
    }).catch(() => { setPhase('failed'); setNote(words.noCapture); });
    return () => { ++run.current; progress.remove(); };
  }, [start]);

  // ---- Tone line (package 4): one batched writer call per tap names every shown text's tone; never per keystroke ----
  useEffect(() => {
    if (phase !== 'ready') return;
    const id = run.current;
    if (toneFor.current === id) return;
    const texts = [...(yours ? [yours.text] : []), ...shown.map(draft => draft.text)];
    if (!texts.length) return;
    toneFor.current = id;
    void (async () => {
      if (await phoneCanWrite() === 'cant') return;
      let answer: string | null = null;
      try { answer = await Native.ask(`tone-${Date.now()}`, Judge.tonePrompt(texts), { maxTokens: 80 }); }
      catch { return; }
      if (run.current !== id) return;
      const found = Judge.parseTones(answer);
      if (found.length) setTones(new Map(texts.map((text, i) => [text, found[i]] as [string, string]).filter(([, tone]) => !!tone)));
    })();
  });

  // ---- Fit: one Jev call per tap rates every shown reply on X and Reddit; never per keystroke ----
  useEffect(() => {
    if (phase !== 'ready' || mode !== 'grow' || !capture || !rated(platformOf.current)) return;
    const id = run.current;
    if (fitFor.current === id) return;
    const texts = [...(yours?.text ? [yours.text] : []), ...shown.map(draft => draft.text)];
    if (!texts.length) return;
    fitFor.current = id;
    const backends = leaves.current ? fitBackends(capture.app) : [];
    void judgeFit({ post: postOf.current ?? '', candidates: texts, platform: platformOf.current, backends })
      .catch(() => texts.map(() => ({ level: null, words: UNAVAILABLE, probability: null })))
      .then(found => {
        if (run.current !== id) return;
        // Levels and probabilities only, never the text: what the proof reads from the device log.
        console.log(`ownvoice-fit ${JSON.stringify(found)}`);
        setFits(new Map(texts.map((text, i) => [text, found[i]])));
      });
  });

  // Puts [text] in their message box, only on their tap, through the same way as a draft.
  const put = (text: string) => {
    if (inserting.current) return;
    inserting.current = true;
    setInsertBusy(true);
    void Native.serviceState().then(state => {
      if (state !== 'on') { setNote(words.serviceOff); setPhase('failed'); return; }
      return Native.insert(text);
    }).catch(() => { setNote(words.serviceOff); setPhase('failed'); })
      .finally(() => { inserting.current = false; setInsertBusy(false); });
  };

  // Why? starts with local evidence and unchecked rows; deeper results are cached by text for this run.
  const openWhy = (draft: Draft) => {
    const id = run.current;
    setWhy(draft.slot);
    if (whys.has(draft.text)) return;
    setWhys(prev => new Map(prev).set(draft.text, { state: 'running', meaning: draft.meaning }));
    const ask = async (prompt: string, maxTokens: number): Promise<string | null> => {
      try { return await Native.ask(`why-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, prompt, { maxTokens }); } catch { return null; }
    };
    void (async () => {
      const post = mode === 'compose';
      const publicScreen = post || namesPlatform(platformOf.current);
      const rules = voice.current;
      const conversation = capture?.conversation ?? '';
      // The checks stay on the phone when it can write; otherwise the cover shows the rules row plus noChecks.
      const model = await phoneCanWrite() !== 'cant';
      if (!publicScreen && !kind.current && model) {
        const answer = await ask(Judge.kindPrompt(conversation), 5);
        const message = answer ? Judge.isMessage(answer) : null;
        if (message !== null) kind.current = { message };
      }
      const message = publicScreen ? false : kind.current?.message;
      const answer = model && message !== undefined ? await ask(Judge.draftPrompt(conversation, draft.text, message, voiceGuide(rules, post && !message)), 220) : null;
      const scores = answer && message !== undefined && Judge.validDraftAnswer(answer, message) ? Judge.scoreDraft(draft.text, answer, message, rules, post, who, platformOf.current) : null;
      let meaning = draft.meaning;
      if (model && draft.label && yours) {
        meaning = Judge.meaning(yours.text, draft.text, await ask(Judge.rewriteCheckPrompt(yours.text, draft.text), 80));
      }
      if (run.current !== id) return;
      setWhys(prev => new Map(prev).set(draft.text, { state: scores ? 'done' : 'none', meaning }));
      if (scores) setYours(prev => prev?.text === draft.text ? { ...prev, scores } : prev);
      if (scores) setCards(prev => prev.map(card => (card && card.text === draft.text ? { ...card, scores, meaning } : card)));
    })();
  };

  const platform = platformOf.current;
  const title = mode == null ? words.writing
    : mode === 'polish' ? (namesPlatform(platform) ? words.postTitle : words.polishTitle)
    : mode === 'compose' ? words.postTitle
    : mode === 'reply' || mode === 'grow' ? (who ? `Reply to ${who}` : words.replyTitle)
    : words.nothingYet;
  const placeTitle = namesPlatform(platform) && mode !== 'empty' && mode != null ? `${title} · ${platform.label}` : title;

  const hasField = !!capture?.hasField;
  const mainNote = phase === 'failed' || phase === 'loading' ? note
    : phase === 'ready' && declined ? words.unclearPolish
    : phase === 'ready' && unchanged ? words.looksGoodNote
    : phase === 'ready' && !shown.length ? (mode === 'reply' || mode === 'grow' ? words.noReplies : mode === 'empty' ? words.writeFirst : words.noVersions)
    : phase === 'ready' ? (mode === 'reply' || mode === 'grow' ? (hasField ? words.readyReply : words.noField) : words.readyPolish)
    : fraction != null ? words.gettingReady
    : words.writing;

  const mood = phase === 'failed' || mode === 'empty' || !capture ? 'check'
    : phase === 'ready' || yours || shown.length ? 'ready' : 'thinking';

  const done = phase === 'ready' && unchanged;
  const empty = (phase === 'ready' || phase === 'failed') && !shown.length && !done && !!mainNote;
  const replies = mode === 'reply' || mode === 'grow';
  // With their own text in the box (polish, grow) a card replaces it: Use this. An empty box takes a reply: Insert.
  const insertLabel = mode === 'reply' ? words.insert : words.useThis;
  // Grow ranks the cards strongest first by their fit; each card keeps its slot, so its tag still names what it is for.
  // Unrated cards sit below rated ones; ties keep slot order (sort is stable).
  const listed = mode === 'grow' && fits.size ? [...shown].sort((a, b) => (fits.get(b.text)?.level ?? -1) - (fits.get(a.text)?.level ?? -1)) : cards;
  const prefill = prefillFor(platform);
  const coverDraft = why != null ? [...(yours ? [yours] : []), ...shown].find(draft => draft.slot === why) : undefined;
  const check = coverDraft ? whys.get(coverDraft.text) : undefined;

  return <Sheet
    title={placeTitle}
    note={empty ? undefined : mainNote ?? undefined}
    mood={mood}
    onClose={() => { void Native.closePanel().catch(() => {}); }}
    cover={coverDraft ? {
      title: replies ? words.whyReply : words.whyVersion,
      children: <WhyCover draft={coverDraft} checks={check ?? { state: 'running', meaning: null }} who={who} slips={coverDraft.slot === -1 ? slips.length : 0} />,
    } : undefined}
    onCloseCover={() => setWhy(null)}>
    {phase === 'writing' && fraction != null ? <View style={{ marginBottom: space.m }}><Progress fraction={fraction} /></View> : null}
    {yours && slips.length ? <View style={{ marginBottom: space.m }}>
      <Card variant="outlined" label={words.slipsTitle}>
        {slips.map((slip, i) => <View key={slip.start} style={[styles.slip, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
          {/* What they typed, then what it becomes: the slip crossed out when there is a fix. */}
          <View style={styles.slipText}>
            <Text style={[type.body, styles.wrong, { backgroundColor: t.mark, color: t.onMark }, slip.fix !== undefined && styles.crossed]}>{yours.text.slice(slip.start, slip.end).trim()}</Text>
            {slip.fix ? <>
              <ChevIcon size={18} color={t.muted} />
              <Text style={[type.body, { color: t.text, fontWeight: '600' }]}>{slip.fix}</Text>
            </> : <Text style={[type.note, { color: t.muted }]}>{slip.fix === '' ? words.slipRepeat : words.slipUnknown}</Text>}
          </View>
          {slip.fix !== undefined ? <Button kind="tonal" label={words.fix} disabled={!hasField || insertBusy} onPress={() => put(Typing.fixed(yours.text, slip))} /> : null}
        </View>)}
      </Card>
    </View> : null}
    {yours ? <View style={{ marginBottom: space.m }}>
      {/* Their text came back unchanged: it becomes the result, with Copy but no pointless Use this. */}
      <Card variant={done ? 'outlined' : 'filled'} label={done ? words.looksGood : 'Yours'}>
        <Marked text={yours.text} hits={[...yours.scores.hits, ...slips]} />
        <ToneLine text={yours.text} tones={tones} />
        <VerdictLine verdict={Judge.verdict(yours.scores, slips.length)} />
        <Ratings ratings={yours.ratings} fit={fits.get(yours.text)} />
        <View style={styles.actions}>
          {done ? <Button kind="text" label={copied === yours.text ? words.copied : words.copy} onPress={() => copy(yours)} /> : null}
          <Button kind="text" label={words.why} onPress={() => openWhy(yours)} />
        </View>
      </Card>
    </View> : null}
    {listed.map((card, i) => {
      if (!card) return phase === 'writing' ? <View key={`empty-${i}`} style={{ marginBottom: space.m }}><Placeholder /></View> : null;
      const verdict = card.label ? null : distinctVerdict(card, shown);
      const exportBlocked = card.meaning?.ok === false;
      const editing = edit?.slot === card.slot ? edit : null;
      return <View key={card.slot} style={{ marginBottom: space.m }}>
        <Card variant="outlined" label={card.label ?? (replies ? (TAGS[platform.id] ?? CHAT_TAGS)[card.slot] : undefined)}>
          {editing
            ? <TextInput accessibilityLabel={words.editField} multiline autoFocus value={editing.text} onChangeText={text => setEdit({ slot: card.slot, text })}
              style={[type.body, { color: t.text, backgroundColor: t.raised, borderRadius: shape.card, paddingHorizontal: space.l, paddingVertical: space.m, minHeight: 88, textAlignVertical: 'top' }]} />
            : <Marked text={card.text} hits={card.scores.hits} />}
          {editing ? null : <ToneLine text={card.text} tones={tones} />}
          {editing ? null : card.label ? <MeaningLine check={card.meaning} /> : verdict ? <View style={{ marginTop: space.s }}><VerdictLine verdict={verdict} /></View> : null}
          {/* While editing, the ratings follow the edited text, never the original. */}
          <Ratings ratings={editing ? rate(editing.text, platformOf.current, postOf.current, voice.current) : card.ratings} fit={editing ? undefined : fits.get(card.text)} />
          {editing ? <View style={styles.actions}>
            <Button kind="filled" label={insertLabel} disabled={!hasField || insertBusy || !editing.text.trim()} onPress={() => put(editing.text)} />
            <Button kind="text" label={words.cancel} onPress={() => setEdit(null)} />
          </View> : <View style={styles.actions}>
            <Button kind="filled" label={insertLabel} disabled={!hasField || insertBusy} onPress={() => put(card.text)} />
            {/* One main action; copy and hand-off stay quiet icons so the row never wraps. */}
            <IconButton icon={copied === card.text ? CheckIcon : CopyIcon} label={copied === card.text ? words.copied : words.copy} disabled={exportBlocked} onPress={() => copy(card)} />
            <IconButton icon={prefill.dest === 'share' ? ShareIcon : OpenIcon} label={prefill.label} disabled={exportBlocked} onPress={() => openPrefill(platform, card)} />
            <View style={{ flex: 1 }} />
            <Button kind="text" label={words.edit} onPress={() => setEdit({ slot: card.slot, text: card.text })} />
            <Button kind="text" label={words.why} onPress={() => openWhy(card)} />
          </View>}
        </Card>
      </View>;
    })}
    {phase === 'ready' && shown.length
      ? <View style={{ alignItems: 'flex-end', marginBottom: space.m }}>
        <Button kind="text" label={words.writeNew} onPress={() => capture && start(capture, shown.map(draft => draft.text))} />
      </View>
      : null}
    {empty && mainNote
      ? <Empty text={mainNote}>
        {phase === 'ready' && !declined && mode !== 'empty' || phase === 'failed' && retryLines.has(mainNote) ? <Button kind="filled" label={words.tryAgain} onPress={() => capture && start(capture)} /> : null}
        {phase === 'failed' && opensApp.has(mainNote) ? <Button kind="filled" label={words.openOwnvoice} onPress={openOwnvoice} /> : null}
      </Empty>
      : null}
    {reason && shown.length ? <Text style={[type.note, { color: t.muted, marginBottom: space.m }]}>{reason}</Text> : null}
  </Sheet>;
}

const styles = StyleSheet.create({
  // Wraps Why? onto its own line on narrow phones rather than squeezing the buttons.
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, marginTop: space.m, marginLeft: -space.xs },
  quote: { flexDirection: 'row', gap: space.m, borderRadius: shape.card, padding: space.l },
  slip: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 56, paddingVertical: space.s },
  slipText: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s },
  wrong: { borderRadius: 6, paddingHorizontal: 6, overflow: 'hidden' },
  crossed: { textDecorationLine: 'line-through' },
  quoteBar: { width: 3, borderRadius: 2 },
});
