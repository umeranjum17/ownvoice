import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { showsBubble } from '../src/core/privacy';
import { PHONE_ONLY_KEY, phoneOnly, setSource } from '../src/core/source';
import { completeSetup } from '../src/core/setup-completion';
import { store } from '../src/core/store';
import Native from '../modules/ownvoice-native';

type App = { app: string; label: string };

/** Which apps stay on this phone even when ChatGPT writes. The list routing actually reads. */
export default function GptApps() {
  const t = useTheme();
  const inset = useSafeAreaInsets().top;
  const [apps, setApps] = useState<App[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);
  const savingNow = useRef(false);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  const load = () => {
    setFailed(false);
    void Promise.all([Native.launcherApps(null), Native.bubbleRules()])
      .then(([shown, rules]) => {
        const visible = shown.filter(({ app }) => showsBubble(app, rules));
        const saved = phoneOnly(true);
        setChosen(Object.fromEntries(visible.map(({ app }) => [app, saved.includes(app)])));
        setApps(visible);
      })
      .catch(() => { setApps(null); setFailed(true); });
  };
  useEffect(load, []);

  return <View style={{ flex: 1, padding: space.xl, paddingTop: inset + space.xl, gap: space.l, backgroundColor: t.sheet }}>
    <Text style={[type.title, { color: t.text }]}>{words.phoneOnlyApps}</Text>
    <Text style={[type.body, { color: t.muted }]}>{words.phoneOnlyNote}</Text>
    <ScrollView keyboardShouldPersistTaps="always">
      {(apps ?? []).map(({ app, label }) => {
        const on = chosen[app] ?? false;
        return <Row key={app} title={label} subtitle={on ? words.on : words.off} onPress={() => {
          if (!savingNow.current) setChosen(current => ({ ...current, [app]: !on }));
        }} />;
      })}
    </ScrollView>
    {failed ? <Text style={[type.body, { color: t.muted }]}>{words.gptAppsUnavailable}</Text> : null}
    {failed ? <Button kind="text" label={words.tryAgain} onPress={load} /> : null}
    {doneError ? <Text style={[type.body, { color: t.muted }]}>{doneError}</Text> : null}
    {!failed ? <Button kind="filled" label={words.done} disabled={!apps} onPress={() => {
      if (!apps || savingNow.current) return;
      savingNow.current = true;
      setDoneError(null);
      void (async () => {
        const shown = new Set(apps.map(({ app }) => app));
        const on = [...phoneOnly(true).filter(app => !shown.has(app)), ...apps.filter(({ app }) => chosen[app]).map(({ app }) => app)];
        store.set(PHONE_ONLY_KEY, on);
        setSource('chatgpt');
        const fromSetup = !store.get('setup-done');
        if (fromSetup) await completeSetup();
        router.dismissAll();
        if (fromSetup) router.replace('/');
      })().catch(() => setDoneError(words.gptAppsSaveFailed)).finally(() => {
        savingNow.current = false;
      });
    }} /> : null}
    <Button kind="text" label={words.back} onPress={() => { if (!savingNow.current) router.back(); }} />
  </View>;
}
