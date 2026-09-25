import { useColorScheme } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { dark, light, type Mood } from './dot';

/** Dot is decoration: no spoken label and no pointer. The title carries the meaning. */
export function Dot({ mood, size }: { mood: Mood; size: number }) {
  const scheme = useColorScheme();
  return <SvgXml xml={(scheme === 'dark' ? dark : light)[mood]} width={size} height={size} accessible={false} />;
}
