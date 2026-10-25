import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Page } from '../src/ui/Page';
import { ModelPick } from '../src/ui/ModelPick';
import { type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { cloudOf } from '../src/core/source';
import { pickedModel, setPickedModel, type PickedModel } from '../src/core/model';
import { requestTour } from '../src/core/tour';

/** Which one writes: the person's own pick from the signed-in account's list, saved on this phone and used for every draft and rating. */
export default function ModelScreen() {
  const t = useTheme();
  const { account, tour } = useLocalSearchParams<{ account?: string; tour?: string }>();
  const key = cloudOf(account);
  const [failed, setFailed] = useState(false);
  const pick = (model: PickedModel) => {
    if (!key) return;
    try { setPickedModel(key, model); if (tour === '1') requestTour(); router.back(); } catch { setFailed(true); }
  };
  return <Page title={words.modelTitle} note={words.modelNote} stickyTop onBack={() => router.back()}>
    {key && <ModelPick account={key} picked={pickedModel(key)?.id ?? null} onPick={pick} />}
    {failed && <Text style={[type.body, { color: t.text }]}>{words.modelSaveFailed}</Text>}
  </Page>;
}
