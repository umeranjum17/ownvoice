import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { Page } from '../src/ui/Page';
import { type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { appBuild, appVersion, helperMatch, isRelease, versionName } from '../src/core/version';
import { helperVersion } from '../src/computer/link';

type Helper = Awaited<ReturnType<typeof helperVersion>>;

/** About: which version of Ownvoice is running, whether it is a release or a pre-release build, and how it lines up with the paired computer helper. */
export default function About() {
  const t = useTheme();
  const [helper, setHelper] = useState<Helper | null>(null);
  useEffect(() => { void helperVersion().then(setHelper).catch(() => {}); }, []);
  const app = appVersion();
  const build = appBuild();
  const match = helper?.reachable ? helperMatch(app, helper.version) : 'unknown';
  const hint = !helper?.paired ? null : !helper.reachable ? words.aboutHelperUnreachable
    : !helper.version ? words.aboutHelperUnknown
    : match === 'helper-older' ? words.aboutHelperOlder : match === 'helper-newer' ? words.aboutHelperNewer : words.aboutHelperSame;
  return <Page title={words.aboutTitle} onBack={() => router.back()} stickyTop>
    <Text style={[type.title, { color: t.text }]}>{`${words.aboutVersion} ${versionName() ?? ''}`.trim()}</Text>
    {build != null && <Text style={[type.body, { color: t.muted }]}>{`${words.aboutBuild} ${build}`}</Text>}
    <Text style={[type.body, { color: t.text }]}>{isRelease() ? words.aboutRelease : words.aboutPreRelease}</Text>
    {helper && <Text style={[type.title, { color: t.text }]}>{helper.paired ? `${words.aboutHelper} ${helper.version ?? ''}`.trim() : words.aboutHelperNone}</Text>}
    {hint && <Text accessibilityRole={match === 'same' ? undefined : 'alert'} style={[type.body, { color: t.text }]}>{hint}</Text>}
  </Page>;
}
