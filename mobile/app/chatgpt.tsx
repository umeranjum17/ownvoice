import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { Row } from '../src/ui/Row';
import { space, type, useTheme } from '../src/ui/theme';
import { words, CHATGPT_TERMS } from '../src/core/words';
import { session, nothing, type GptState } from '../src/chatgpt/session';
import { gptApps } from '../src/chatgpt/settings';
import Native from '../modules/ownvoice-native';

/** Signing in to the person's own ChatGPT plan: one button, a code to type on the page that opens,
 *  and byokit's plain sentences for what happened. Everything here is optional; the phone writes without it. */
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
    if (state?.signedIn && !gptApps()) router.push('/gptapps');
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

  const signedIn = !!state?.signedIn;
  return <ScrollView style={{ flex: 1, backgroundColor: t.sheet }} contentContainerStyle={{ padding: space.xl, gap: space.l }}>
    <Text style={[type.headline, { color: t.text }]}>{words.gptTitle}</Text>
    {signedIn
      ? <>
        <Text style={[type.body, { color: t.text }]}>{state?.note ?? words.gptSignedInNow}</Text>
        <View style={{ borderRadius: 20, backgroundColor: t.group, overflow: 'hidden' }}>
          <Row title={words.gptApps} onPress={() => router.push('/gptapps')} />
        </View>
        <Button kind="text" label={words.gptSignOut} onPress={() => { void session.signOut().then(show).catch(() => { if (live.current) setState(current => ({ ...(current ?? nothing), note: words.gptSignOutFailed })); }); }} />
      </>
      : <>
        <Text style={[type.body, { color: t.text }]}>{words.gptNote}</Text>
        {state?.waiting && <Card variant="outlined" label={words.gptTitle}>
          {state.code
            ? <>
              <Text accessibilityLabel={`Code ${state.code}`} style={[type.headline, { color: t.text, letterSpacing: 4, textAlign: 'center', paddingVertical: space.m }]}>{state.code}</Text>
              <View style={{ flexDirection: 'row', gap: space.s, justifyContent: 'center' }}>
                <Button kind="text" label={words.copy} onPress={() => { void Native.copy(state.code ?? '').catch(() => {}); }} />
                {state.url ? <Button kind="text" label={words.gptOpenPage} onPress={() => openPage(state.url)} /> : null}
              </View>
            </>
            : null}
          <Text style={[type.body, { color: t.muted, paddingTop: space.s }]}>{state.note}</Text>
        </Card>}
        <Button kind="filled" disabled={state?.waiting} label={words.gptButton} onPress={start} />
        {state?.waiting ? <Button kind="text" label={words.gptCancel} onPress={() => { void session.cancel().then(show).catch(() => show(nothing)); }} /> : null}
        {!state?.waiting && state?.note ? <Text style={[type.body, { color: t.text }]}>{state.note}</Text> : null}
        <Text style={[type.note, { color: t.muted }]}>{CHATGPT_TERMS}</Text>
      </>}
    <Button kind="text" label={words.back} onPress={() => { router.back(); }} />
  </ScrollView>;
}
