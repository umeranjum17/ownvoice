import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge } from './Badge';
import { Button } from './Button';
import { PhoneIcon } from './icons';
import { Progress } from './Progress';
import { Row } from './Row';
import { shape, space, type, useTheme } from './theme';
import { words } from '../core/words';
import { agreed, downloading, getReady, modelStatus, removeDownload, watch } from '../core/phoneDownload';
import { getSource } from '../core/source';
import type { ModelStatus } from '../../modules/ownvoice-native';

/** Settings' card for the phone's own writer: the one-time ask (only once this phone is the chosen
 *  writer), the bar while it gets ready, a way on when it stopped, and freeing the space again. */
export function PhoneWriter() {
  const t = useTheme();
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [phoneChosen, setPhoneChosen] = useState(false);
  const [fraction, setFraction] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [, setTick] = useState(0);

  const refresh = () => {
    setTick(n => n + 1);
    void modelStatus().then(setModel).catch(() => setModel('unavailable'));
  };
  useEffect(() => {
    refresh();
    getSource().then(source => setPhoneChosen(source === 'phone')).catch(() => {});
    return watch(value => { if (value == null) refresh(); else { setFraction(value); setTick(n => n + 1); } });
  }, []);

  const start = (mobileData = false) => { setFraction(0); void getReady(mobileData).catch(() => {}); refresh(); };
  const remove = () => { setConfirming(false); setRemoveFailed(false); void removeDownload().catch(() => setRemoveFailed(true)).finally(refresh); };

  const yes = agreed();
  const getting = model === 'downloading' || downloading();
  const stopped = model === 'downloadable' && yes && !getting;
  const ask = model === 'downloadable' && !yes && phoneChosen;
  const removable = model === 'available' && yes;
  if (!getting && !stopped && !ask && !removable) return null;

  const card = { backgroundColor: t.group };
  if (ask) return <View style={[styles.card, card]}>
    <View style={styles.head}>
      <Badge><PhoneIcon size={22} color={t.onPrimaryContainer} /></Badge>
      <View style={styles.words}>
        <Text style={[type.label, styles.title, { color: t.text }]}>{words.readyTitle}</Text>
        <Text style={[type.note, { color: t.muted }]}>{words.readyNote}</Text>
      </View>
    </View>
    <View style={styles.actions}><Button kind="filled" label={words.getReady} onPress={() => start()} /></View>
  </View>;
  if (getting) return <View style={[styles.card, card]}>
    <Row lead={<Badge><PhoneIcon size={22} color={t.onPrimaryContainer} /></Badge>} title={words.srcPhone} subtitle={words.gettingReady} />
    <View style={styles.bar}><Progress fraction={fraction} /></View>
  </View>;
  if (stopped) return <View style={[styles.card, card]}>
    <Row lead={<Badge><PhoneIcon size={22} color={t.onPrimaryContainer} /></Badge>} title={words.statusNotReady} subtitle={words.readyStopped} />
    <View style={styles.actions}>
      <Button kind="filled" label={words.tryAgain} onPress={() => start()} />
      <Button kind="text" label={words.useMobileData} onPress={() => start(true)} />
    </View>
  </View>;
  return <View style={[styles.card, card]}>
    <Row lead={<Badge><PhoneIcon size={22} color={t.onPrimaryContainer} /></Badge>} title={words.srcPhone} subtitle={words.phoneReady} />
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
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: shape.group, overflow: 'hidden', paddingVertical: space.xs },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.l, padding: space.l },
  words: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, paddingHorizontal: space.l, paddingBottom: space.m },
  bar: { paddingHorizontal: space.l, paddingBottom: space.l },
  confirm: { gap: space.m, paddingHorizontal: space.l, paddingTop: space.s },
  failed: { paddingHorizontal: space.l, paddingTop: space.xs },
});
