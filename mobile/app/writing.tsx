import { ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../src/ui/Button';
import { space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';

export default function Writing() {
  const t = useTheme();
  const inset = useSafeAreaInsets().top;
  return <ScrollView style={{ flex: 1, backgroundColor: t.sheet }} contentContainerStyle={{ padding: space.xl, paddingTop: inset + space.xl, gap: space.l, paddingBottom: space.xxl }}>
    <Text style={[type.headline, { color: t.text }]}>{words.rowWriting}</Text>
    <Text style={[type.body, { color: t.text }]}>{words.privacyNote}</Text>
    <Text style={[type.body, { color: t.text }]}>{words.switchNote}</Text>
    <Text style={[type.body, { color: t.text }]}>{words.readsNote}</Text>
    <Button kind="text" label={words.back} onPress={() => router.back()} />
  </ScrollView>;
}
