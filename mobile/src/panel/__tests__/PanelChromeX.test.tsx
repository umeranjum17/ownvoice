import React from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Native, { type Capture } from '../../../modules/ownvoice-native';
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));
import { words } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })), capture: jest.fn(),
  closePanel: jest.fn(),
  typingCheck: jest.fn(async () => false),
} }));

test('empty-field Chrome X reply withholds before any writer or hand-off, without an empty flash', async () => {
  let captured!: (value: Capture) => void;
  (Native.capture as jest.Mock).mockReturnValue(new Promise(resolve => { captured = resolve; }));
  const write = jest.fn(async () => ({ drafts: [] as string[] }));
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><Panel writer={{ write }} /></SafeAreaProvider>);
  expect(screen.queryByText('Nothing to reply to yet')).toBeNull();
  expect(screen.getAllByText('Writing…').length).toBeGreaterThan(0);
  await act(async () => captured({ conversation: 'Demo Maker: Ship one small fix.', written: 'Demo Maker: Ship one small fix.', nodes: [{ text: 'x.com/demo/status/1', left: 0, top: 0, bottom: 30, clickable: false, viewId: 'com.android.chrome:id/url_bar' }], fieldTop: null, typed: '', app: 'com.android.chrome', label: 'Chrome', at: 0, id: 'x-web', hasField: true }));
  await waitFor(() => expect(screen.getByText(words.replyWithheld)).toBeTruthy());
  expect(write).not.toHaveBeenCalled();
  expect(screen.queryByText('Agree')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open in X with this text' })).toBeNull();
  expect(open).not.toHaveBeenCalled();
});

// The same X screen with a readable post above the composer: the panel grounds the reply
// cards on the post it read and routes to the writer instead of withholding.
test('X reply with a readable post above the composer offers grounded reply cards', async () => {
  const draftTexts = ['Agreeing with this.', 'Pushing back, kindly.', 'Asking a question.'];
  const write = jest.fn(async (_request: unknown, on?: { landed?: (text: string, slot: number) => void }) => {
    draftTexts.forEach((text, slot) => on?.landed?.(text, slot));
    return { drafts: draftTexts };
  });
  (Native.capture as jest.Mock).mockResolvedValue({
    conversation: 'Umer @umer · 2h\nShipped the fix for the reply flow. The quoted post below was the spec.\nSpec @spec · 2h\nOriginal spec post with a long body that wraps on a phone.',
    written: 'Umer @umer · 2h\nShipped the fix for the reply flow. The quoted post below was the spec.',
    nodes: [
      { text: 'x.com/umer/status/42', left: 0, top: 0, bottom: 20, clickable: false, viewId: 'com.android.chrome:id/url_bar' },
      { text: 'Umer @umer · 2h', left: 8, top: 40, bottom: 56, clickable: false },
      { text: 'Shipped the fix for the reply flow. The quoted post below was the spec.', left: 8, top: 60, bottom: 96, clickable: false },
      { text: 'Spec @spec · 2h', left: 20, top: 104, bottom: 120, clickable: false },
      { text: 'Original spec post with a long body that wraps on a phone.', left: 20, top: 124, bottom: 156, clickable: false },
    ],
    fieldTop: 400, typed: '', app: 'com.android.chrome', label: 'Chrome', at: 0, hasField: true, id: 'x-web-2',
  });
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><Panel writer={{ write }} /></SafeAreaProvider>);
  await waitFor(() => expect(screen.getByText('Agreeing with this.')).toBeTruthy());
  expect(write).toHaveBeenCalled();
  expect(screen.queryByText(words.replyWithheld)).toBeNull();
  // Reply mode names the X reply slots and offers Insert on each card.
  expect(screen.getAllByText(words.tagPushBack).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: words.insert }).length).toBe(3);
});

// 1.0.8 on the owner's phone: under a real tweet in the X app the sheet said "Reply ideas are unavailable for now".
// The real layout is not captured yet, so these replay three shapes the layout read missed: the tweet inside one
// tappable card above "Replying to", a tweet open with no reply box, and tweet text with no view of its own.
const TWEET = 'Shipped the reply fix today. Tell me what breaks.';
test.each([
  ['the tweet is one tappable card above Replying to', [
    { text: 'Umer', left: 64, top: 40, bottom: 58, clickable: true },
    { text: '@umer · 2h', left: 120, top: 40, bottom: 58, clickable: true },
    { text: TWEET, left: 64, top: 62, bottom: 100, clickable: true },
    { text: 'Replying to @umer', left: 64, top: 150, bottom: 168, clickable: false },
  ], 200],
  ['the tweet is open with no reply box', [
    { text: 'Post', left: 72, top: 20, bottom: 40, clickable: false },
    { text: TWEET, left: 16, top: 120, bottom: 160, clickable: false },
    { text: '12 Replies 40 Likes', left: 16, top: 200, bottom: 220, clickable: true },
  ], null],
  ['the tweet text is drawn without its own view', [
    { text: 'Umer @umer · 2h', left: 64, top: 40, bottom: 58, clickable: false },
    { text: 'Replying to @umer', left: 64, top: 150, bottom: 168, clickable: false },
  ], 200],
])('native X: %s', async (_shape, nodes, fieldTop) => {
  const draftTexts = ['Nice, testing it now.', 'Not sure it covers threads yet.', 'Does it fix long replies too?'];
  const write = jest.fn(async (_request: unknown, on?: { landed?: (text: string, slot: number) => void }) => {
    draftTexts.forEach((text, slot) => on?.landed?.(text, slot));
    return { drafts: draftTexts };
  });
  (Native.capture as jest.Mock).mockResolvedValue({
    conversation: `Umer @umer · 2h\n${TWEET}`, written: TWEET, nodes, fieldTop, typed: '',
    app: 'com.twitter.android', label: 'X', at: 0, hasField: fieldTop != null, id: 'x-native',
  });
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><Panel writer={{ write }} /></SafeAreaProvider>);
  await waitFor(() => expect(screen.getByText('Nice, testing it now.')).toBeTruthy());
  expect(screen.queryByText(words.replyWithheld)).toBeNull();
  expect(write.mock.calls[0][0]).toEqual(expect.objectContaining({ post: TWEET }));
  expect(screen.getAllByText(words.tagPushBack).length).toBeGreaterThan(0);
});

test('native X with only an author line on screen (an image-only tweet) still withholds instead of inventing a reply', async () => {
  const write = jest.fn(async () => ({ drafts: [] as string[] }));
  (Native.capture as jest.Mock).mockResolvedValue({
    conversation: 'Umer @umer · 2h\nReplying to @umer', written: 'Look at this one from today', nodes: [{ text: 'Umer @umer · 2h', left: 16, top: 40, bottom: 58, clickable: false }], fieldTop: 200, typed: '',
    app: 'com.twitter.android', label: 'X', at: 0, hasField: true, id: 'x-native-empty',
  });
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><Panel writer={{ write }} /></SafeAreaProvider>);
  await waitFor(() => expect(screen.getByText(words.replyWithheld)).toBeTruthy());
  expect(write).not.toHaveBeenCalled();
});

// Reddit's own comment context: the typed point grows into replies, named for the place.
test('Chrome Reddit comment grows from their point with Reddit context and names the place', async () => {
  (Native.capture as jest.Mock).mockResolvedValue({ conversation: 'Demo author: What should I build first?', written: 'Demo author: What should I build first?', nodes: [{ text: 'reddit.com/r/demo/comments/1', left: 0, top: 0, bottom: 30, clickable: false, viewId: 'com.android.chrome:id/url_bar' }], fieldTop: null, typed: 'i would start with reliable offline saving.', app: 'com.android.chrome', label: 'Chrome', at: 0, id: 'reddit-web', hasField: true });
  const write = jest.fn(async (_request: unknown, on?: { landed?: (text: string, slot: number) => void }) => {
    on?.landed?.('reliable offline saving comes first.', 1);
    return { drafts: ['reliable offline saving comes first.'] };
  });
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><Panel writer={{ write }} /></SafeAreaProvider>);
  await waitFor(() => expect(screen.getByText('Suggested replies · Reddit')).toBeTruthy());
  expect(write.mock.calls[0][0]).toMatchObject({ platform: { id: 'reddit', limit: 10000 }, typed: '', point: 'i would start with reliable offline saving.' });
  expect(screen.getByText('Yours')).toBeTruthy();
  expect(screen.getByText('Disagree')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Share this text' })).toBeTruthy();
});

// Replies are for a post on a feed app only: a chat with a readable message above the box
// withholds and never calls a writer.
test('a Slack reply with a readable message above still withholds', async () => {
  const SAM = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';
  (Native.capture as jest.Mock).mockResolvedValue({
    conversation: SAM, written: SAM,
    nodes: [{ text: 'I can bring the tent if you bring the stove.', left: 8, top: 40, bottom: 80, clickable: false }],
    fieldTop: 200, typed: '', app: 'com.Slack', label: 'Slack', at: 0, id: 'slack-chat', hasField: true,
  });
  const write = jest.fn(async () => ({ drafts: ['Yes.'] }));
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><Panel writer={{ write }} /></SafeAreaProvider>);
  await waitFor(() => expect(screen.getByText(words.replyWithheld)).toBeTruthy());
  expect(write).not.toHaveBeenCalled();
  for (const tag of [words.tagConfirm, words.tagBlocker, words.tagUnclear, words.replyYes]) expect(screen.queryByText(tag)).toBeNull();
});
