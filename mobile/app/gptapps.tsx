import { useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Empty } from '../src/ui/Empty';
import { Page } from '../src/ui/Page';
import { Row } from '../src/ui/Row';
import { Switch } from '../src/ui/Switch';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { showsBubble } from '../src/core/privacy';
import { PHONE_ONLY_KEY, getSource, phoneOnly, setSource } from '../src/core/source';
import { completeSetup } from '../src/core/setup-completion';
import { store } from '../src/core/store';
import Native from '../modules/ownvoice-native';

type App = { app: string; label: string; icon?: string | null };

/** Which apps stay on this phone even when ChatGPT writes (the list routing actually reads):
 *  the same icon-and-switch list as Where the bubble shows, staged until Done. */
export default function GptApps() {
  const t = useTheme();
  const [apps, setApps] = useState<App[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);
  const savingNow = useRef(false);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  const load = () => {
    setFailed(false);
    void Promise.all([Native.launcherApps(null), Native.bubbleRules(), getSource()])
      .then(async ([shown, rules]) => {
        const visible = shown.filter(({ app }) => showsBubble(app, rules));
        const saved = phoneOnly(true);
        setChosen(Object.fromEntries(visible.map(({ app }) => [app, saved.includes(app)])));
        // Launcher icons only come back for a named list; without them the rows still work.
        const icons = await Native.launcherApps(visible.map(({ app }) => app)).catch(() => []);
        const iconOf = new Map(icons.map(({ app, icon }) => [app, icon]));
        setApps(visible.map(row => ({ ...row, icon: iconOf.get(row.app) ?? null })));
      })
      .catch(() => { setApps(null); setFailed(true); });
  };
  useEffect(load, []);

  const done = () => {
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
  };
  const flip = (app: string, on: boolean) => { if (!savingNow.current) setChosen(current => ({ ...current, [app]: !on })); };

  return <Page title={words.phoneOnlyApps} note={words.phoneOnlyNote} onBack={() => { if (!savingNow.current) router.back(); }}
    footer={failed ? undefined : <>
      {doneError ? <Text style={[type.body, { color: t.text, textAlign: 'center' }]}>{doneError}</Text> : null}
      <Button kind="filled" large label={words.done} disabled={!apps} onPress={done} />
    </>}>
    {failed
      ? <Empty mood="check" text={words.gptAppsUnavailable}><Button kind="filled" label={words.tryAgain} onPress={load} /></Empty>
      : <View style={{ borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden', paddingVertical: space.xs }}>
        {(apps ?? []).map(({ app, label, icon }) => {
          const on = chosen[app] ?? false;
          return <Row key={app} title={label} subtitle={on ? words.on : words.off}
            lead={icon ? <Image source={{ uri: `data:image/png;base64,${icon}` }} style={{ width: 40, height: 40, borderRadius: 12 }} accessibilityIgnoresInvertColors /> : undefined}
            end={<View pointerEvents="none"><Switch accessibilityLabel={label} value={on} onValueChange={() => {}} /></View>}
            onPress={() => flip(app, on)} />;
        })}
      </View>}
  </Page>;
}
