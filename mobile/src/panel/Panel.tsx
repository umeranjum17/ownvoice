import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import Native, { type Capture } from '../../modules/ownvoice-native';
import * as Judge from '../core/judge';
import * as Slop from '../core/slop';
import { dashesFor } from '../core/drafts';
import { guide as voiceGuide } from '../core/voice';
import { words } from '../core/words';
import type { Check, Scores } from '../core/judge';
import type { Writer } from '../core/writers';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { MeaningLine } from '../ui/MeaningLine';
import { Marked } from '../ui/Marked';
import { Placeholder } from '../ui/Placeholder';
import { Progress } from '../ui/Progress';
import { ReasonRow } from '../ui/ReasonRow';
import { Sheet } from '../ui/Sheet';
import { VerdictLine } from '../ui/VerdictLine';
import { space, type, useReducedMotion, useTheme } from '../ui/theme';
import { phoneWriter } from './phoneWriter';

// The writer's rules come with the voice-settings slice; until then nothing is switched on.
const RULES = Slop.NO_RULES;

type Mode = 'reply' | 'polish' | 'compose' | 'empty';
type Phase = 'loading' | 'writing' | 'ready' | 'failed';
type Draft = { text: string; label?: string; slot: number; scores: Scores; meaning: Check | null };
type WhyState = { state: 'running' | 'none' | 'done'; meaning: Check | null };

const modeOf = (typed: string, written: string): Mode =>
  typed.trim() ? (Judge.replying(written) ? 'polish' : 'compose') : Judge.replying(written) ? 'reply' : 'empty';

/** The instant, rules-only first row of the Why? note (DraftActivity.kt's rule row). */
function ruleRow(s: Scores, text: string): { ok: boolean; name: string; detail?: string } {
  const phrases = [...new Set(s.hits.map(h => `“${text.slice(h.start, h.end).trim()}”: ${h.reason}`))].join('\n');
  if (Slop.natural(s.slop)) return { ok: true, name: Slop.words(s.slop), detail: phrases || undefined };
  if (!phrases) return { ok: false, name: `${Judge.GENERAL}.`, detail: 'It could be sent to almost anyone.' };
  return { ok: false, name: `${Slop.words(s.slop)}.`, detail: phrases };
}

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

function WhyCover({ draft, checks, who }: { draft: Draft; checks: WhyState; who: string | null }) {
  const t = useTheme();
  const rows = [
    ruleRow(draft.scores, draft.text),
    ...[...draft.scores.quality, ...draft.scores.reach].map(c => ({ ok: c.ok, name: c.name, detail: c.ok ? undefined : c.reason })),
    ...(draft.label && checks.meaning ? [{ ok: checks.meaning.ok, name: checks.meaning.ok ? 'Same meaning' : 'Check this', detail: checks.meaning.ok ? undefined : checks.meaning.reason }] : []),
  ];
  return <View>
    <Card variant="outlined">
      <Marked text={draft.text} hits={draft.scores.hits} />
    </Card>
    <Text style={[type.label, { color: t.primary, marginTop: space.l, marginBottom: space.s }]}>{words.howItReads}</Text>
    <Card variant="outlined">
      {rows.map((row, i) => <ReasonRow key={i} {...row} />)}
      {checks.state === 'running' ? <Checking /> : null}
      {checks.state === 'none' ? <Text style={[type.note, { color: t.muted, paddingVertical: space.s }]}>{words.noChecks}</Text> : null}
    </Card>
    <Text style={[type.note, { color: t.muted, marginTop: space.l }]}>{Judge.quickChecks(who)}</Text>
  </View>;
}

export default function Panel({ writer = phoneWriter }: { writer?: Writer } = {}) {
  const t = useTheme();
  const [capture, setCapture] = useState<Capture | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [note, setNote] = useState<string | null>(null);
  const [fraction, setFraction] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [yours, setYours] = useState<Draft | null>(null);
  const [cards, setCards] = useState<(Draft | null)[]>([null, null, null]);
  const [why, setWhy] = useState<number | null>(null);
  const [whys, setWhys] = useState<Map<string, WhyState>>(new Map());
  const run = useRef(0);
  const inserting = useRef(false);
  const [insertBusy, setInsertBusy] = useState(false);
  const kind = useRef<{ message: boolean } | null>(null);

  const shown = cards.filter((card): card is Draft => !!card);

  const start = useCallback((value: Capture, avoid?: string[]) => {
    const id = ++run.current;
    const nextMode = modeOf(value.typed, value.written);
    const post = nextMode === 'compose';
    const person = Judge.who(value.written);
    setMode(nextMode);
    setCards([null, null, null]);
    setYours(null);
    setFallback(false);
    setFraction(null);
    setWhy(null);
    if (nextMode === 'empty') { setNote(null); setPhase('ready'); return; }
    setNote(words.writing);
    setPhase('writing');
    if (nextMode !== 'reply') {
      const text = value.typed.trim();
      setYours({ text, slot: -1, scores: Judge.scoreDraft(text, null, !post, RULES, post, person), meaning: null });
    }
    void writer.write({
      conversation: value.conversation,
      written: value.written,
      nodes: value.nodes,
      fieldTop: value.fieldTop ?? undefined,
      typed: value.typed.trim(),
      guide: voiceGuide(RULES, post),
      dashes: dashesFor(RULES, nextMode === 'reply' ? value.written : value.typed),
      avoid,
    }, {
      state: state => {
        if (run.current !== id) return;
        setNote(state === 'downloading' ? words.gettingReady : words.writing);
        if (state === 'writing') setFraction(null);
      },
      fraction: value2 => { if (run.current === id) setFraction(value2); },
      landed: (text, slot, label) => {
        if (run.current !== id) return;
        const scores = Judge.scoreDraft(text, null, !post, RULES, post, person);
        const meaning = label ? Judge.meaning(value.typed, text, null) : null;
        setCards(prev => { const next = [...prev]; next[slot] = { text, label, slot, scores, meaning }; return next; });
      },
    }).then(({ reason }) => {
      if (run.current !== id) return;
      setFraction(null);
      setFallback(!!reason);
      setNote(null);
      setPhase('ready');
    }).catch((error: unknown) => {
      if (run.current !== id) return;
      setFraction(null);
      setNote(error instanceof Error ? error.message : words.failed);
      setPhase('failed');
    });
  }, [writer]);

  useEffect(() => {
    const progress = Native.addListener('onModelProgress', ({ fraction: value }) => setFraction(value));
    void Native.capture().then(value => {
      setCapture(value);
      if (!value) { setPhase('failed'); setNote(words.noCapture); return; }
      setWho(Judge.who(value.written));
      start(value);
    }).catch(() => { setPhase('failed'); setNote(words.noCapture); });
    return () => progress.remove();
  }, [start]);

  // ---- Why? (spec 4.4): the rule row is instant; the model checks run behind the cover, cached per draft ----
  const openWhy = (draft: Draft) => {
    setWhy(draft.slot);
    if (whys.has(draft.text)) return;
    setWhys(prev => new Map(prev).set(draft.text, { state: 'running', meaning: draft.meaning }));
    const ask = async (prompt: string, maxTokens: number): Promise<string | null> => {
      try { return await Native.ask(`why-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, prompt, { maxTokens }); } catch { return null; }
    };
    void (async () => {
      const post = mode === 'compose';
      const conversation = capture?.conversation ?? '';
      let model = true;
      try { if (await Native.modelStatus() !== 'available') model = false; } catch { model = false; }
      if (!kind.current) {
        const answer = model ? await ask(Judge.kindPrompt(conversation), 5) : null;
        kind.current = { message: answer ? Judge.isMessage(answer) : false };
      }
      const message = kind.current.message;
      const answer = model ? await ask(Judge.draftPrompt(conversation, draft.text, message, voiceGuide(RULES, post && !message)), 220) : null;
      const scores = answer ? Judge.scoreDraft(draft.text, answer, message, RULES, post, who) : null;
      let meaning = draft.meaning;
      if (model && draft.label && yours) {
        meaning = Judge.meaning(yours.text, draft.text, await ask(Judge.rewriteCheckPrompt(yours.text, draft.text), 80));
      }
      setWhys(prev => new Map(prev).set(draft.text, { state: scores ? 'done' : 'none', meaning }));
      if (scores) setCards(prev => prev.map(card => (card && card.text === draft.text ? { ...card, scores, meaning } : card)));
    })();
  };

  const title = mode === 'polish' ? words.polishTitle
    : mode === 'compose' ? words.postTitle
    : mode === 'reply' ? (who ? `Reply to ${who}` : words.replyTitle)
    : words.nothingYet;

  const hasField = !!capture?.hasField;
  const mainNote = phase === 'failed' || phase === 'loading' ? note
    : phase === 'ready' && !shown.length ? (mode === 'reply' ? words.noReplies : mode === 'empty' ? words.writeFirst : words.noVersions)
    : phase === 'ready' ? (mode === 'reply' ? (hasField ? words.readyReply : words.noField) : words.readyPolish)
    : fraction != null ? words.gettingReady
    : words.writing;

  const mood = phase === 'failed' || mode === 'empty' || !capture ? 'check'
    : phase === 'ready' || yours || shown.length ? 'ready' : 'thinking';

  const insertLabel = mode === 'reply' ? words.insert : words.useThis;
  const coverDraft = why != null ? shown.find(draft => draft.slot === why) : undefined;
  const check = coverDraft ? whys.get(coverDraft.text) : undefined;

  return <Sheet
    title={title}
    note={mainNote ?? undefined}
    mood={mood}
    onClose={() => { void Native.closePanel().catch(() => {}); }}
    cover={coverDraft ? {
      title: mode === 'reply' ? words.whyReply : words.whyVersion,
      children: <WhyCover draft={coverDraft} checks={check ?? { state: 'running', meaning: null }} who={who} />,
    } : undefined}
    onCloseCover={() => setWhy(null)}>
    {phase === 'writing' && fraction != null ? <View style={{ marginBottom: space.m }}><Progress fraction={fraction} /></View> : null}
    {yours ? <View style={{ marginBottom: space.m }}>
      <Card variant="filled" label="Yours">
        <Marked text={yours.text} hits={yours.scores.hits} />
        <VerdictLine verdict={Judge.verdict(yours.scores)} />
      </Card>
    </View> : null}
    {cards.map((card, slot) => card
      ? <View key={slot} style={{ marginBottom: space.m }}>
        <Card variant="outlined" label={card.label}>
          <Marked text={card.text} hits={card.scores.hits} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              {card.label ? <MeaningLine check={card.meaning} /> : <VerdictLine verdict={Judge.verdict(card.scores)} />}
            </View>
            <Button kind="text" label={words.why} onPress={() => openWhy(card)} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s }}>
            <Button kind="filled" label={insertLabel} disabled={!hasField || insertBusy} onPress={() => {
              if (inserting.current) return;
              inserting.current = true;
              setInsertBusy(true);
              void Native.serviceState().then(state => {
                if (state !== 'on') { setNote(words.serviceOff); setPhase('failed'); return; }
                return Native.insert(card.text);
              }).catch(() => { setNote(words.serviceOff); setPhase('failed'); })
                .finally(() => { inserting.current = false; setInsertBusy(false); });
            }} />
            <Button kind="text" label={words.copy} onPress={() => { void Native.copy(card.text).catch(() => {}); }} />
          </View>
        </Card>
      </View>
      : phase === 'writing' ? <View key={slot} style={{ marginBottom: space.m }}><Placeholder /></View> : null)}
    {phase === 'ready' && shown.length
      ? <View style={{ alignItems: 'flex-end', marginBottom: space.m }}>
        <Button kind="text" label={words.writeNew} onPress={() => capture && start(capture, shown.map(draft => draft.text))} />
      </View>
      : null}
    {phase === 'ready' && !shown.length && mode !== 'empty'
      ? <View style={{ alignItems: 'flex-start', marginBottom: space.m }}>
        <Button kind="filled" label={words.tryAgain} onPress={() => capture && start(capture)} />
      </View>
      : null}
    {fallback && shown.length ? <Text style={[type.note, { color: t.muted, marginBottom: space.m }]}>{words.fallback}</Text> : null}
  </Sheet>;
}
