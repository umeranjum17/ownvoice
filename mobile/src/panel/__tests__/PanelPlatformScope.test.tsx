import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Native from '../../../modules/ownvoice-native';
import { words } from '../../core/words';
import type { DraftRequest, WriterEvents } from '../../core/writers';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })), capture: jest.fn(),
  closePanel: jest.fn(), typingCheck: jest.fn(async () => false),
} }));
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'ready' })), agreedToDownload: jest.fn(() => false) }));
import { askLocal } from '../../core/localModel';
const mockAsk = askLocal as jest.MockedFunction<typeof askLocal>;
jest.mock('../../core/voiceStore', () => ({ loadVoice: () => ({
  never: [], noDashes: false, statementEndings: true, note: '',
}) }));

const answer = [
  'GENERIC: 2', 'SPECIFICITY: 8',
  ...['SPECIFIC', 'CLEAR', 'VOICE', 'FITS', 'CLAIMS', 'ANSWERS', 'NEXT_STEP',
    'CONVERSATION', 'NOT_INTERESTED', 'HOOK'].map(key => `${key}: pass - clear and relevant`),
].join('\n');

describe.each([
  ['com.google.android.gm', ''],
  ['com.whatsapp', ''],
  ['com.whatsapp.w4b', ''],
  ['com.Slack', ''],
  ['com.linkedin.android', ''],
  ['com.instagram.barcelona', ''],
  ['xyz.blueskyweb.app', ''],
  ['com.twitter.android', 'X'],
  ['com.reddit.frontpage', 'Reddit'],
])('%s heading and post scope', (app, label) => {
  test.each([
    ['polish', 0], ['polish', 1], ['compose', 0], ['compose', 1],
  ] as const)('%s card %s retains the intended rules and checks', async (mode, card) => {
    mockAsk.mockClear();
    const written = mode === 'compose' ? '' : 'Sam: Are we meeting on Saturday?';
    (Native.capture as jest.Mock).mockResolvedValue({
      conversation: written, written, nodes: [], fieldTop: null,
      typed: 'Can we meet on Saturday?',
      app, label, at: 0, id: `${app}-${mode}`, hasField: true,
    });
    mockAsk.mockImplementation(async (prompt: string) => {
      if (prompt.includes('Which kind of screen is it?')) return 'MESSAGE';
      if (prompt.includes('You check a reply draft')) return answer;
      if (prompt.includes('Compare a rewrite')) return 'MEANING: pass';
      return '';
    });
    const write = jest.fn(async (_request: DraftRequest, on: WriterEvents = {}) => {
      on.landed?.('Shall we meet on Saturday morning?', 0, 'Shorter');
      return { drafts: ['Shall we meet on Saturday morning?'] };
    });
    const screen = await render(<Panel writer={{ write }} />);
    const post = mode === 'compose';
    // A reply typed under a post on X or Reddit grows into suggested replies.
    const grow = !post && !!label;
    const publicScreen = post || !!label;
    const title = grow ? 'Suggested replies' : publicScreen ? 'Polish your post' : 'Polish your message';
    await waitFor(() => expect(screen.getByText(label ? `${title} · ${label}` : title)).toBeTruthy());
    expect(write.mock.calls[0][0].guide).toBe(post ? 'End on a statement, not a question.' : '');
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Why?' }).length).toBeGreaterThan(card));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Why?' })[card]);
    if (post) expect(screen.getByText("Doesn't sound like you")).toBeTruthy();
    else expect(screen.queryByText("Doesn't sound like you")).toBeNull();
    await waitFor(() => expect(screen.getByText(publicScreen ? 'Invites replies' : 'Answers the question')).toBeTruthy());
    expect(screen.queryByText(publicScreen ? 'Answers the question' : 'Invites replies')).toBeNull();
    if (post) expect(screen.getByText("Doesn't sound like you")).toBeTruthy();
    else expect(screen.queryByText("Doesn't sound like you")).toBeNull();
    const checkCall = mockAsk.mock.calls.find(([prompt]) => prompt.includes('You check a reply draft'));
    expect(checkCall).toBeDefined();
    expect(checkCall?.[0].includes('End on a statement, not a question.')).toBe(post);
    if (label) expect(screen.getByText('Right length for a post')).toBeTruthy();
    await screen.unmount();
  });
});

test('empty-field reply withholds instead of drafting', async () => {
  (Native.capture as jest.Mock).mockResolvedValue({
    conversation: 'Sam: Are we meeting on Saturday?', written: 'Sam: Are we meeting on Saturday?',
    nodes: [], fieldTop: null, typed: '', app: 'com.whatsapp', label: undefined, at: 0, id: 'withheld', hasField: true,
  });
  const write = jest.fn(async () => ({ drafts: [] as string[] }));
  const screen = await render(<Panel writer={{ write }} />);
  await waitFor(() => expect(screen.getByText(words.replyWithheld)).toBeTruthy());
  expect(write).not.toHaveBeenCalled();
  expect(screen.queryAllByRole('button', { name: 'Why?' })).toHaveLength(0);
  expect(screen.queryByText(words.tryAgain)).toBeNull();
  expect(screen.queryByText(words.writeNew)).toBeNull();
  await screen.unmount();
});
