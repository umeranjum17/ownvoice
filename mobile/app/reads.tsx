import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { readLog } from '../src/core/reads';
import { plain } from '../src/core/privacy';
import { words } from '../src/core/words';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { space, type, useTheme } from '../src/ui/theme';

export default function Reads() {
  const t = useTheme();
  return <View style={{ flex: 1, padding: space.xl, gap: space.l, backgroundColor: t.sheet }}>
    <Text style={[type.title, { color: t.text }]}>{words.readsTitle}</Text>
    <Text style={[type.body, { color: t.muted }]}>{words.readsNote}</Text>
    <ScrollView>
      {readLog().slice().reverse().map((read, index) =>
        <Row key={`${read.time}-${index}`} title={`${read.label} · ${new Date(read.time).toLocaleString()}`} subtitle={`${plain(read.summary)}${read.sent && !read.summary.includes('Sent to ChatGPT.') ? ' Sent to ChatGPT.' : ''}`} />)}
    </ScrollView>
    <Button kind="text" label={words.back} onPress={() => router.back()} />
  </View>;
}
