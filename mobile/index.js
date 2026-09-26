import 'expo-router/entry';
import React from 'react';
import { AppRegistry } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Panel from './src/panel/Panel';
import Rewrite from './src/rewrite/Rewrite';
const wrap = Component => () => React.createElement(SafeAreaProvider, null, React.createElement(Component));
AppRegistry.registerComponent('panel', () => wrap(Panel));
AppRegistry.registerComponent('rewrite', () => wrap(Rewrite));
