import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import { useTheme } from '../src/ui/theme';

export default function Layout() {
  const t = useTheme();
  return <><StatusBar barStyle={t.scheme === 'dark' ? 'light-content' : 'dark-content'} /><Stack screenOptions={{ headerShown: false }} /></>;
}
