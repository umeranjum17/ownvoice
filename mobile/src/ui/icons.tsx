import Svg, { Path } from 'react-native-svg';

// The four icons the Kotlin app already has (ic_close, ic_check, ic_warn, ic_chev), as SVG paths.

type Props = { size: number; color: string };

export function CloseIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M6,6 L18,18 M18,6 L6,18" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" /></Svg>;
}

export function CheckIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5,12.5 l4.5,4.5 L19,7.5" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function WarnIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3,12 a9,9 0 1 0 18,0 a9,9 0 1 0 -18,0 M12,7.5 v5.5 M12,16.5 v0.01" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function ChevIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M10,7 l5,5 -5,5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

// The setup promises' icons, ported from the Kotlin app (ic_hand, ic_lock, ic_chat).
export function HandIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path
    d="M8,13 V6.5 a1.5,1.5 0 0 1 3,0 V12 M11,11 V5 a1.5,1.5 0 0 1 3,0 v6 M14,11 V6.5 a1.5,1.5 0 0 1 3,0 V14 c0,4 -2.5,7 -6,7 -2.5,0 -4,-1.2 -5.5,-3.5 L4,15 a1.5,1.5 0 0 1 2.5,-1.6 L8,15"
    fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function LockIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path
    d="M7.5,10 h9 a2.5,2.5 0 0 1 2.5,2.5 v5 a2.5,2.5 0 0 1 -2.5,2.5 h-9 a2.5,2.5 0 0 1 -2.5,-2.5 v-5 a2.5,2.5 0 0 1 2.5,-2.5z M8,10 V7 a4,4 0 0 1 8,0 v3"
    fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function ChatIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path
    d="M5,18 l-1,3 4,-2 h9 a3,3 0 0 0 3,-3 V7 a3,3 0 0 0 -3,-3 H7 a3,3 0 0 0 -3,3 v11"
    fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

// Home and settings: one small line icon per row, and the back arrow.
const line = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function BackIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M19,12 H5 M11,6 l-6,6 6,6" stroke={color} {...line} strokeWidth={2} /></Svg>;
}

export function GridIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path
    d="M5,4 h4 a1,1 0 0 1 1,1 v4 a1,1 0 0 1 -1,1 h-4 a1,1 0 0 1 -1,-1 v-4 a1,1 0 0 1 1,-1z M15,4 h4 a1,1 0 0 1 1,1 v4 a1,1 0 0 1 -1,1 h-4 a1,1 0 0 1 -1,-1 v-4 a1,1 0 0 1 1,-1z M5,14 h4 a1,1 0 0 1 1,1 v4 a1,1 0 0 1 -1,1 h-4 a1,1 0 0 1 -1,-1 v-4 a1,1 0 0 1 1,-1z M15,14 h4 a1,1 0 0 1 1,1 v4 a1,1 0 0 1 -1,1 h-4 a1,1 0 0 1 -1,-1 v-4 a1,1 0 0 1 1,-1z"
    stroke={color} {...line} /></Svg>;
}

export function PenIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M4,20 l1,-4.5 L15.5,5 a2.1,2.1 0 0 1 3,3 L8,18.5z M13.5,7 l3,3 M4,20 h16" stroke={color} {...line} /></Svg>;
}

export function EyeIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M2.5,12 C5,7 8.5,5 12,5 s7,2 9.5,7 c-2.5,5 -6,7 -9.5,7 s-7,-2 -9.5,-7z M9,12 a3,3 0 1 0 6,0 a3,3 0 1 0 -6,0" stroke={color} {...line} /></Svg>;
}

export function PauseIcon({ size, color }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M9,6 v12 M15,6 v12" stroke={color} {...line} strokeWidth={2.2} /></Svg>;
}
