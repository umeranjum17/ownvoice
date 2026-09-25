import { Switch as RNSwitch, View } from 'react-native';
import { useTheme } from './theme';

/** The phone's own switch, coloured from the theme. Disabled at 38%, like the buttons. */
export function Switch({ value, onValueChange, disabled = false }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return <View style={{ opacity: disabled ? 0.38 : 1 }}>
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: t.yours, true: t.primary }}
      thumbColor={value ? t.onPrimary : t.outline ?? t.line}
    />
  </View>;
}
