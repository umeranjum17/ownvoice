import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import Native from '../modules/ownvoice-native';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { Row } from '../src/ui/Row';
import { Switch } from '../src/ui/Switch';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { loadVoice, merge, parse, saveVoice, type Found } from '../src/core/voice';
import type { Rules } from '../src/core/slop';

const SKIP_ONE = 'Left out 1 note that reads as advice, not a phrase.';
const SKIP_MANY = 'notes that read as advice, not phrases.';

/** What an import found, in the same words as the Kotlin preview. */
export function foundLines(found: Found): string {
  const lines: string[] = [words.foundHead];
  if (found.never.length) lines.push(`${words.foundNever} (${found.never.length}): ${found.never.map(x => `“${x}”`).join(', ')}`);
  if (found.noDashes) lines.push(words.foundRuleDashes);
  if (found.statementEndings) lines.push(words.foundRuleEndings);
  if (found.skipped === 1) lines.push(SKIP_ONE);
  else if (found.skipped > 1) lines.push(`Left out ${found.skipped} ${SKIP_MANY}`);
  lines.push(words.foundRest);
  return lines.join('\n');
}

/** Your voice: the never-say list, a few rules and a "how I write" note, kept on this phone. */
export default function Voice({ shared = false }: { shared?: boolean }) {
  const t = useTheme();
  const inset = useSafeAreaInsets().top;
  const [rules, setRules] = useState<Rules>(loadVoice);
  const [neverText, setNeverText] = useState(() => loadVoice().never.join('\n'));
  const [preview, setPreview] = useState('');
  const [pending, setPending] = useState<Found | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // Everything on this screen saves as it changes, like VoiceActivity saving on pause.
  const change = (next: Rules): boolean => {
    try { saveVoice(next); setRules(next); setSaveFailed(false); return true; }
    catch { setSaveFailed(true); return false; }
  };
  const show = useCallback((markdown: string) => {
    const found = parse(markdown);
    if (!found.never.length && !found.noDashes && !found.statementEndings) { setPreview(words.foundNothing); setPending(null); return; }
    setPending(found);
    setPreview(foundLines(found));
  }, []);
  useEffect(() => {
    if (!shared) return;
    let active = true;
    Native.sharedMarkdown().then(markdown => {
      if (!active) return;
      if (markdown == null) { setPreview(words.cantOpen); setPending(null); }
      else show(markdown);
    }).catch(() => { if (active) { setPreview(words.cantOpen); setPending(null); } });
    return () => { active = false; };
  }, [shared, show]);
  const pick = async () => {
    // Markdown has no MIME type every file manager agrees on, so offer any file.
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['*/*'] });
      if (picked.canceled) return;
      show(await picked.result.text());
    } catch { setPreview(words.cantOpen); setPending(null); }
  };
  const group = { borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden' as const };
  const field = { color: t.text, backgroundColor: t.yours, borderRadius: shape.card, padding: space.l, textAlignVertical: 'top' as const };

  return <ScrollView style={{ flex: 1, backgroundColor: t.sheet }} contentContainerStyle={{ padding: space.xl, paddingTop: inset + space.xl, gap: space.m, paddingBottom: space.xxl }} keyboardShouldPersistTaps="always">
    <Text style={[type.headline, { color: t.text }]}>{words.rowVoice}</Text>
    <Text style={[type.body, { color: t.muted, marginBottom: space.s }]}>{words.voiceNote}</Text>
    <Button kind="text" label={words.importFile} onPress={() => { void pick(); }} />
    {saveFailed && <Text style={[type.body, { color: t.text }]}>{words.failed}</Text>}
    {preview !== '' && <Card variant="filled">
      <Text style={[type.body, { color: t.text }]}>{preview}</Text>
      {pending !== null && <View style={styles.actions}>
        <Button kind="filled" label={words.addThese} onPress={() => { const next = merge(rules, pending); if (change(next)) { setNeverText(next.never.join('\n')); setPreview(words.added); setPending(null); } }} />
        <Button kind="text" label={words.cancel} onPress={() => { setPreview(''); setPending(null); }} />
      </View>}
    </Card>}
    <View style={group}>
      <Row title={words.ruleDashes} subtitle={words.ruleDashesNote}
        end={<View pointerEvents="none"><Switch value={rules.noDashes} onValueChange={v => change({ ...rules, noDashes: v })} /></View>}
        onPress={() => change({ ...rules, noDashes: !rules.noDashes })} />
      <Row title={words.ruleEndings} subtitle={words.ruleEndingsNote}
        end={<View pointerEvents="none"><Switch value={rules.statementEndings} onValueChange={v => change({ ...rules, statementEndings: v })} /></View>}
        onPress={() => change({ ...rules, statementEndings: !rules.statementEndings })} />
    </View>
    <Text style={[type.label, { color: t.text, marginTop: space.m }]}>{words.howIWrite}</Text>
    <TextInput accessibilityLabel={words.howIWrite} placeholder={words.howIWriteHint} placeholderTextColor={t.muted} multiline maxLength={300}
      autoCapitalize="sentences" value={rules.note} onChangeText={note => change({ ...rules, note })} style={[type.body, field, styles.tall]} />
    <Text style={[type.label, { color: t.text, marginTop: space.m }]}>{words.neverSay}</Text>
    <Text style={[type.note, { color: t.muted }]}>{words.neverSayHelp}</Text>
    <TextInput accessibilityLabel={words.neverSay} placeholder={words.neverSayHint} placeholderTextColor={t.muted} multiline
      value={neverText} onChangeText={text => { if (change({ ...rules, never: text.split('\n').map(x => x.trim()).filter(Boolean) })) setNeverText(text); }} style={[type.body, field, styles.wide]} />
    <Text style={[type.body, { color: t.muted, marginTop: space.m }]}>{words.wipeElsewhere}</Text>
    <Button kind="text" label={words.back} onPress={() => { if (shared) void Native.finishRewrite(null, false); else router.back(); }} />
  </ScrollView>;
}

const styles = {
  actions: { flexDirection: 'row' as const, gap: space.m, marginTop: space.m },
  tall: { minHeight: 72 },
  wide: { minHeight: 100 },
};
