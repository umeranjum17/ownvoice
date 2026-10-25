import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ModelInfo } from '@byokit/accounts';
import { Button } from './Button';
import { CheckIcon } from './icons';
import { Row } from './Row';
import { shape, space, type, useTheme } from './theme';
import { listModels } from '../chatgpt/accounts';
import { words } from '../core/words';
import type { CloudKey } from '../core/source';
import type { PickedModel } from '../core/model';

const PAGE = 40;

/** Which one writes, for one signed-in account: the account's own live list (nothing is kept in this app), searchable,
 *  with nothing chosen for the person. The names in the rows are the vendor's own words, the one place a vendor or model
 *  name may show; every line around them is plain. A row the account can't use right now says why and can't be picked.
 *  A list that can't be read says so plainly and offers Try again: it never falls back to a list kept here. */
export function ModelPick({ account, picked, onPick }: { account: CloudKey; picked: string | null; onPick: (model: PickedModel) => void }) {
  const t = useTheme();
  const [rows, setRows] = useState<ModelInfo[] | 'failed' | null>(null);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [attempt, setAttempt] = useState(0);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  useEffect(() => {
    setRows(null);
    listModels(account).then(list => { if (live.current) setRows(list.length ? list : 'failed'); }).catch(() => { if (live.current) setRows('failed'); });
  }, [account, attempt]);

  if (rows === null) return <View style={styles.wait}><ActivityIndicator size="small" color={t.primary} /><Text style={[type.note, { color: t.muted }]}>{words.modelLoading}</Text></View>;
  if (rows === 'failed') return <View style={styles.wait}>
    <Text style={[type.body, { color: t.text }]}>{words.modelFailed}</Text>
    <Button kind="filled" label={words.tryAgain} onPress={() => setAttempt(n => n + 1)} />
  </View>;

  const needle = query.trim().toLowerCase();
  const found = needle ? rows.filter(row => row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle)) : rows;
  const why = (row: ModelInfo) => row.available ? undefined : row.why === 'resting' ? words.modelResting : words.modelLimited;
  return <View style={styles.box}>
    <TextInput
      testID="model-search"
      accessibilityLabel={words.modelSearch}
      value={query}
      onChangeText={text => { setQuery(text); setShown(PAGE); }}
      placeholder={words.modelSearch}
      autoCapitalize="none"
      autoCorrect={false}
      style={[styles.search, { color: t.text, borderColor: t.line, backgroundColor: t.group }]}
      placeholderTextColor={t.muted}
    />
    {found.length === 0
      ? <Text style={[type.body, { color: t.muted }]}>{words.modelEmpty}</Text>
      : <View style={[styles.list, { backgroundColor: t.group }]}>
        {found.slice(0, shown).map(row => <Row key={row.id}
          title={row.name}
          subtitle={why(row) ?? (row.name !== row.id ? row.id : undefined)}
          disabled={!row.available}
          end={row.id === picked ? <CheckIcon size={22} color={t.primary} /> : undefined}
          onPress={() => onPick({ id: row.id, name: row.name })} />)}
      </View>}
    {found.length > shown && <Button kind="text" label={words.modelMore} onPress={() => setShown(n => n + PAGE)} />}
  </View>;
}

const styles = StyleSheet.create({
  box: { gap: space.m },
  wait: { gap: space.m, alignItems: 'flex-start' },
  search: { borderWidth: 1, borderRadius: shape.group, paddingVertical: 10, paddingHorizontal: 12 },
  list: { borderRadius: shape.group, overflow: 'hidden', paddingVertical: space.xs },
});
