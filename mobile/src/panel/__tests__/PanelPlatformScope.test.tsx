import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Native from '../../../modules/ownvoice-native';
import type { DraftRequest, WriterEvents } from '../../core/writers';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })), capture: jest.fn(),
  modelStatus: jest.fn(async () => 'available'), closePanel: jest.fn(),
  typingCheck: jest.fn(async () => false), ask: jest.fn(),
} }));
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
    ['polish', 0], ['polish', 1], ['reply', 0], ['compose', 0], ['compose', 1],
  ] as const)('%s card %s retains the intended rules and checks', async (mode, card) => {
    (Native.ask as jest.Mock).mockClear();
    const written = mode === 'compose' ? '' : 'Sam: Are we meeting on Saturday?';
    (Native.capture as jest.Mock).mockResolvedValue({
      conversation: written, written, nodes: [], fieldTop: null,
      typed: mode === 'reply' ? '' : 'Can we meet on Saturday?',
      app, label, at: 0, id: `${app}-${mode}`, hasField: true,
    });
    (Native.ask as jest.Mock).mockImplementation(async (_id: string, prompt: string) => {
      if (prompt.includes('Which kind of screen is it?')) return 'MESSAGE';
      if (prompt.includes('You check a reply draft')) return answer;
      if (prompt.includes('Compare a rewrite')) return 'MEANING: pass';
      return '';
    });
    const write = jest.fn(async (_request: DraftRequest, on: WriterEvents = {}) => {
      on.landed?.('Shall we meet on Saturday morning?', 0, mode === 'reply' ? undefined : 'Shorter');
      return { drafts: ['Shall we meet on Saturday morning?'] };
    });
    const screen = await render(<Panel writer={{ write }} />);
    const post = mode === 'compose';
    const publicScreen = post || !!label;
    const title = mode === 'reply' ? 'Suggested replies' : publicScreen ? 'Polish your post' : 'Polish your message';
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
    const checkPrompt = (Native.ask as jest.Mock).mock.calls.find(([_id, prompt]) => prompt.includes('You check a reply draft'))?.[1];
    expect(checkPrompt).toBeDefined();
    expect(checkPrompt.includes('End on a statement, not a question.')).toBe(post);
    if (label) expect(screen.getByText('Right length for a post')).toBeTruthy();
    await screen.unmount();
  });
});
