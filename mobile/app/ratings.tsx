import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { connectJev, disconnectJev, status } from '../src/chatgpt/accounts';
import { jevEnabled, setJevEnabled } from '../src/chatgpt/settings';
import { words } from '../src/core/words';
import { Button } from '../src/ui/Button';
import { KeyConnect } from '../src/ui/KeyConnect';
import { Page } from '../src/ui/Page';
import { Row } from '../src/ui/Row';
import { Switch } from '../src/ui/Switch';
import { shape, space, type, useTheme } from '../src/ui/theme';

export default function Ratings() {
  const t = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    try { setEnabled(jevEnabled()); } catch { setProblem(words.jevSaveFailed); }
    void status('typesafe').then(now => { if (live) setConnected(now.state === 'ready'); })
      .catch(() => { if (live) setProblem(words.jevConnectFirst); });
    return () => { live = false; };
  }, []);
  const change = (on: boolean) => {
    try { setJevEnabled(on); setEnabled(on); setProblem(null); }
    catch { setProblem(words.jevSaveFailed); }
  };
  const connect = async (key: string) => {
    try { await connectJev(key); setConnected(true); setProblem(null); return true; }
    catch { setProblem(words.jevKeyFailed); return false; }
  };
  const forget = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setJevEnabled(false); setEnabled(false);
      await disconnectJev(); setConnected(false); setProblem(null);
    } catch { setProblem(words.jevForgetFailed); }
    finally { setBusy(false); }
  };
  return <Page title={words.jevTitle} note={words.jevNote} stickyTop onBack={() => router.back()}>
    <Text style={[type.body, { color: t.text }]}>{words.jevConsent}</Text>
    <Text style={[type.body, { color: t.text }]}>{words.jevCost}</Text>
    <Text style={[type.note, { color: t.muted }]}>{words.jevScope}</Text>
    <Text style={[type.note, { color: t.muted }]}>{words.jevOff}</Text>
    {connected === false && <KeyConnect paste={words.jevPaste} connect={words.jevConnect} onConnect={connect} />}
    {connected && <Text style={[type.note, { color: t.text }]}>{words.jevConnected}</Text>}
    <View style={[styles.group, { backgroundColor: t.group }]}>
      <Row title={words.jevUse} end={<Switch accessibilityLabel={words.jevUse} value={enabled} disabled={busy || (!connected && !enabled)} onValueChange={change} />} />
    </View>
    {connected && <Button kind="text" label={words.jevForget} disabled={busy} onPress={() => void forget()} />}
    {problem && <Text accessibilityRole="alert" style={[type.body, { color: t.text }]}>{problem}</Text>}
  </Page>;
}
const styles = StyleSheet.create({ group: { borderRadius: shape.group, overflow: 'hidden', marginVertical: space.s } });
