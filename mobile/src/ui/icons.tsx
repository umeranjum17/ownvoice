import Svg, { Path } from 'react-native-svg';

// The four icons the Kotlin app already has (ic_close, ic_check, ic_warn, ic_chev), as SVG paths.

type Props = { size: number; color: string };

export function CloseIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M6,6 L18,18 M18,6 L6,18" stroke={color} strokeWidth={2} strokeLinecap="round" /></Svg>;
}

export function CheckIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5,12.5 l4.5,4.5 L19,7.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function WarnIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3,12 a9,9 0 1 0 18,0 a9,9 0 1 0 -18,0 M12,7.5 v5.5 M12,16.5 v0.01" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function ChevIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M10,7 l5,5 -5,5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
