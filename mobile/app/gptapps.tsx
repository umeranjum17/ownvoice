import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { CHATGPT_DEFAULT_OFF, showsBubble } from '../src/core/privacy';
import { gptApps, saveGptApps } from '../src/chatgpt/settings';
import { completeSetup } from '../src/core/setup-completion';
import { store } from '../src/core/store';
import Native from '../modules/ownvoice-native';

type App = { app: string; label: string };

export default function GptApps() {
  const t = useTheme();
  const [apps, setApps] = useState<App[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  const load = () => {
    setFailed(false);
    void Promise.all([Native.launcherApps(null), Native.bubbleRules()])
      .then(([shown, rules]) => {
        const visible = shown.filter(({ app }) => showsBubble(app, rules));
        const saved = gptApps();
        setChosen(Object.fromEntries(visible.map(({ app }) => [app, saved ? saved.on.includes(app) : !CHATGPT_DEFAULT_OFF.has(app)])));
        setApps(visible);
      })
      .catch(() => setFailed(true));
  };
  useEffect(load, []);

  return <View style={{ flex: 1, padding: space.xl, gap: space.l, backgroundColor: t.sheet }}>
    <Text style={[type.title, { color: t.text }]}>{words.gptAppsQuestion}</Text>
    <Text style={[type.body, { color: t.muted }]}>{words.gptAppsNote}</Text>
    <ScrollView keyboardShouldPersistTaps="always">
      {(apps ?? []).map(({ app, label }) => {
        const on = chosen[app] ?? false;
        return <Row key={app} disabled={!apps} title={label} subtitle={on ? words.on : words.off} onPress={() => {
          setChosen(current => ({ ...current, [app]: !on }));
        }} />;
      })}
    </ScrollView>
    {failed ? <Text style={[type.body, { color: t.muted }]}>{words.gptAppsUnavailable}</Text> : null}
    {failed ? <Button kind="text" label={words.tryAgain} onPress={load} /> : null}
    {doneError ? <Text style={[type.body, { color: t.muted }]}>{doneError}</Text> : null}
    <Button kind="filled" label={words.done} disabled={!apps} onPress={() => {
      if (!apps) return;
      setDoneError(null);
      void (async () => {
        if (!(await saveGptApps({ on: apps.filter(({ app }) => chosen[app]).map(({ app }) => app) }))) {
          setDoneError(words.gptAppsSignIn);
          return;
        }
        const fromSetup = !store.get('setup-done');
        if (fromSetup) await completeSetup();
        router.dismissAll();
        if (fromSetup) router.replace('/');
      })().catch(() => setDoneError(words.gptAppsSaveFailed));
    }} />
    <Button kind="text" label={words.back} onPress={() => router.back()} />
  </View>;
}
