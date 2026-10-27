import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Page } from '../src/ui/Page';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { Placeholder } from '../src/ui/Placeholder';
import { space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { cloudOf, getSource } from '../src/core/source';
import { billingOf } from '../src/chatgpt/cards';
import { SAMPLE_POST, TOUR_CALLS, countCall, finishTour, markDone, openTour, polishSample, tourState } from '../src/core/tour';

type Version = { text: string; label: string };

/** The short guided tour, opened after the person picks which one writes (scope report, decisions 1-3):
 *  one made-up post polished on their own account, the cost said plainly before the first call, the
 *  approved ceiling, and every failure recoverable in place. Progress is kept, so a rebuilt screen
 *  resumes instead of asking again, and a skipped tour is only ever offered on Home. */
export default function Tour() {
  const t = useTheme();
  const saved = tourState();
  const [stage, setStage] = useState<'start' | 'writing' | 'ready' | 'failed'>(saved.exercise === 'done' ? 'ready' : 'start');
  const [versions, setVersions] = useState<Version[]>([]);
  const [line, setLine] = useState('');
  const [calls, setCalls] = useState(saved.calls ?? 0);
  // Only a pay-per-use key is priced per call; a plan or a subscription is not.
  const [perUse, setPerUse] = useState(false);
  const mounted = useRef(true);
  // One run at a time: a version that lands after the deadline (or after a newer tap) never shows under
  // a failure line.
  const run = useRef(0);

  useEffect(() => {
    openTour();
    void getSource().then(source => { if (mounted.current) setPerUse(cloudOf(source) !== null && billingOf(cloudOf(source)!) === 'api'); }).catch(() => {});
    return () => { mounted.current = false; };
  }, []);

  const start = async () => {
    const id = ++run.current;
    setLine(''); setVersions([]); setStage('writing');
    const result = await polishSample({
      call: () => { if (mounted.current) setCalls(countCall()); },
      landed: (text, label) => { if (mounted.current && id === run.current) setVersions(shown => [...shown, { text, label }]); },
    });
    if (!mounted.current || id !== run.current) return;
    if (result.kind === 'ready') { markDone(); setStage('ready'); return; }
    setLine(result.line); setStage('failed');
  };
  const leave = (how: 'done' | 'skipped') => { finishTour(how); router.back(); };
  const skip = <Button kind="text" label={words.tourSkip} onPress={() => leave('skipped')} />;

  return <Page title={words.tourTitle} note={words.tourNote} onBack={() => router.back()}>
    <Card variant="filled" label={words.tourSample}>
      <Text style={[type.body, { color: t.text }]}>{SAMPLE_POST}</Text>
      <Text style={[type.note, { color: t.muted, marginTop: space.s }]}>{words.tourSampleNote}</Text>
    </Card>

    {stage === 'start' && <>
      {perUse && <Text style={[type.note, { color: t.muted }]}>{words.tourCostKey}</Text>}
      <View style={styles.actions}>
        <Button kind="filled" label={words.tourStart} onPress={() => void start()} />
        {skip}
      </View>
    </>}

    {stage === 'writing' && <>
      <Text style={[type.body, { color: t.muted }]}>{words.stillWorkingCloud}</Text>
      <Placeholder />
      {skip}
    </>}

    {versions.map(version => <Card key={`${version.label}:${version.text}`} variant="outlined" label={version.label}>
      <Text style={[type.body, { color: t.text }]}>{version.text}</Text>
    </Card>)}

    {stage === 'ready' && <>
      <Text style={[type.body, { color: t.text }]}>{words.tourDone}</Text>
      <View style={styles.actions}>
        <Button kind="filled" label={words.tourFinish} onPress={() => leave('done')} />
        {calls < TOUR_CALLS && <Button kind="text" label={words.tourAgain} onPress={() => void start()} />}
      </View>
    </>}

    {stage === 'failed' && <>
      <Text style={[type.body, { color: t.text }]}>{line}</Text>
      {calls < TOUR_CALLS
        ? <View style={styles.actions}><Button kind="filled" label={words.tryAgain} onPress={() => void start()} />{skip}</View>
        : <><Text style={[type.note, { color: t.muted }]}>{words.tourEnough}</Text>
          <View style={styles.actions}><Button kind="filled" label={words.tourFinish} onPress={() => leave('done')} /></View></>}
    </>}
  </Page>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, marginTop: space.s },
});
