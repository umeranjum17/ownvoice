import 'expo-router/entry';
import React from 'react';
import { AppRegistry } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Panel from './src/panel/Panel';
const Root = () => React.createElement(SafeAreaProvider, null, React.createElement(Panel, null));
AppRegistry.registerComponent('panel', () => Root);
