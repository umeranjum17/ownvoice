import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { chatgptAllowed, showsBubble } from '../src/core/privacy';
import { gptChoice, setGptApp } from '../src/chatgpt/settings';
import Native from '../modules/ownvoice-native';

type App = { app: string; label: string };

/** "Apps that can use ChatGPT": the apps the bubble already shows in, each on the ChatGPT default
 *  (private workplace chats start off) until the person chooses otherwise. */
export default function GptApps() {
  const t = useTheme();
  const [apps, setApps] = useState<App[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [, setChosen] = useState(0);

  const load = () => {
    setFailed(false);
    void Promise.all([Native.launcherApps(null), Native.bubbleRules()])
      .then(([shown, rules]) => setApps(shown.filter(({ app }) => showsBubble(app, rules))))
      .catch(() => setFailed(true));
  };
  useEffect(load, []);

  return <View style={{ flex: 1, padding: space.xl, gap: space.l, backgroundColor: t.sheet }}>
    <Text style={[type.title, { color: t.text }]}>{words.gptApps}</Text>
    <Text style={[type.body, { color: t.muted }]}>{words.gptAppsNote}</Text>
    <ScrollView keyboardShouldPersistTaps="always">
      {(apps ?? []).map(({ app, label }) => {
        const on = chatgptAllowed(app, true, gptChoice(app));
        return <Row key={app} disabled={!apps} title={label} subtitle={on ? words.on : words.off} onPress={() => {
          setGptApp(app, !on);
          setChosen(current => current + 1);
        }} />;
      })}
    </ScrollView>
    {failed ? <Text style={[type.body, { color: t.muted }]}>{words.gptAppsUnavailable}</Text> : null}
    {failed ? <Button kind="text" label={words.tryAgain} onPress={load} /> : null}
    <Button kind="text" label="Back" onPress={() => { router.back(); }} />
  </View>;
}
