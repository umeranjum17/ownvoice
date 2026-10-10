import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button } from './Button';
import { shape, space, useTheme } from './theme';
import { words } from '../core/words';

/** OpenRouter's key sign-in, in one piece: paste the person's own OpenRouter key and hand it to the
 *  kit's key route. There is no page to open and nothing to wait for; a key the kit refuses keeps the
 *  field so it can be corrected. The key is masked on screen and never kept anywhere but the app's store. */
export function OpenRouterKey({ testID = 'openrouter-paste', onConnect }: {
  testID?: string;
  /** Hand the pasted key to the kit; return whether it was accepted, so a good one clears the field. */
  onConnect: (key: string) => Promise<boolean>;
}) {
  const t = useTheme();
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy || !pasted.trim()) return;
    setBusy(true);
    try { if (await onConnect(pasted.trim())) setPasted(''); }
    finally { setBusy(false); }
  };
  return <View style={[styles.box, { backgroundColor: t.group }]}>
    <TextInput
      testID={testID}
      accessibilityLabel={words.openrouterPasteField}
      value={pasted}
      onChangeText={setPasted}
      placeholder={words.openrouterPasteField}
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry
      style={[styles.paste, { color: t.text, borderColor: t.line }]}
      placeholderTextColor={t.muted}
    />
    <Button kind="filled" disabled={busy || !pasted.trim()} label={words.openrouterConnect} onPress={submit} />
  </View>;
}

const styles = StyleSheet.create({
  box: { borderRadius: shape.group, padding: space.l, gap: space.s },
  paste: { borderWidth: 1, borderRadius: shape.group, paddingVertical: 10, paddingHorizontal: 12 },
});
