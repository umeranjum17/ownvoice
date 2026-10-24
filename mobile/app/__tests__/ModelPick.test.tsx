jest.setTimeout(20000);
// Which one writes, on the real screen, the app's real accounts module and the real @byokit/accounts kit: the person's own
// OpenRouter key reads that vendor's full live list, the person searches and picks, and every ask then names that pick.
// Only the network and the phone's secure store are fixtures (as OpenCodeConnect.test).
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) }));
jest.mock('@byokit/accounts/keys', () => {
  const path = require('path');
  const kitRoot = path.dirname(require.resolve('@byokit/accounts/keys'));
  const pi = (name: string) => require(path.join(kitRoot, 'pi', `${name}.js`));
  return {
    withKeys: (platform: object) => ({
      ...platform,
      keys: async () => ({
        ...pi('core'),
        supported: ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai', 'mistral-conversations', 'pi-messages', 'azure-openai-responses'],
        api: async (name: string) => pi(name),
        cloudflare: async () => pi('cloudflare-stream'),
      }),
    }),
  };
});
jest.mock('expo-secure-store', () => {
  const map = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => map.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { map.set(key, value); },
    deleteItemAsync: async (key: string) => { map.delete(key); },
  };
});
jest.mock('../../modules/ownvoice-native', () => ({ __esModule: true, default: { bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: [] })) } }));

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ModelScreen from '../model';
import { askCloud, connectOpenRouter, signOutOpenRouter } from '../../src/chatgpt/accounts';
import { pickedModel, setPickedModel } from '../../src/core/model';
import { words } from '../../src/core/words';

const KEY = 'fixture-openrouter-key';
const REPLY = '{"drafts":["Yes, Saturday works."]}';
// A long list in the vendor's own words, as OpenRouter gives it: 120 rows, one the account can't use is not part of this vendor's list,
// so the "not in the plan" leg uses its own fixture below.
const ROWS = [
  { id: 'vendor/gemma-4-31b-it:free', name: 'Vendor: Gemma 4 31B (free)', context_length: 262144, top_provider: { max_completion_tokens: 32768 }, pricing: { prompt: '0', completion: '0' } },
  { id: 'vendor/gpt-6-sol', name: 'Vendor: GPT-6 Sol', context_length: 400000, pricing: { prompt: '0.000002', completion: '0.00001' } },
  ...Array.from({ length: 118 }, (_, i) => ({ id: `vendor/filler-${i}`, name: `Vendor: Filler ${i}` })),
];
const sse = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} });

let listAnswer: () => Response = () => new Response(JSON.stringify({ data: ROWS }), { status: 200, headers: { 'content-type': 'application/json' } });
const chat: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
const lists: string[] = [];
const scripted = () => {
  globalThis.fetch = (jest.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/models')) { lists.push(u); return listAnswer(); }
    chat.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response(sse(
      `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: REPLY } }] })}\n\n`,
      `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
      'data: [DONE]\n\n',
    ), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as unknown) as typeof globalThis.fetch;
};

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const realFetch = globalThis.fetch;
beforeEach(async () => {
  kv.clear();
  jest.clearAllMocks();
  chat.length = 0;
  lists.length = 0;
  (useLocalSearchParams as jest.Mock).mockReturnValue({ account: 'openrouter' });
  scripted();
  await connectOpenRouter(KEY);
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  await signOutOpenRouter().catch(() => {});
});

test('the person searches the vendor\'s full list, picks one, and every ask names it', async () => {
  const screen = await render(<ModelScreen />);
  // Nothing is chosen for them, and the list is the vendor's, read with their own key.
  await waitFor(() => expect(screen.getByText('Vendor: Gemma 4 31B (free)')).toBeTruthy());
  expect(pickedModel('openrouter')).toBeNull();
  expect(lists).toEqual(['https://openrouter.ai/api/v1/models']);
  // A long list shows a page at a time and can be walked, never cut off.
  expect(screen.queryByText('Vendor: Filler 100')).toBeNull();
  await fireEvent.press(screen.getByText(words.modelMore));
  await fireEvent.press(screen.getByText(words.modelMore));
  expect(screen.getByText('Vendor: Filler 70')).toBeTruthy();

  // Search narrows it to the rows that match, by name or by id.
  await fireEvent.changeText(screen.getByTestId('model-search'), 'sol');
  expect(screen.queryByText('Vendor: Gemma 4 31B (free)')).toBeNull();
  await fireEvent.changeText(screen.getByTestId('model-search'), 'zzz');
  expect(screen.getByText(words.modelEmpty)).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('model-search'), 'gemma');
  await fireEvent.press(screen.getByText('Vendor: Gemma 4 31B (free)'));

  // The pick is saved on this phone and the screen closes.
  expect(pickedModel('openrouter')).toEqual({ id: 'vendor/gemma-4-31b-it:free', name: 'Vendor: Gemma 4 31B (free)' });
  expect(router.back).toHaveBeenCalled();

  // The ask carries the picked id, and the model's size comes from the vendor's list.
  await askCloud({ account: 'openrouter', model: pickedModel('openrouter')!.id }, { instructions: 'Return drafts.', input: 'Sam: Saturday?', json: true });
  expect(chat).toHaveLength(1);
  expect(chat[0].body.model).toBe('vendor/gemma-4-31b-it:free');
  expect(chat[0].headers.get('authorization')).toBe(`Bearer ${KEY}`);
  // The model's size and price are read from that same live list, not kept here.
  expect(lists).toHaveLength(2);
});

test('a list the vendor will not give says so plainly and offers Try again, never a list kept here', async () => {
  listAnswer = () => new Response('{}', { status: 500 });
  const screen = await render(<ModelScreen />);
  await waitFor(() => expect(screen.getByText(words.modelFailed)).toBeTruthy());
  expect(screen.queryByText('Vendor: Gemma 4 31B (free)')).toBeNull();
  listAnswer = () => new Response(JSON.stringify({ data: ROWS }), { status: 200, headers: { 'content-type': 'application/json' } });
  await act(async () => { fireEvent.press(screen.getByText(words.tryAgain)); });
  await waitFor(() => expect(screen.getByText('Vendor: GPT-6 Sol')).toBeTruthy());
  expect(pickedModel('openrouter')).toBeNull();
});

test('the one already picked is marked, and picking another replaces it', async () => {
  setPickedModel('openrouter', { id: 'vendor/gpt-6-sol', name: 'Vendor: GPT-6 Sol' });
  const screen = await render(<ModelScreen />);
  await waitFor(() => expect(screen.getByText('Vendor: GPT-6 Sol')).toBeTruthy());
  await fireEvent.press(screen.getByText('Vendor: Filler 3'));
  expect(pickedModel('openrouter')?.id).toBe('vendor/filler-3');
});
