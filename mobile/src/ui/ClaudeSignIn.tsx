import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from './Button';
import { shape, space, type, useTheme } from './theme';
import { words } from '../core/words';

/** Claude's paste-back sign-in, in one piece: open Claude's own page already signed in, then copy the
 *  code it shows and paste it here. The kit's paste seam takes that code, so How Ownvoice writes and
 *  the first-run wizard share this and neither carries a second copy of it. */
export function ClaudeSignIn({ url, testID = 'claude-paste', onOpen, onConnect }: {
  url: string | null;
  testID?: string;
  onOpen: () => void;
  /** Hand the pasted code to the kit; return whether it was accepted, so a good one clears the field. */
  onConnect: (code: string) => boolean;
}) {
  const t = useTheme();
  const [pasted, setPasted] = useState('');
  const submit = () => { if (onConnect(pasted.trim())) setPasted(''); };
  return <View style={[styles.code, { backgroundColor: t.group }]}>
    <Button kind="filled" disabled={!url} label={words.claudeOpen} onPress={onOpen} />
    <TextInput
      testID={testID}
      accessibilityLabel={words.claudePasteField}
      value={pasted}
      onChangeText={setPasted}
      placeholder={words.claudePasteField}
      autoCapitalize="none"
      autoCorrect={false}
      style={[styles.paste, { color: t.text, borderColor: t.line }]}
      placeholderTextColor={t.muted}
    />
    <Button kind="filled" disabled={!pasted.trim()} label={words.claudeConnect} onPress={submit} />
    <View style={styles.waiting}>
      <ActivityIndicator size="small" color={t.primary} />
      <Text style={[type.note, { color: t.muted }]}>{words.waiting}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  paste: { borderWidth: 1, borderRadius: shape.group, paddingVertical: 10, paddingHorizontal: 12, marginTop: space.s },
  code: { borderRadius: shape.group, padding: space.l, gap: space.xs },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: space.s },
});
