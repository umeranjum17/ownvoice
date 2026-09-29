const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Build flags are inlined at transform time, and Metro's cache doesn't key on them: without this a normal build can reuse a lab or e2e build's code.
config.cacheVersion = ['EXPO_PUBLIC_E2E_STUB', 'EXPO_PUBLIC_E2E_GPT', 'EXPO_PUBLIC_E2E_DOWNLOAD', 'EXPO_PUBLIC_PHONE_AGENT'].map(k => `${k}=${process.env[k] ?? ''}`).join(';');
module.exports = config;
