import { Redirect } from 'expo-router';

// The writing-task screen exists only in lab builds (EXPO_PUBLIC_PHONE_AGENT=1): the constant-false
// branch drops src/agent from every other bundle, and there ownvoice://agent just opens Home.
const Lab = process.env.EXPO_PUBLIC_PHONE_AGENT === '1' ? require('../src/agent/Screen').default : null;

export default function Agent() { return Lab ? <Lab /> : <Redirect href="/" />; }
