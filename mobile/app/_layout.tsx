import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { readLog } from '../src/core/readLog';
export default function Layout(){
  useEffect(() => { try { readLog(); } catch {} }, []);
  return <Stack screenOptions={{headerShown:false}}/>;
}
