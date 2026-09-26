import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Native from '../../modules/ownvoice-native';
import * as Judge from '../core/judge';
import * as Slop from '../core/slop';
import { errorCode, message } from '../core/nano';
import { words } from '../core/words';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Marked } from '../ui/Marked';
import { MeaningLine } from '../ui/MeaningLine';
import { Placeholder } from '../ui/Placeholder';
import { Sheet } from '../ui/Sheet';
import { VerdictLine } from '../ui/VerdictLine';
import { space, type, useTheme } from '../ui/theme';

// The writer's rules come with the voice-settings slice; until then nothing is switched on (as in the panel).
const RULES = Slop.NO_RULES;

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

/** Rewrites selected text from the selection menu or a share, with no accessibility needed (R1–R5). */
export default function Rewrite() {
  const theme = useTheme();
  const [input, setInput] = useState<{ text: string; editable: boolean } | null>(null);
  const [choice, setChoice] = useState<Judge.Rewrite | null>(null);
  const [result, setResult] = useState<{ text: string; meaning: Judge.Check | null; scores: Judge.Scores } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useRef(0); // a newer tap drops the earlier answer, as JudgeActivity's job cancel does

  useEffect(() => {
    const value = Native.rewriteInput();
    setInput(value);
    setNote(value?.text.trim() ? "Pick how you'd like it. You'll see it before anything changes." : 'Select some text first, then choose Ownvoice.');
  }, []);

  const rewrite = async (how: Judge.Rewrite) => {
    if (!input?.text.trim()) return;
    const id = ++run.current;
    setChoice(how);
    setBusy(true);
    setResult(null);
    setNote(words.writing);
    const stub = process.env.EXPO_PUBLIC_E2E_STUB === '1' ? stubRewrite(input.text, how) : null;
    try {
      const text = stub ?? Judge.clean(await Native.ask(`rewrite-${Date.now()}`, Judge.selectionRewritePrompt(input.text, Judge.rewriteAsk[how]), { maxTokens: 256 }));
      if (id !== run.current) return;
      if (!text) { setNote("Couldn't rewrite that. Try again."); return; }
      setNote(input.editable ? 'Replace your text with it, or copy it.' : 'Copy it, then paste it where you like.');
      const answer = stub === null ? await Native.ask(`rewrite-check-${Date.now()}`, Judge.rewriteCheckPrompt(input.text, text), { maxTokens: 80 }).catch(() => null) : null;
      if (id !== run.current) return;
      const lines = answer ? Judge.parse(answer) : {};
      const generic = Judge.number(lines.GENERIC), specific = Judge.number(lines.SPECIFICITY);
      const hits = Slop.hits(text, RULES);
      setResult({ text, meaning: Judge.meaning(input.text, text, answer), scores: { hits, generic, specific, quality: [], reach: [], message: false, slop: Slop.score(hits.length, generic, specific) } });
    } catch (error) {
      if (id !== run.current) return;
      setNote(message(errorCode(error)));
    } finally {
      if (id === run.current) setBusy(false);
    }
  };

  const enabled = !!input?.text.trim();
  return <Sheet title="Make it better" note={note} mood={busy ? 'thinking' : result ? 'ready' : 'idle'} onClose={() => { void Native.finishRewrite(null); }}>
    {!enabled ? null : <>
      <Card variant="filled" label="You selected"><Marked text={input!.text} hits={Slop.hits(input!.text, RULES)} /></Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginVertical: space.m }}>
        {Object.values(Judge.Rewrite).map(how => <Button key={how} kind={choice === how ? 'filled' : 'text'} label={how} onPress={() => { void rewrite(how); }} />)}
      </View>
      {busy ? <Placeholder /> : null}
      {result ? <>
        <Card variant="outlined">
          <Marked text={result.text} hits={result.scores.hits} />
          <MeaningLine check={result.meaning} same="Same meaning as yours" />
          <VerdictLine verdict={Judge.verdict(result.scores)} />
          <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.m }}>
            {input!.editable ? <Button kind="filled" label="Replace" onPress={() => { void Native.finishRewrite(result.text); }} /> : null}
            <Button kind={input!.editable ? 'text' : 'filled'} label="Copy" onPress={() => { void Native.finishRewrite(result.text); }} />
          </View>
        </Card>
        {input!.editable ? <Text style={[type.note, { color: theme.muted, marginTop: space.m, paddingHorizontal: space.xs }]}>If the app doesn't take it, it's copied too. Just paste.</Text> : null}
      </> : null}
    </>}
  </Sheet>;
}
