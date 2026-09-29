import { useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';
import { classify } from '@byokit/accounts';
import Native from '../../modules/ownvoice-native';
import { streamSelectionRewrite } from '../chatgpt/responses';
import { chatgptConsent } from '../chatgpt/settings';
import * as Judge from '../core/judge';
import * as Slop from '../core/slop';
import * as Voice from '../core/voice';
import { loadVoice } from '../core/voiceStore';
import { errorCode, message } from '../core/nano';
import { phoneCanWrite } from '../core/phoneStatus';
import { getSource, SOURCE_KEY, type Source } from '../core/source';
import { store } from '../core/store';
import { SendVeto, type WriterEvents } from '../core/writers';
import { words } from '../core/words';
import { preserveFragment, cleanSelection } from '../core/drafts';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Choices } from '../ui/Choices';
import { Empty } from '../ui/Empty';
import { Marked } from '../ui/Marked';
import { MeaningLine } from '../ui/MeaningLine';
import { Placeholder } from '../ui/Placeholder';
import { Sheet } from '../ui/Sheet';
import { VerdictLine } from '../ui/VerdictLine';
import { space } from '../ui/theme';

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
  const [input, setInput] = useState<{ text: string; editable: boolean } | null>(null);
  const [choice, setChoice] = useState<Judge.Rewrite | null>(null);
  const [result, setResult] = useState<{ text: string; meaning: Judge.Check | null; scores: Judge.Scores; verdict: Judge.Verdict | null } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useRef(0); // a newer tap drops the earlier answer, as JudgeActivity's job cancel does
  const rules = useRef(loadVoice()).current;

  useEffect(() => {
    const value = Native.rewriteInput();
    setInput(value);
    setNote(value?.text.trim() ? "Pick how you'd like it. You'll see it before anything changes." : 'Select some text first, then choose Ownvoice.');
  }, []);

  /** The consent the ChatGPT rewrite sends under: the chosen source plus the panel's full guard set (sign-in, pause, switch, never mid-sign-out); the sheet works in any app, so no per-app row applies. */
  const consent = (): WriterEvents => {
    const guards = chatgptConsent(null);
    return {
      beforeSend: async () => store.peek<Source>(SOURCE_KEY) === 'chatgpt' && await guards.beforeSend(),
      beforeFetch: () => store.peek<Source>(SOURCE_KEY) === 'chatgpt' && guards.beforeFetch(),
    };
  };

  const rewrite = async (how: Judge.Rewrite) => {
    if (!input?.text.trim()) return;
    const id = ++run.current;
    setChoice(how);
    setBusy(true);
    setResult(null);
    setNote(words.writing);
    const stub = process.env.EXPO_PUBLIC_E2E_STUB === '1' ? stubRewrite(input.text, how) : null;
    const guide = Voice.guide(rules, false);
    const finish = (raw: string) => {
      const text = cleanSelection(input.text, Judge.clean(raw));
      return how === Judge.Rewrite.GRAMMAR ? preserveFragment(input.text, text) : text;
    };
    const phoneRewrite = async () => finish(stub ?? await Native.ask(`rewrite-${Date.now()}`, Judge.selectionRewritePrompt(input.text, how, guide), { maxTokens: 256 }));
    // The meaning check stays on the phone when it can write; otherwise only the number check runs.
    const showResult = async (text: string, canWrite: boolean) => {
      if (id !== run.current) return false;
      if (!text) { setNote("Couldn't rewrite that. Try again."); return false; }
      setNote('Copy it, then paste it where you like.');
      setResult({ text, meaning: Judge.meaning(input.text, text, null), scores: Judge.scoreDraft(text, null, true, rules), verdict: null });
      setBusy(false);
      const answer = stub === null && canWrite ? await Native.ask(`rewrite-check-${Date.now()}`, Judge.rewriteCheckPrompt(input.text, text), { maxTokens: 80 }).catch(() => null) : null;
      if (id !== run.current) return false;
      const scores = Judge.scoreDraft(text, answer, true, rules);
      setResult({ text, meaning: Judge.meaning(input.text, text, answer), scores, verdict: answer && scores.generic !== null && scores.specific !== null ? Judge.verdict(scores) : null });
      return true;
    };
    try {
      const source = await getSource().catch(() => null);
      const canWrite = await phoneCanWrite() !== 'cant';
      if (stub !== null || source !== 'chatgpt') {
        await showResult(await phoneRewrite(), canWrite);
        return;
      }
      try {
        await showResult(finish(await streamSelectionRewrite(input.text, how, guide, consent())), canWrite);
      } catch (error) {
        if (id !== run.current) return;
        const veto = error instanceof SendVeto ? error.message : null;
        const offline = classify(error instanceof Error ? error.message : String(error))?.kind === 'network';
        if (canWrite) {
          let shown = false;
          try { shown = await showResult(await phoneRewrite(), true); }
          catch (fallback) { if (id !== run.current) return; setNote(message(errorCode(fallback))); return; }
          if (!shown || id !== run.current) return;
          setNote(veto ?? (offline ? words.offlinePhone : words.fallback));
          return;
        }
        setNote(veto ? words.gptOffNoPhone : offline ? words.offlineNoPhone : words.chatgptFailed);
      }
    } catch (error) {
      if (id !== run.current) return;
      setNote(message(errorCode(error)));
    } finally {
      if (id === run.current) setBusy(false);
    }
  };

  const enabled = !!input?.text.trim();
  return <Sheet title="Make it better" note={enabled ? note : undefined} mood={enabled ? (busy ? 'thinking' : result ? 'ready' : 'idle') : undefined} onClose={() => { void Native.finishRewrite(null, false); }}>
    {!enabled ? (input ? <Empty mood="check" text={note} /> : null) : <>
      <Card variant="filled" label="You selected"><Marked text={input!.text} hits={Slop.hits(input!.text, rules)} /></Card>
      <View style={{ marginVertical: space.l }}>
        <Choices options={Object.values(Judge.Rewrite)} value={choice} onPick={how => { void rewrite(how); }} />
      </View>
      {busy ? <Placeholder /> : null}
      {result ? <>
        <Card variant="outlined" label={choice ?? undefined}>
          <Marked text={result.text} hits={result.scores.hits} />
          <MeaningLine check={result.meaning} same="Same meaning as yours" />
          <VerdictLine verdict={result.verdict} />
          <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.m }}>
            <Button kind="filled" label="Copy" onPress={() => { void Native.finishRewrite(result.text, false); }} />
            <Button kind="text" label={words.shareText} onPress={() => { void Share.share({ message: result.text }).catch(() => {}); }} />
          </View>
        </Card>
      </> : null}
    </>}
  </Sheet>;
}
