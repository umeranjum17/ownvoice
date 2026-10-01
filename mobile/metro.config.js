const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '../packages/engine')];
config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths || []), path.resolve(__dirname, 'node_modules')];
// Build flags are inlined at transform time, and Metro's cache doesn't key on them: without this a normal build can reuse a lab or e2e build's code.
config.cacheVersion = ['EXPO_PUBLIC_E2E_STUB', 'EXPO_PUBLIC_E2E_GPT', 'EXPO_PUBLIC_E2E_DOWNLOAD', 'EXPO_PUBLIC_PHONE_AGENT', 'EXPO_PUBLIC_E2E_AUTH_BASE', 'EXPO_PUBLIC_J2_DIAGNOSTICS'].map(k => `${k}=${process.env[k] ?? ''}`).join(';');
// The typing check's spelling dictionary ships as two plain files (src/core/speller.ts).
config.resolver.assetExts.push('aff', 'dic');
module.exports = config;
