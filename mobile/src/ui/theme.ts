import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme, type TextStyle } from 'react-native';
import { Color } from 'expo-router';

// Plain Material 3, from the phone: dynamic colours via expo-router's Color.android.dynamic,
// the phone's own font (never set fontFamily), the 4 dp grid, and the type scale.
// Colour values are snapshots for the scheme at read time, so only read them inside useTheme.

// The one fixed pair the phone's palette can't give React Native (Kotlin harmonises it; RN can't).
const ATTENTION = { light: '#8F5300', dark: '#FFB95C' } as const;

// Material 3 type scale, sp/line height. Weight 500 is Material's "medium"; nothing is bolder.
export const type = {
  headline: { fontSize: 28, lineHeight: 36, fontWeight: '400' },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '400' },
  words: { fontSize: 18, lineHeight: 26, fontWeight: '400' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  note: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
} satisfies Record<string, TextStyle>;

// The 4 dp grid: only these steps.
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

export const shape = { sheet: 28, card: 16, group: 20, bar: 6, round: 999 } as const;

export type Theme = ReturnType<typeof useTheme>;

/** The palette for the phone's current scheme. Read it in render, never at module scope. */
export function useTheme() {
  const scheme = useColorScheme() ?? 'light';
  return useMemo(() => {
    // The native module answers hex strings ("#RRGGBB"), one snapshot per scheme read.
    const d = Color.android.dynamic as unknown as Record<string, string>;
    return {
      scheme,
      scrim: '#00000066' as const,
      sheet: d.surfaceContainerLow,
      card: d.surface,
      cardLine: d.outlineVariant,
      yours: d.surfaceContainerHighest,
      group: d.surfaceContainer,
      text: d.onSurface,
      muted: d.onSurfaceVariant,
      primary: d.primary,
      onPrimary: d.onPrimary,
      mark: d.tertiaryContainer,
      onMark: d.onTertiaryContainer,
      outline: d.outline,
      attention: scheme === 'dark' ? ATTENTION.dark : ATTENTION.light,
      line: d.outlineVariant,
      handle: d.onSurfaceVariant,
    };
  }, [scheme]);
}

/** True when the phone asked for less motion, false when not, null until the phone answered.
 *  Treat null as "motion on" for small things; wait for it before a big entrance. */
export function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (live) setReduced(v); }).catch(() => { if (live) setReduced(false); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { live = false; sub.remove(); };
  }, []);
  return reduced;
}
