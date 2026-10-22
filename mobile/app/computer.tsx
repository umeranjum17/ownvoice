import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Page } from '../src/ui/Page';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { getSource, setSource } from '../src/core/source';
import { computerName, forgetComputer, pairComputer } from '../src/computer/link';

/** Use my computer: pair with the computer running the Ownvoice helper, then choose it as the writer or go back to this phone. */
export default function Computer() {
  const t = useTheme();
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [using, setUsing] = useState(false);
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const load = () => Promise.all([computerName(), getSource()]).then(([n, s]) => { setName(n); setUsing(s === 'computer'); }).catch(() => setProblem(words.computerProblem));
  useEffect(() => { void load(); }, []);

  const run = (job: () => Promise<void>) => { setProblem(null); job().catch(() => setProblem(words.computerProblem)).finally(() => setCheck(null)); };
  const pair = () => run(async () => {
    await pairComputer(code, setCheck);
    setSource('computer');
    setCode('');
    await load();
  });
  const choose = (source: 'computer' | 'phone') => { setSource(source); setUsing(source === 'computer'); };
  const forget = () => run(async () => {
    await forgetComputer();
    if (using) setSource(null);
    await load();
  });

  return <Page title={words.rowComputer} note={words.computerBody} stickyTop onBack={() => router.back()}>
    {!!problem && <Text style={[type.body, { color: t.text }]}>{problem}</Text>}
    {name === undefined ? null : name ? <>
      <Text style={[type.title, { color: t.text }]}>{words.computerPaired.replace('{name}', name)}</Text>
      <Text style={[type.body, { color: t.muted }]}>{words.computerBackup}</Text>
      {using
        ? <Button kind="tonal" label={words.computerUsePhone} onPress={() => choose('phone')} />
        : <Button kind="filled" label={words.computerUse} onPress={() => choose('computer')} />}
      <Button kind="text" label={words.computerForget} onPress={forget} />
    </> : check ? <Text accessibilityRole="alert" style={[type.body, { color: t.text }]}>{`${words.computerCheck}\n\n${check}`}</Text> : <>
      <TextInput accessibilityLabel={words.computerPaste} placeholder={words.computerPaste} placeholderTextColor={t.muted} value={code} onChangeText={setCode}
        autoCapitalize="none" autoCorrect={false} style={{ borderRadius: shape.group, backgroundColor: t.group, color: t.text, padding: space.l }} />
      <View><Button kind="filled" label={words.computerPair} disabled={!code.trim()} onPress={pair} /></View>
    </>}
  </Page>;
}
