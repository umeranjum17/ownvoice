import { View } from 'react-native';
import { useTheme } from './theme';

/** The download progress: a 4 dp bar, never a number. */
export function Progress({ fraction }: { fraction: number }) {
  const t = useTheme();
  return <View style={{ height: 4, borderRadius: 2, backgroundColor: t.yours, overflow: 'hidden' }}>
    <View style={{ height: 4, borderRadius: 2, width: `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%` as `${number}%`, backgroundColor: t.primary }} />
  </View>;
}
