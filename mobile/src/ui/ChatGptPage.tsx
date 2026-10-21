import { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button } from './Button';
import { space, type, useTheme } from './theme';
import { words } from '../core/words';

// Required lazily: the real accounts pull in the phone's secure storage, which no jest run has.
const live = () => require('../chatgpt/accounts') as typeof import('../chatgpt/accounts');

/** ChatGPT's own page, opened right here: the one approval is on that page. The kit watches where it
 *  sends the browser and finishes the sign-in with that address, so nothing is copied or typed. A page
 *  that was closed opens again from the button, and a code stays one tap away. */
export function ChatGptPage({ url }: { url: string }) {
  const t = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const watch = ({ url: next }: { url: string }) => {
    const back = live().signInState('chatgpt')?.returnTo;
    if (!back || !next.startsWith(back)) return true;
    setOpen(false);
    live().completeSignIn('chatgpt', next).catch((e: Error) => setNote(e.message || words.failed));
    return false; // nothing on the phone answers that address
  };
  return <View style={[styles.box, { backgroundColor: t.group }]}>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={[styles.page, { backgroundColor: t.card, paddingTop: top, paddingBottom: bottom }]}>
        <WebView testID="chatgpt-page" source={{ uri: url }} onShouldStartLoadWithRequest={watch} style={styles.web} />
        <Button kind="text" label={words.closePage} onPress={() => setOpen(false)} />
      </View>
    </Modal>
    <Button kind="filled" label={words.openChatGpt} onPress={() => setOpen(true)} />
    <Button kind="text" label={words.useCode} onPress={() => { setOpen(false); void live().signIn('chatgpt', 'code').catch(() => setNote(words.failed)); }} />
    <View style={styles.waiting}>
      <ActivityIndicator size="small" color={t.primary} />
      <Text style={[type.note, { color: t.muted }]}>{note ?? words.waiting}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  box: { borderRadius: 20, padding: space.l, gap: space.s },
  page: { flex: 1 },
  web: { flex: 1 },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: space.s },
});
