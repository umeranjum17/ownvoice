import 'expo-router/entry';
import React from 'react';
import { AppRegistry } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Panel from './src/panel/Panel';
import Rewrite from './src/rewrite/Rewrite';
import Voice from './app/voice';
import Native from './modules/ownvoice-native';
import { listen } from './src/core/typingCheck';
const RewriteEntry = () => Native.rewriteInput()?.markdown ? React.createElement(Voice, { shared: true }) : React.createElement(Rewrite);
const wrap = Component => () => React.createElement(SafeAreaProvider, null, React.createElement(Component));
AppRegistry.registerComponent('panel', () => wrap(Panel));
AppRegistry.registerComponent('rewrite', () => wrap(RewriteEntry));
// The typing check (off unless switched on) answers here, whether or not a screen of Ownvoice is open.
listen();
