import { render, waitFor } from '@testing-library/react-native';
import About from '../about';
import { words, technicalWords } from '../../src/core/words';
import { helperVersion } from '../../src/computer/link';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.9', android: { versionCode: 11 } } } }));
jest.mock('../../src/computer/link', () => ({ helperVersion: jest.fn() }));
const helper = helperVersion as jest.MockedFunction<typeof helperVersion>;

const shown = (screen: Awaited<ReturnType<typeof render>>) => screen.queryAllByText(/./).map((n) => String(n.props.children));

describe('About', () => {
  afterEach(() => { delete process.env.EXPO_PUBLIC_OWNVOICE_RELEASE; });

  it('marks a build that is not a tagged release as pre-release, in plain words', async () => {
    helper.mockResolvedValue({ paired: false, version: null, reachable: false });
    const screen = await render(<About />);
    await waitFor(() => expect(screen.getByText(words.aboutHelperNone)).toBeTruthy());
    expect(screen.getByText('Version 1.0.9-dev')).toBeTruthy();
    expect(screen.getByText('Build 11')).toBeTruthy();
    expect(screen.getByText(words.aboutPreRelease)).toBeTruthy();
    expect(shown(screen).filter(x => technicalWords.test(x))).toEqual([]);
  });

  it('shows a tagged release as the plain version, and both versions with a mismatch hint when the helper is older', async () => {
    process.env.EXPO_PUBLIC_OWNVOICE_RELEASE = '1';
    helper.mockResolvedValue({ paired: true, version: '1.0.8', reachable: true });
    const screen = await render(<About />);
    await waitFor(() => expect(screen.getByText(words.aboutHelperOlder)).toBeTruthy());
    expect(screen.getByText('Version 1.0.9')).toBeTruthy();
    expect(screen.getByText(`${words.aboutHelper} 1.0.8`)).toBeTruthy();
    expect(screen.getByText(words.aboutRelease)).toBeTruthy();
  });

  it('says so when the paired helper is too old to report a version or cannot be reached', async () => {
    helper.mockResolvedValue({ paired: true, version: null, reachable: true });
    let screen = await render(<About />);
    await waitFor(() => expect(screen.getByText(words.aboutHelperUnknown)).toBeTruthy());
    helper.mockResolvedValue({ paired: true, version: null, reachable: false });
    screen = await render(<About />);
    await waitFor(() => expect(screen.getByText(words.aboutHelperUnreachable)).toBeTruthy());
  });
});
