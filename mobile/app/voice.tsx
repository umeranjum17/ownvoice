import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { File } from 'expo-file-system';
import Native from '../modules/ownvoice-native';
import { Badge } from '../src/ui/Badge';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { Row } from '../src/ui/Row';
import { Page } from '../src/ui/Page';
import { Switch } from '../src/ui/Switch';
import { ChatIcon, CheckIcon, CloseIcon, FileIcon, PenIcon, PlusIcon } from '../src/ui/icons';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { merge, parse, type Found } from '../src/core/voice';
import { loadVoice, saveVoice } from '../src/core/voiceStore';
import type { Rules } from '../src/core/slop';

const SKIP_ONE = 'Left out 1 note that reads as advice, not a phrase.';
const SKIP_MANY = 'notes that read as advice, not phrases.';
/** One-tap starts for an empty list and an empty note: a person never has to invent the first one. */
const PHRASE_IDEAS = ['Cheers', 'Kind regards', 'No worries', 'Hope this helps'];
const STYLE_IDEAS = ['Short sentences', 'Friendly', 'Straight to the point', 'Casual', 'No emojis'];
const NOTE_MAX = 300;

/** [note] with [style] added at the end, or taken out when it is already there (any capitals). */
export function toggleStyle(note: string, style: string): string {
  const parts = note.split(',').map(x => x.trim()).filter(Boolean);
  const has = parts.some(x => x.toLowerCase() === style.toLowerCase());
  if (has) return parts.filter(x => x.toLowerCase() !== style.toLowerCase()).join(', ');
  return parts.length ? `${parts.join(', ')}, ${style.toLowerCase()}` : style;
}

/** What an import found, in the same words as the Kotlin preview. */
export function foundLines(found: Found): string {
  const lines: string[] = [words.foundHead];
  if (found.never.length) lines.push(`${words.foundNever} (${found.never.length}): ${found.never.map(x => `“${x}”`).join(', ')}`);
  if (found.samples.length) lines.push(`${words.foundSamples} (${found.samples.length}): ${found.samples.map(x => `“${x.length > 80 ? x.slice(0, 80) + '…' : x}”`).join(', ')}`);
  if (found.noDashes) lines.push(words.foundRuleDashes);
  if (found.statementEndings) lines.push(words.foundRuleEndings);
  if (found.skipped === 1) lines.push(SKIP_ONE);
  else if (found.skipped > 1) lines.push(`Left out ${found.skipped} ${SKIP_MANY}`);
  lines.push(words.foundRest);
  return lines.join('\n');
}

/** Your voice: a few rules, a "how I write" note, and the never-say phrases as chips, kept on this phone. */
export default function Voice({ shared = false }: { shared?: boolean }) {
  const t = useTheme();
  const [rules, setRules] = useState<Rules>(loadVoice);
  const [phrase, setPhrase] = useState('');
  const [preview, setPreview] = useState('');
  const [pending, setPending] = useState<Found | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // Everything on this screen saves as it changes, like VoiceActivity saving on pause.
  const change = (next: Rules): boolean => {
    try { saveVoice(next); setRules(next); setSaveFailed(false); return true; }
    catch { setSaveFailed(true); return false; }
  };
  // Typed or pasted phrases join the list once a line ends; a phrase already there isn't added twice.
  const add = (text: string) => {
    const fresh = text.split('\n').map(x => x.trim()).filter(x => x && !rules.never.some(y => y.toLowerCase() === x.toLowerCase()));
    if (!fresh.length || change({ ...rules, never: [...rules.never, ...new Set(fresh)] })) setPhrase('');
  };
  const typed = (text: string) => {
    if (!text.includes('\n')) { setPhrase(text); return; }
    const parts = text.split('\n');
    const rest = parts.pop() ?? '';
    add(parts.join('\n'));
    if (rest.trim()) setPhrase(rest);
  };
  const show = useCallback((markdown: string) => {
    const found = parse(markdown);
    if (!found.never.length && !found.noDashes && !found.statementEndings && !found.samples.length) { setPreview(words.foundNothing); setPending(null); return; }
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
  const field = { color: t.text, backgroundColor: t.raised, borderRadius: shape.card, paddingHorizontal: space.l, paddingVertical: space.m };
  // A suggestion pill: outlined with a plus to add, filled with a tick once it is in.
  const idea = (label: string, on: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: on }}
    accessibilityLabel={label} onPress={onPress} hitSlop={4} android_ripple={{ color: t.primary.slice(0, 7) + '1F', foreground: true }}
    style={[styles.chip, { borderWidth: 1 }, on ? { backgroundColor: t.primaryContainer, borderColor: t.primaryContainer } : { borderColor: t.outline }]}>
    {on ? <CheckIcon size={16} color={t.onPrimaryContainer} /> : <PlusIcon size={16} color={t.primary} />}
    <Text style={[type.label, { color: on ? t.onPrimaryContainer : t.text, flexShrink: 1 }]}>{label}</Text>
  </Pressable>;
  const styleOn = (style: string) => rules.note.split(',').some(x => x.trim().toLowerCase() === style.toLowerCase());
  const head = (Icon: typeof PenIcon, title: string) => <View style={styles.head}>
    <Badge><Icon size={22} color={t.onPrimaryContainer} /></Badge>
    <Text accessibilityRole="header" style={[type.heading, { color: t.text, fontSize: 18, lineHeight: 24 }]}>{title}</Text>
  </View>;

  return <Page title={words.rowVoice} note={words.voiceNote} stickyTop onBack={() => { if (shared) void Native.finishRewrite(null, false); else router.back(); }}>
    {saveFailed && <Text style={[type.body, { color: t.text }]}>{words.failed}</Text>}
    {preview !== '' && <Card variant="filled">
      <Text style={[type.body, { color: t.text }]}>{preview}</Text>
      {pending !== null && <View style={styles.actions}>
        <Button kind="filled" label={words.addThese} onPress={() => { if (change(merge(rules, pending))) { setPreview(words.added); setPending(null); } }} />
        <Button kind="text" label={words.cancel} onPress={() => { setPreview(''); setPending(null); }} />
      </View>}
    </Card>}
    <View style={[styles.section, { backgroundColor: t.group }]}>
      {head(ChatIcon, words.neverSay)}
      <Text style={[type.note, { color: t.muted }]}>{words.neverSayHelp}</Text>
      <View style={styles.chips}>
        {rules.never.length ? rules.never.map(x => <Pressable key={x} accessibilityRole="button" accessibilityLabel={`${words.removePhrase} ${x}`}
          onPress={() => change({ ...rules, never: rules.never.filter(y => y !== x) })} hitSlop={4}
          android_ripple={{ color: t.text + '1F', foreground: true }} style={[styles.chip, { backgroundColor: t.primaryContainer }]}>
          <Text style={[type.label, { color: t.onPrimaryContainer, flexShrink: 1 }]}>{x}</Text>
          <CloseIcon size={16} color={t.onPrimaryContainer} />
        </Pressable>) : <>
          <Text style={[type.note, { color: t.muted, width: '100%' }]}>{words.neverSayNone}</Text>
          {PHRASE_IDEAS.map(x => idea(x, false, () => add(x)))}
        </>}
      </View>
      <View style={styles.addRow}>
        <TextInput accessibilityLabel={words.neverSay} placeholder={words.neverSayHint} placeholderTextColor={t.muted} value={phrase}
          onChangeText={typed} onSubmitEditing={() => add(phrase)} submitBehavior="submit" returnKeyType="done" style={[type.body, field, { flex: 1, minHeight: 48 }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={words.addPhrase} disabled={!phrase.trim()} onPress={() => add(phrase)}
          android_ripple={{ color: t.onPrimary + '1F', foreground: true }} style={[styles.plus, { backgroundColor: phrase.trim() ? t.primary : t.text + '1F' }]}>
          <PlusIcon size={22} color={phrase.trim() ? t.onPrimary : t.muted} />
        </Pressable>
      </View>
    </View>
    <View style={[styles.section, { backgroundColor: t.group }]}>
      {head(PenIcon, words.howIWrite)}
      <TextInput accessibilityLabel={words.howIWrite} placeholder={words.howIWriteHint} placeholderTextColor={t.muted} multiline maxLength={NOTE_MAX}
        autoCapitalize="sentences" value={rules.note} onChangeText={note => change({ ...rules, note })} style={[type.body, field, { minHeight: 88, textAlignVertical: 'top' }]} />
      <Text style={[type.note, { color: t.muted }]}>{words.howIWriteIdeas}</Text>
      <View style={styles.chips}>
        {STYLE_IDEAS.map(x => idea(x, styleOn(x), () => {
          const note = toggleStyle(rules.note, x);
          if (note.length <= NOTE_MAX) change({ ...rules, note });
        }))}
      </View>
    </View>
    <Text style={[type.label, { color: t.primary, marginTop: space.s }]}>{words.rulesTitle}</Text>
    <View style={[styles.group, { backgroundColor: t.group }]}>
      <Row title={words.ruleDashes} subtitle={words.ruleDashesNote}
        end={<View pointerEvents="none"><Switch value={rules.noDashes} onValueChange={v => change({ ...rules, noDashes: v })} /></View>}
        onPress={() => change({ ...rules, noDashes: !rules.noDashes })} />
      <Row title={words.ruleEndings} subtitle={words.ruleEndingsNote}
        end={<View pointerEvents="none"><Switch value={rules.statementEndings} onValueChange={v => change({ ...rules, statementEndings: v })} /></View>}
        onPress={() => change({ ...rules, statementEndings: !rules.statementEndings })} />
    </View>
    <View style={[styles.group, { backgroundColor: t.group }]}>
      <Row lead={<Badge><FileIcon size={22} color={t.onPrimaryContainer} /></Badge>} title={words.importFile} onPress={() => { void pick(); }} />
    </View>
    <Text style={[type.note, { color: t.muted, textAlign: 'center', marginTop: space.s }]}>{words.wipeElsewhere}</Text>
  </Page>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.m, marginTop: space.m },
  section: { borderRadius: shape.group, padding: space.l, gap: space.m },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 36, borderRadius: shape.round, paddingLeft: space.m, paddingRight: space.s, overflow: 'hidden', maxWidth: '100%' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  plus: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  group: { borderRadius: shape.group, overflow: 'hidden', paddingVertical: space.xs },
});
