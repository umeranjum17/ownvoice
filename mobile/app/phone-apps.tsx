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
import { PHONE_ONLY_KEY, getSource, phoneOnly } from '../src/core/source';
import { store } from '../src/core/store';
import Native from '../modules/ownvoice-native';

type App = { app: string; label: string; icon: string | null };

/** Apps that stay on this phone even when ChatGPT writes: one switch per app the bubble shows in,
 *  saved on each tap. Apps the bubble doesn't show in keep whatever was chosen for them. */
export default function PhoneApps() {
  const t = useTheme();
  const [apps, setApps] = useState<App[] | null>(null);
  const [stays, setStays] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const busy = useRef(Promise.resolve());

  const load = () => {
    setFailed(false);
    // getSource first: an older ChatGPT app list becomes this list before it is read.
    void getSource()
      .then(() => Promise.all([Native.launcherApps(null), Native.bubbleRules()]))
      .then(async ([shown, rules]) => {
        const visible = shown.filter(({ app }) => showsBubble(app, rules));
        const saved = phoneOnly(true);
        // Launcher icons only come back for a named list.
        const withIcons = await Native.launcherApps(visible.map(({ app }) => app)).catch(() => visible);
        // Staying apps first, in the order they were on arrival: rows don't jump under a tap.
        const order = (a: App, b: App) => Number(saved.includes(b.app)) - Number(saved.includes(a.app)) || a.label.localeCompare(b.label);
        setStays(saved);
        setApps(withIcons.filter(({ app }) => visible.some(v => v.app === app)).sort(order));
      })
      .catch(() => { setApps(null); setFailed(true); });
  };
  useEffect(load, []);

  const toggle = (app: string) => {
    busy.current = busy.current.then(async () => {
      const current = phoneOnly(true);
      const next = current.includes(app) ? current.filter(a => a !== app) : [...current, app];
      store.set(PHONE_ONLY_KEY, next);
      setStays(next);
      setSaveFailed(false);
    }).catch(() => setSaveFailed(true));
  };

  return <Page title={words.phoneOnlyApps} note={words.phoneOnlyNote} stickyTop onBack={() => router.back()}>
    {saveFailed && <Text style={[type.body, { color: t.text }]}>{words.gptAppsSaveFailed}</Text>}
    {failed && <Empty mood="check" text={words.gptAppsUnavailable}><Button kind="filled" label={words.tryAgain} onPress={load} /></Empty>}
    {!!apps?.length && <View style={{ borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden', paddingVertical: space.xs }}>
      {apps.map(({ app, label, icon }) => {
        const on = stays.includes(app);
        return <Row key={app}
          lead={icon ? <Image source={{ uri: `data:image/png;base64,${icon}` }} style={{ width: 40, height: 40, borderRadius: 12 }} accessibilityIgnoresInvertColors /> : undefined}
          title={label} subtitle={on ? words.on : words.off}
          end={<View pointerEvents="none"><Switch accessibilityLabel={label} value={on} onValueChange={() => toggle(app)} /></View>}
          onPress={() => toggle(app)} />;
      })}
    </View>}
    {apps?.length === 0 && <Text style={[type.body, { color: t.muted }]}>{words.noApps}</Text>}
  </Page>;
}
