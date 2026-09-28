import { type ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from './theme';

/** A row's icon, sat in a soft tinted circle. */
export function Badge({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primaryContainer }}>{children}</View>;
}
