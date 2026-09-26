import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { readLog } from '../src/core/readLog';
export default function Layout(){
  useEffect(() => { readLog(); }, []);
  return <Stack screenOptions={{headerShown:false}}/>;
}
