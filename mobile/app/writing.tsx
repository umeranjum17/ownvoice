import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge } from '../src/ui/Badge';
import { Page } from '../src/ui/Page';
import { ChatIcon, EyeIcon, LockIcon } from '../src/ui/icons';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';

export default function Writing() {
  const t = useTheme();
  return <Page title={words.rowWriting} onBack={() => router.back()}>
    {([[LockIcon, words.privacyNote], [ChatIcon, words.switchNote], [EyeIcon, words.readsNote]] as const).map(([Icon, text]) =>
      <View key={text} style={[styles.card, { backgroundColor: t.group }]}>
        <Badge><Icon size={22} color={t.onPrimaryContainer} /></Badge>
        <Text style={[type.body, { color: t.text, flex: 1 }]}>{text}</Text>
      </View>)}
  </Page>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: space.l, borderRadius: shape.group, padding: space.l },
});
