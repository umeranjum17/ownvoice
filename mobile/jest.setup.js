// Jest has no native module behind expo-router's dynamic colours, so stand in a fixed
// Material 3 baseline table (one light, one dark). Tests flip the scheme with
// Appearance.setColorScheme('dark'); the mock below intercepts the Appearance module itself
// because the stock one ignores setColorScheme when the native module is mocked away.
jest.mock('react-native/Libraries/Utilities/Appearance', () => {
  const actual = jest.requireActual('react-native/Libraries/Utilities/Appearance');
  return {
    ...actual,
    getColorScheme: () => globalThis.__scheme ?? 'light',
    setColorScheme: s => { globalThis.__scheme = s === 'unspecified' ? 'light' : s; },
  };
});

// The React Native jest preset stubs useColorScheme as jest.fn(() => 'light'); make it follow the same switch.
require('react-native/Libraries/Utilities/useColorScheme').default.mockImplementation(() => globalThis.__scheme ?? 'light');

jest.mock('expo-router', () => {
  const light = {
    primary: '#6750A4', onPrimary: '#FFFFFF', tertiaryContainer: '#FFD8E4', onTertiaryContainer: '#31111D',
    surface: '#FEF7FF', surfaceContainer: '#F3EDF7', surfaceContainerLow: '#F7F2FA', surfaceContainerHighest: '#E6E0E9',
    onSurface: '#1D1B20', onSurfaceVariant: '#49454F', outline: '#79747E', outlineVariant: '#CAC4D0',
  };
  const dark = {
    primary: '#D0BCFF', onPrimary: '#381E72', tertiaryContainer: '#633B48', onTertiaryContainer: '#FFD8E4',
    surface: '#141218', surfaceContainer: '#211F26', surfaceContainerLow: '#1D1B20', surfaceContainerHighest: '#36343B',
    onSurface: '#E6E0E9', onSurfaceVariant: '#CAC4D0', outline: '#938F99', outlineVariant: '#49454F',
  };
  const table = () => (globalThis.__scheme === 'dark' ? dark : light);
  const dynamic = new Proxy({}, { get: (_, name) => table()[name] ?? '#FF00FF' });
  return { __esModule: true, Color: { android: { dynamic } } };
});
