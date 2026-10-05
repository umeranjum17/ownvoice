import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { InferState } from '@byokit/infer';
import { Button } from './Button';
import { CheckIcon } from './icons';
import { Progress } from './Progress';
import { Row } from './Row';
import { shape, space, type, useTheme } from './theme';
import { words } from '../core/words';
import { agreed, downloading, getReady, modelStatus, removeDownload, watch } from '../core/phoneDownload';

/** What the chosen "On this phone" card says: ready, the one-time ask, the bar while it gets ready,
 *  a way on when it stopped, and freeing the space again. Shown only once this phone is the chosen writer. */
export function PhoneWriter() {
  const t = useTheme();
  const [model, setModel] = useState<InferState | null>(null);
  const [fraction, setFraction] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [, setTick] = useState(0);

  const refresh = () => {
    setTick(n => n + 1);
    void modelStatus().then(setModel).catch(() => setModel('unsupported' as InferState));
  };
  useEffect(() => {
    refresh();
    return watch(value => { if (value == null) refresh(); else { setFraction(value); setTick(n => n + 1); } });
  }, []);

  const start = (mobileData = false) => { setFraction(0); void getReady(mobileData).catch(() => {}); refresh(); };
  const remove = () => { setConfirming(false); setRemoveFailed(false); void removeDownload().catch(() => setRemoveFailed(true)).finally(refresh); };

  const yes = agreed();
  const getting = model === ('installing' as any) || downloading();
  const stopped = model === ('not-installed' as any) && yes && !getting;
  const ask = model === ('not-installed' as any) && !yes;
  const removable = model === ('ready' as any) && yes;
  const line = (text: string, color = t.text) => <Text style={[type.note, styles.words, { color }]}>{text}</Text>;

  if (model == null || model === ('unsupported' as any)) return null;
  if (ask) return <View style={styles.indent}>
    <Text style={[type.label, { color: t.text }]}>{words.readyTitle}</Text>
    {line(words.readyNote, t.muted)}
    <View style={styles.actions}><Button kind="filled" label={words.getReady} onPress={() => start()} /></View>
  </View>;
  if (getting) return <View style={styles.indent}>
    {line(words.gettingReady)}
    <Progress fraction={fraction} />
  </View>;
  if (stopped) return <View style={styles.indent}>
    {line(words.readyStopped)}
    <View style={styles.actions}>
      <Button kind="filled" label={words.tryAgain} onPress={() => start()} />
      <Button kind="text" label={words.useMobileData} onPress={() => start(true)} />
    </View>
  </View>;
  return <>
    <View style={[styles.indent, styles.status]}>
      <CheckIcon size={18} color={t.primary} />
      {line(words.phoneReady)}
    </View>
    {removable && <View style={[styles.inner, { backgroundColor: t.group }]}>
      {confirming
        ? <View style={styles.confirm}>
          <Text style={[type.body, { color: t.text }]}>{words.removeAsk}</Text>
          <View style={styles.actions}>
            <Button kind="filled" label={words.removeYes} onPress={remove} />
            <Button kind="text" label={words.removeNo} onPress={() => setConfirming(false)} />
          </View>
        </View>
        : <Row title={words.removeRow} subtitle={words.removeRowNote} onPress={() => setConfirming(true)} />}
      {!confirming && removeFailed && <Text style={[type.note, styles.failed, { color: t.muted }]}>{words.removeFailed}</Text>}
    </View>}
  </>;
}

const styles = StyleSheet.create({
  // Lines up with the option's name, past its icon.
  indent: { paddingLeft: 56, gap: space.s },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  words: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s },
  inner: { borderRadius: shape.group, overflow: 'hidden', paddingVertical: space.xs },
  confirm: { gap: space.m, padding: space.l },
  failed: { paddingHorizontal: space.l, paddingBottom: space.s },
});
