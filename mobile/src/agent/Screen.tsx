import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Dot } from '../ui/Dot';
import { Empty } from '../ui/Empty';
import { Page } from '../ui/Page';
import { Placeholder } from '../ui/Placeholder';
import type { Mood } from '../ui/dot';
import { shape, space, type, useTheme } from '../ui/theme';
import { words } from '../core/words';
import { getSource } from '../core/source';
import { phoneCanWrite } from '../core/phoneStatus';
import { loadVoice } from '../core/voiceStore';
import { noPhoneLine, retryLines } from '../core/writers';
import { runAgent, type Brain, type Call } from './loop';
import { instructions } from './prompt';
import { checkVoice, shareNote } from './tools';
import { labBrain } from './labBrain';
import { localBrain } from './localBrain';

/** One brain per writing choice; plan (ChatGPT) and local (on-device) brains. */
export type Brains = { local?: Brain; plan?: Brain };
// Local chosen and ready runs on-device via @byokit/infer; plan runs via @byokit/accounts.
// getSource() picks at task start, never switching mid-task.
const LAB: Brains = { local: localBrain(), plan: labBrain() };

/** The writer the person chose, when it can write now: plan when chosen, local only when ready. */
export async function pickBrain(brains: Brains): Promise<Brain | null> {
  const source = await getSource().catch(() => null);
  // 'chatgpt' maps to 'plan', 'phone' maps to 'local' for backward compatibility
  if (source === 'chatgpt') return brains.plan ?? null;
  if (source === 'phone' && await phoneCanWrite() === 'ready') return brains.local ?? null;
  return null;
}

/** The draft a step carries: what it checks, or what it offers to share. */
function draftOf(call: Call): string {
  try {
    const args = JSON.parse(call.args || '{}');
    const text = call.name === 'share_note' ? args.body : call.name === 'check_voice' ? args.draft : null;
    return typeof text === 'string' ? text : '';
  } catch { return ''; }
}

/** The one plain line for a failed step; never the error's own words. */
function failLine(error: unknown): string {
  if (error instanceof Error && error.message === words.needWriterPanel) return words.needWriterPanel;
  if ((error as { kind?: unknown } | null)?.kind === 'network') return words.offlineNoPhone;
  return noPhoneLine(error);
}

type Phase = 'idle' | 'working' | 'asking' | 'done' | 'failed';

/** Lab only: a small writing task, drafted, checked against the person's rules, and offered to share.
 *  It shows the draft as it's written and one plain line per step, never what runs underneath. */
export default function AgentScreen({ brains = LAB }: { brains?: Brains }) {
  const t = useTheme();
  const [task, setTask] = useState('');
  // undefined while checking, null when no writer can write right now.
  const [brain, setBrain] = useState<Brain | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('idle');
  const [line, setLine] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [ask, setAsk] = useState<string | null>(null);
  const run = useRef(0);
  const answer = useRef<((yes: boolean) => void) | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    void pickBrain(brains).then(next => { if (live) setBrain(next); });
    return () => { live = false; };
  }, [brains]));
  // Leaving the screen ends the task: nothing more is asked or shared.
  useEffect(() => () => { run.current++; answer.current?.(false); }, []);

  const start = async () => {
    const id = ++run.current;
    const live = () => id === run.current;
    const chosen = await pickBrain(brains);
    if (!live()) return;
    setBrain(chosen);
    if (!chosen) return;
    setPhase('working'); setLine(words.writing); setNote(null); setDraft(''); setAsk(null);
    let latest = '';
    let checked = false;
    const brain: Brain = {
      async step(rules, items, tools) {
        if (!live()) throw new Error('left');
        setLine(checked ? words.agentChecking : words.writing);
        let said = '';
        const turn = await chosen.step(rules, items, tools, piece => { if (live()) { said += piece; setDraft(said); } });
        if (!live()) throw new Error('left');
        // A step's draft is the one it checks or offers; anything else it says is a plain line to show.
        const carried = turn.calls.map(draftOf).filter(Boolean).pop();
        if (carried) latest = carried;
        else if (!latest || turn.calls.length) latest = turn.text || latest;
        if (turn.text && turn.text !== latest) setNote(turn.text);
        setDraft(latest);
        return turn;
      },
    };
    try {
      const out = await runAgent({
        instructions: instructions(loadVoice()), task, brain,
        tools: [checkVoice(loadVoice), shareNote(async (_title, body) => (await Share.share({ message: body })).action !== Share.dismissedAction)],
        onStep: call => { checked = call.name === 'check_voice'; },
        // The share card shows exactly the text that leaves the app; nothing goes until Share.
        approve: call => new Promise<boolean>(yes => {
          if (!live()) { yes(false); return; }
          answer.current = yes;
          setAsk(draftOf(call));
          setPhase('asking');
        }),
      });
      if (!live()) return;
      setLine(out.stop === 'cap' ? words.agentStopped : null);
      setPhase('done');
    } catch (error) {
      if (!live()) return;
      const failed = failLine(error);
      if (failed === words.needWriterPanel) { setBrain(null); setPhase('idle'); return; }
      setLine(failed);
      setPhase('failed');
    } finally {
      if (live()) { answer.current = null; setAsk(null); }
    }
  };
  const reply = (yes: boolean) => {
    const give = answer.current;
    answer.current = null;
    setAsk(null);
    setPhase('working');
    give?.(yes);
  };

  const busy = phase === 'working' || phase === 'asking';
  if (brain === null && !busy) return <Page title={words.agentRow} onBack={() => router.back()}>
    <Empty mood="check" text={words.needWriterPanel}>
      <Button kind="filled" label={words.openOwnvoice} onPress={() => router.push('/source')} />
    </Empty>
  </Page>;

  // While the share card waits, the line is what the writer said about it (like what it can't do here).
  const said = phase === 'asking' ? note : line ?? note;
  const mood: Mood = phase === 'working' ? 'thinking' : phase === 'asking' ? 'hello' : phase === 'failed' || line ? 'check' : 'done';
  const field = { color: t.text, backgroundColor: t.raised, borderRadius: shape.card, paddingHorizontal: space.l, paddingVertical: space.m };
  return <Page title={words.agentRow} onBack={() => router.back()}
    footer={<Button kind="filled" large label={words.agentGo} disabled={busy || !task.trim() || brain === undefined} onPress={() => { void start(); }} />}>
    <TextInput testID="phone-agent-lab" accessibilityLabel={words.agentAsk} placeholder={words.agentAsk} placeholderTextColor={t.muted}
      multiline editable={!busy} value={task} onChangeText={setTask} autoCapitalize="sentences"
      style={[type.body, field, { minHeight: 96, textAlignVertical: 'top' }]} />
    {phase !== 'idle' && said ? <View style={styles.status}>
      <Dot mood={mood} size={40} />
      <Text style={[type.body, { color: phase === 'working' ? t.muted : t.text, flex: 1 }]}>{said}</Text>
    </View> : null}
    {phase === 'failed' && line && retryLines.has(line) ? <View style={styles.actions}>
      <Button kind="filled" label={words.tryAgain} onPress={() => { void start(); }} />
    </View> : null}
    {ask !== null ? <Card variant="filled">
      <Text accessibilityRole="header" style={[type.heading, { color: t.text, fontSize: 18, lineHeight: 24 }]}>{words.agentShareTitle}</Text>
      <Text selectable style={[type.words, { color: t.text, marginTop: space.s }]}>{ask}</Text>
      <View style={styles.actions}>
        <Button kind="filled" label={words.agentShare} onPress={() => reply(true)} />
        <Button kind="text" label={words.agentNotNow} onPress={() => reply(false)} />
      </View>
    </Card> : draft ? <Card variant="outlined">
      <Text selectable style={[type.words, { color: t.text, paddingBottom: space.s }]}>{draft}</Text>
    </Card> : phase === 'working' ? <Placeholder /> : null}
  </Page>;
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, marginTop: space.m },
});
