import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge } from '../src/ui/Badge';
import { Button } from '../src/ui/Button';
import { Dot } from '../src/ui/Dot';
import { Page } from '../src/ui/Page';
import { Row } from '../src/ui/Row';
import { GridIcon, LockIcon } from '../src/ui/icons';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words, CHATGPT_TERMS } from '../src/core/words';
import { session, nothing, type GptState } from '../src/chatgpt/session';
import { PHONE_ONLY_KEY } from '../src/core/source';
import { store } from '../src/core/store';
import Native from '../modules/ownvoice-native';

/** Signing in to the person's own ChatGPT plan, in the same look as setup's sign-in step: one big button,
 *  the code in its own card while it waits, and Dot once it's connected. Everything here is optional. */
export default function ChatGpt() {
  const t = useTheme();
  const [state, setState] = useState<GptState | null>(null);
  const live = useRef(true);
  const show = (next: GptState) => { if (live.current) setState(next); };

  useEffect(() => {
    live.current = true;
    void session.current().then(show).catch(() => show(nothing));
    return () => { live.current = false; };
  }, []);

  // The approval happens outside the app, so the screen looks again while a code waits.
  useEffect(() => {
    if (!state?.waiting) return;
    const id = setInterval(() => { void session.current().then(show).catch(() => {}); }, 1000);
    return () => clearInterval(id);
  }, [state?.waiting]);

  useEffect(() => {
    if (state?.signedIn && !store.get(PHONE_ONLY_KEY)) router.push('/gptapps');
  }, [state?.signedIn]);

  const openPage = (url: string | null) => {
    if (!url) return;
    void Linking.openURL(url).catch(() => { if (live.current) setState(current => ({ ...(current ?? nothing), note: words.gptPageFailed })); });
  };

  const start = () => {
    void session.start().then(next => {
      show(next);
      openPage(next.url);
    }).catch(() => show({ ...nothing, note: words.failed }));
  };

  const copyAndOpen = () => {
    if (!state?.code) return;
    void Native.copy(state.code).catch(() => {});
    openPage(state.url);
  };

  const cancel = () => { void session.cancel().then(show).catch(() => show(nothing)).finally(() => router.back()); };
  const signOut = () => { void session.signOut().then(show).catch(() => { if (live.current) setState(current => ({ ...(current ?? nothing), note: words.gptSignOutFailed })); }); };
  const privacy = <View style={[styles.card, { backgroundColor: t.group }]}>
    <Badge><LockIcon size={22} color={t.onPrimaryContainer} /></Badge>
    <Text style={[type.body, { color: t.text, flex: 1 }]}>{`${words.privacyGpt} ${words.sentOnlyOnTap}`}</Text>
  </View>;

  if (state?.signedIn) return <Page title={words.gptTitle} onBack={() => router.back()}>
    <View style={styles.dot}><Dot mood="done" size={112} /></View>
    <Text style={[type.heading, { color: t.text, textAlign: 'center' }]}>{state.note ?? words.gptSignedInNow}</Text>
    <Text style={[type.body, { color: t.muted, textAlign: 'center', marginBottom: space.s }]}>{words.connectedNote}</Text>
    {privacy}
    <View style={[styles.group, { backgroundColor: t.group }]}>
      <Row lead={<Badge><GridIcon size={22} color={t.onPrimaryContainer} /></Badge>} title={words.phoneOnlyApps} onPress={() => router.push('/gptapps')} />
    </View>
    <View style={styles.end}><Button kind="text" label={words.gptSignOut} onPress={signOut} /></View>
  </Page>;

  if (state?.waiting) return <Page title={words.signInTitle} note={words.signInNote} onBack={cancel}>
    <View style={[styles.code, { backgroundColor: t.raised }]}>
      {state.code ? <>
        <Text style={[type.label, { color: t.muted, textAlign: 'center' }]}>{words.yourCode}</Text>
        <Text accessibilityLabel={`${words.yourCode} ${state.code.split('').join(' ')}`} style={[type.headline, styles.codeText, { color: t.text }]}>{state.code}</Text>
      </> : null}
      <View style={styles.waiting}>
        <ActivityIndicator size="small" color={t.primary} />
        <Text style={[type.note, { color: t.muted, flexShrink: 1 }]}>{state.note ?? words.waiting}</Text>
      </View>
    </View>
    <Button kind="filled" large disabled={!state.code} label={words.copyAndOpen} onPress={copyAndOpen} />
    <View style={styles.end}><Button kind="text" label={words.gptCancel} onPress={cancel} /></View>
  </Page>;

  return <Page title={words.gptTitle} note={words.gptNote} onBack={() => router.back()}>
    {state?.note ? <View style={[styles.card, { backgroundColor: t.raised }]}>
      <Dot mood="check" size={40} />
      <Text style={[type.body, { color: t.text, flex: 1 }]}>{state.note}</Text>
    </View> : null}
    {privacy}
    <Button kind="filled" large label={words.gptButton} onPress={start} />
    <Text style={[type.note, { color: t.muted, textAlign: 'center' }]}>{CHATGPT_TERMS}</Text>
  </Page>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: space.l, borderRadius: shape.group, padding: space.l },
  group: { borderRadius: shape.group, overflow: 'hidden' },
  code: { borderRadius: shape.group, padding: space.l, gap: space.xs },
  codeText: { letterSpacing: 4, textAlign: 'center', paddingVertical: space.m },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: space.s },
  dot: { alignItems: 'center', marginBottom: space.s },
  end: { alignItems: 'center' },
});
