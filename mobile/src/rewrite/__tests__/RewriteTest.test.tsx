// Slice 8 (rows R1–R5): the selected-text rewrite screen, ported from the Kotlin RewriteActivity's
// scenarios (§2.8: Replace returns the chosen version; a new number is warned; read-only offers only Copy).
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Native from '../../../modules/ownvoice-native';
import Rewrite from '../Rewrite';
import { technicalWords, words } from '../../core/words';
import { message } from '../../core/nano';
import { saveVoice, wipeVoice } from '../../core/voice';
import { NO_RULES } from '../../core/slop';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  rewriteInput: jest.fn(), finishRewrite: jest.fn(async () => {}), ask: jest.fn(),
} }));

const native = Native as unknown as { rewriteInput: jest.Mock; finishRewrite: jest.Mock; ask: jest.Mock };

const renderRewrite = async (input: { text: string; editable: boolean } | null) => {
  native.rewriteInput.mockReturnValue(input);
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Rewrite />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  return screen;
};

const visibleStrings = (screen: { toJSON: () => unknown }): string[] => {
  const strings: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') { strings.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object') return;
    const item = node as Record<string, unknown>;
    if (Array.isArray(item.children)) item.children.forEach(walk);
  };
  walk(screen.toJSON());
  return strings;
};

const SELECTION = 'I think we should move the call to Tuesday. Really.';

beforeEach(() => { jest.clearAllMocks(); wipeVoice(); });

test('empty selection shows only the plain hint (R2)', async () => {
  const screen = await renderRewrite({ text: '   ', editable: true });
  expect(visibleStrings(screen)).toContain('Select some text first, then choose Ownvoice.');
  expect(screen.queryByRole('button', { name: 'Shorter' })).toBeNull();
  expect(native.ask).not.toHaveBeenCalled();
});

test('the three chips read Shorter, Simpler and Fix spelling and the note explains what happens next (R2, R3)', async () => {
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  for (const label of ['Shorter', 'Simpler', 'Fix spelling']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
  expect(visibleStrings(screen)).toContain("Pick how you'd like it. You'll see it before anything changes.");
  expect(visibleStrings(screen)).toContain('You selected');
});

test('Replace returns the chosen version and copies it (R4)', async () => {
  native.ask.mockImplementation(async (_id: string, prompt: string) =>
    prompt.startsWith('Compare a rewrite') ? 'GENERIC: 2\nSPECIFICITY: 8\nMEANING: pass' : 'Move the call to Tuesday.');
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain('Move the call to Tuesday.'));
  expect(native.ask).toHaveBeenCalledWith(expect.stringMatching(/^rewrite-/), expect.stringContaining('Rewrite the text below. Make it shorter and tighter. Cut filler, keep every point.'), { maxTokens: 256 });
  expect(native.ask).toHaveBeenCalledWith(expect.stringMatching(/^rewrite-check-/), expect.stringContaining('Compare a rewrite with its original.'), { maxTokens: 80 });
  const shown = visibleStrings(screen);
  expect(shown).toContain('Same meaning as yours');
  expect(shown).toContain('Sounds natural');
  expect(shown).toContain('Replace your text with it, or copy it.');
  expect(shown).toContain("If the app doesn't take it, it's copied too. Just paste.");
  fireEvent.press(screen.getByRole('button', { name: 'Replace' }));
  expect(native.finishRewrite).toHaveBeenCalledWith('Move the call to Tuesday.', true);
  expect(shown.filter(x => technicalWords.test(x))).toEqual([]);
});

test('a rewrite with a new number is warned', async () => {
  native.ask.mockImplementation(async (_id: string, prompt: string) =>
    prompt.startsWith('Compare a rewrite') ? 'MEANING: pass' : 'We should move the call to Friday at 7:30.');
  const screen = await renderRewrite({ text: 'Can we move the call?', editable: false });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen).some(s => s.startsWith('Check this:'))).toBe(true));
  expect(visibleStrings(screen).join(' ')).toContain('7:30');
});

test('read-only offers only Copy (R4)', async () => {
  native.ask.mockImplementation(async (_id: string, prompt: string) => prompt.startsWith('Compare a rewrite') ? 'MEANING: pass' : 'Moved to Tuesday.');
  const screen = await renderRewrite({ text: SELECTION, editable: false });
  fireEvent.press(screen.getByRole('button', { name: 'Simpler' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain('Moved to Tuesday.'));
  expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull();
  expect(visibleStrings(screen)).toContain('Copy it, then paste it where you like.');
  expect(visibleStrings(screen)).not.toContain("If the app doesn't take it, it's copied too. Just paste.");
  fireEvent.press(screen.getByRole('button', { name: 'Copy' }));
  expect(native.finishRewrite).toHaveBeenCalledWith('Moved to Tuesday.', false);
});

test('editable Copy never returns a replacement', async () => {
  native.ask.mockImplementation(async (_id: string, prompt: string) => prompt.startsWith('Compare a rewrite') ? 'MEANING: pass' : 'Tuesday works.');
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Copy' }));
  expect(native.finishRewrite).toHaveBeenCalledWith('Tuesday works.', false);
});

test('result is usable while the optional check is pending', async () => {
  native.ask.mockImplementation((_id: string, prompt: string) => prompt.startsWith('Compare a rewrite')
    ? new Promise<string>(() => {}) : Promise.resolve('Tuesday works.'));
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy());
  expect(visibleStrings(screen)).toContain('Tuesday works.');
  fireEvent.press(screen.getByRole('button', { name: 'Replace' }));
  expect(native.finishRewrite).toHaveBeenCalledWith('Tuesday works.', true);
});

test('saved writing rules guide and flag the rewrite', async () => {
  saveVoice({ ...NO_RULES, never: ['cheers mate'], noDashes: true, note: 'short, lowercase' });
  native.ask.mockImplementation(async (_id: string, prompt: string) => prompt.startsWith('Compare a rewrite')
    ? 'GENERIC: 0\nSPECIFICITY: 10\nMEANING: pass' : 'cheers mate');
  const screen = await renderRewrite({ text: 'cheers mate — see you soon', editable: true });
  expect(screen.getByText('cheers mate')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain('cheers mate'));
  expect(native.ask).toHaveBeenCalledWith(expect.stringMatching(/^rewrite-/), expect.stringContaining("Follow the writer's rules: No em dashes. How they write: short, lowercase"), { maxTokens: 256 });
  expect(visibleStrings(screen)).toContain("Doesn't sound like you");
  wipeVoice();
});

test('an empty rewrite asks for a retry in plain words', async () => {
  native.ask.mockResolvedValue('');
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain("Couldn't rewrite that. Try again."));
});

test('a writer failure shows its plain error line', async () => {
  native.ask.mockRejectedValue(new Error('HTTP 9 too much'));
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Fix spelling' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain(message(9)));
  expect(visibleStrings(screen)).not.toContain('HTTP 9 too much');
});

test('closing hands nothing back', async () => {
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(native.finishRewrite).toHaveBeenCalledWith(null, false)); // onClose lands after the fade-out
});

test('a newer chip tap drops the earlier answer', async () => {
  let late: (value: string) => void = () => {};
  native.ask
    .mockImplementationOnce(() => new Promise<string>(resolve => { late = resolve; }))
    .mockImplementation(async (_id: string, prompt: string) => prompt.startsWith('Compare a rewrite') ? 'MEANING: pass' : 'Second answer wins.');
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  fireEvent.press(screen.getByRole('button', { name: 'Simpler' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain('Second answer wins.'));
  await act(async () => { late('Stale answer from the first tap.'); await Promise.resolve(); });
  const shown = visibleStrings(screen);
  expect(shown).not.toContain('Stale answer from the first tap.');
  expect(shown).toContain('Second answer wins.');
});
