jest.mock('../../core/polish', () => ({
  ...jest.requireActual('../../core/polish'),
  canPolish: jest.fn(async () => true),
}));

jest.mock('../../core/speller', () => {
  const fs = require('fs');
  const path = require('path');
  const nspell = require('nspell');
  const dictionary = path.resolve(__dirname, '../../../assets/dictionary');
  const spell = nspell(fs.readFileSync(`${dictionary}/en-affixes.aff`, 'utf8'), fs.readFileSync(`${dictionary}/en-words.dic`, 'utf8'));
  return { speller: async () => spell };
});
import { words } from '../../core/words';
import { phoneWriter } from '../phoneWriter';
import { AGREED_KEY } from '../../core/phoneDownload';

jest.mock('../../core/localModel', () => ({
  AGREED_KEY: 'local-model-agreed',
  MOBILE_KEY: 'local-model-mobile-data',
  getLocalModel: jest.fn(() => ({ state: { phase: 'installing' } })),
  localModelState: jest.fn(),
  agreedToDownload: jest.fn(),
  askLocal: jest.fn(),
  installLocalModel: jest.fn(),
  removeLocalModel: jest.fn(),
}));
import { agreedToDownload, askLocal, installLocalModel, localModelState } from '../../core/localModel';
const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
const mockAgreed = agreedToDownload as jest.MockedFunction<typeof agreedToDownload>;
const mockAsk = askLocal as jest.MockedFunction<typeof askLocal>;
const mockInstall = installLocalModel as jest.MockedFunction<typeof installLocalModel>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;

const SAM = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';
const LIST = 'I can bring the stove.\n1. I will bring the stove.\n2. You can bring the tent.';
const request = (over: { conversation?: string; written?: string; typed?: string; dashes?: 'keep' | 'remove'; avoid?: string[]; nodes?: { text: string; left: number; top: number; bottom: number; clickable: boolean }[]; fieldTop?: number } = {}) => ({
  conversation: over.conversation ?? SAM,
  written: over.written ?? SAM,
  nodes: over.nodes ?? [{ text: over.written ?? SAM, left: 0, top: 100, bottom: 180, clickable: false }],
  fieldTop: over.fieldTop ?? 200,
  typed: over.typed ?? '',
  dashes: over.dashes ?? ('remove' as const),
  avoid: over.avoid,
});

let clock = 1000;
const setClock = (value: number) => { clock = value; };

beforeEach(() => {
  jest.clearAllMocks();
  jest.requireMock('../../core/polish').canPolish.mockImplementation(async () => true);
  kv.clear();
  clock = 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  mockState.mockResolvedValue({ phase: 'ready' });
  mockAgreed.mockImplementation(() => kv.get(AGREED_KEY) === 'true');
  mockInstall.mockResolvedValue(undefined);
});

afterEach(() => { (Date.now as unknown as jest.SpyInstance).mockRestore(); });

test('emulator stub delivers insertable drafts without a phone model', async () => {
  const previous = process.env.EXPO_PUBLIC_E2E_STUB;
  process.env.EXPO_PUBLIC_E2E_STUB = '1';
  try {
    const landed: [string, number][] = [];
    const result = await phoneWriter.write(request(), { landed: (text, slot) => landed.push([text, slot]) });
    expect(result.drafts).toHaveLength(3);
    expect(landed).toEqual(result.drafts.map((text, slot) => [text, slot]));
    expect(mockState).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_E2E_STUB;
    else process.env.EXPO_PUBLIC_E2E_STUB = previous;
  }
});

// ---- Replies ----

test('the Sam message reaches the phone model as Latest message above Conversation, asking for labelled slots', async () => {
  mockAsk.mockResolvedValue(
    'Draft 1: Yes, still on! I can bring the stove if you get the tent.\nDraft 2: Saturday works — you bring the tent, I have the stove covered.\nDraft 3: Not sure about Saturday yet; who is bringing the stove?',
  );
  const landed: [string, number][] = [];
  await expect(phoneWriter.write(request(), { landed: (text, slot) => landed.push([text, slot]) })).resolves.toEqual({
    drafts: [
      'Yes, still on! I can bring the stove if you get the tent.',
      'Saturday works, you bring the tent, I have the stove covered.',
      'Not sure about Saturday yet; who is bringing the stove?',
    ],
  });
  const [prompt, maxTokens] = mockAsk.mock.calls[0];
  expect(prompt).toContain('Latest message:\nSam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.');
  expect(prompt).toContain('Every draft must respond to everything the latest message asks or offers.');
  expect(prompt).toContain('Draft 1:');
  expect(prompt).toContain('Say yes or agree, and answer each point.');
  expect(prompt).toContain(`Conversation:\n${SAM}`);
  expect(maxTokens).toBe(220);
  expect(mockAsk).toHaveBeenCalledTimes(1);
  expect(landed.map(([, slot]) => slot)).toEqual([0, 1, 2]);
  expect(landed.every(([text]) => text.includes('stove'))).toBe(true);
});

test('exact duplicate replies are dropped and their slots refilled with the shown texts off-limits', async () => {
  mockAsk.mockResolvedValueOnce(
    'Draft 1: Yep, still on for Saturday. 👍\nDraft 2: YEP still on for Saturday!\nDraft 3: Yep, still on for Saturday. 👍',
  );
  mockAsk.mockImplementation(async (prompt: string) => {
    if (prompt.includes('Give a different answer')) return 'Honestly, Saturday is packed — could we push to Sunday?';
    if (prompt.includes('Not sure yet')) return 'What time were you thinking for Saturday?';
    return 'Yep, still on for Saturday.';
  });
  const landed: [string, number][] = [];
  const { drafts } = await phoneWriter.write(request(), { landed: (text, slot) => landed.push([text, slot]) });
  expect(drafts).toEqual([
    'Yep, still on for Saturday. 👍',
    'Honestly, Saturday is packed, could we push to Sunday?',
    'What time were you thinking for Saturday?',
  ]);
  expect(mockAsk).toHaveBeenCalledTimes(3);
  expect(mockAsk.mock.calls[0][1]).toBe(220);
  expect(mockAsk.mock.calls[1][1]).toBe(120);
  expect(mockAsk.mock.calls[2][1]).toBe(120);
  const retry = mockAsk.mock.calls[1][0];
  expect(retry).toContain("Don't repeat these: Yep, still on for Saturday. 👍.");
  expect(retry).toContain('Give a different answer: decline or suggest a change, kindly, still answering each point.');
  expect(mockAsk.mock.calls[2][0]).toContain('Not sure yet');
  expect(landed.map(([, slot]) => slot)).toEqual([0, 1, 2]);
  expect(drafts[0]).toContain('Saturday');
  expect(drafts[1]).toContain('Sunday');
  expect(drafts[2]).toContain('Saturday');
});

test('a rejected middle reply refills the decline slot without shifting the unsure slot', async () => {
  mockAsk.mockResolvedValueOnce('Draft 1: Yes, Saturday works; I can bring the stove.\nDraft 2: YES Saturday works I can bring the stove!\nDraft 3: Not sure yet, what time?');
  mockAsk.mockResolvedValue('No, Saturday works; I can bring the stove.');
  const landed: number[] = [];
  const { drafts } = await phoneWriter.write(request(), { landed: (_text, slot) => landed.push(slot) });
  expect(mockAsk).toHaveBeenCalledTimes(2);
  expect(mockAsk.mock.calls[0][1]).toBe(220);
  expect(mockAsk.mock.calls[1][1]).toBe(120);
  expect(mockAsk.mock.calls[1][0]).toContain('Give a different answer');
  expect(mockAsk.mock.calls[1][0]).toContain('decline or suggest a change');
  expect(landed).toEqual([0, 2, 1]);
  expect(drafts).toEqual(['Yes, Saturday works; I can bring the stove.', 'No, Saturday works; I can bring the stove.', 'Not sure yet, what time?']);
  expect(drafts[0]).toContain('Yes');
  expect(drafts[1]).toContain('No');
  expect(drafts[2]).toContain('Not sure');
});

test('one streamed response retains all labelled slots without retries', async () => {
  mockAsk.mockResolvedValueOnce('Draft 1: Yes, I can bring it.\nDraft 2: No, could we change the day?\nDraft 3: Not sure; what time?');
  const landed: number[] = [];
  const { drafts } = await phoneWriter.write(request(), { landed: (_text, slot) => landed.push(slot) });
  expect(drafts).toEqual(['Yes, I can bring it.', 'No, could we change the day?', 'Not sure; what time?']);
  expect(landed).toEqual([0, 1, 2]);
  expect(mockAsk).toHaveBeenCalledTimes(1);
  expect(mockAsk.mock.calls[0][1]).toBe(220);
  expect(mockAsk.mock.calls[0][0]).toContain('Draft 1:');
  expect(mockAsk.mock.calls[0][0]).toContain('Draft 2:');
  expect(mockAsk.mock.calls[0][0]).toContain('Draft 3:');
  expect(drafts[0]).toContain('bring it');
  expect(drafts[1]).toContain('change');
  expect(drafts[2]).toContain('what time');
});

test('unlabelled continuation lines stay with their explicit draft', async () => {
  mockAsk.mockImplementationOnce(async () => {
    setClock(24000);
    return 'Draft 1: Saturday works.\nI can bring the stove.\nSee you there.';
  });
  mockAsk.mockResolvedValue('');
  const { drafts } = await phoneWriter.write(request());
  expect(drafts).toEqual(['Saturday works.\nI can bring the stove.\nSee you there.']);
  expect(mockAsk).toHaveBeenCalledTimes(3);
  expect(mockAsk.mock.calls[0][1]).toBe(220);
  expect(drafts[0]).toContain('Saturday');
  expect(drafts[0]).toContain('stove');
  expect(drafts[0]).toContain('See you');
});

test('inline labels fill their numbered slots after the time limit', async () => {
  mockAsk.mockImplementation(async () => { setClock(24000); return 'Draft 1: Yes. Draft 2: No. Draft 3: Maybe.'; });
  await expect(phoneWriter.write(request())).resolves.toEqual({ drafts: ['Yes.', 'No.', 'Maybe.'] });
});

test('a late single labelled reply retries both missing slots', async () => {
  mockAsk.mockImplementationOnce(async () => { setClock(24000); return 'Draft 1: Yes, Saturday works.'; });
  mockAsk.mockImplementation(async (prompt: string) => prompt.includes('Give a different answer')
    ? 'No, could we meet Sunday?' : 'What time on Saturday?');
  const result = await phoneWriter.write(request());
  expect(result).toEqual({ drafts: ['Yes, Saturday works.', 'No, could we meet Sunday?', 'What time on Saturday?'] });
  expect(mockAsk).toHaveBeenCalledTimes(3);
  expect(mockAsk.mock.calls[0][1]).toBe(220);
  expect(mockAsk.mock.calls[1][1]).toBe(120);
  expect(mockAsk.mock.calls[2][1]).toBe(120);
  expect(mockAsk.mock.calls[1][0]).toContain('Give a different answer');
  expect(mockAsk.mock.calls[2][0]).toContain('Not sure yet');
  expect(result.drafts[0]).toContain('Yes');
  expect(result.drafts[1]).toContain('No');
  expect(result.drafts[2]).toContain('What time');
});

test('an unlabelled line after two labels continues the second draft', async () => {
  mockAsk.mockImplementationOnce(async () => { setClock(24000); return 'Draft 1: Yes.\nDraft 2: No.\nWhat time?';
  });
  mockAsk.mockResolvedValue('');
  await expect(phoneWriter.write(request())).resolves.toEqual({ drafts: ['Yes.', 'No.\nWhat time?'] });
});

test('the last labelled reply can span lines without becoming another slot', async () => {
  mockAsk.mockImplementationOnce(async () => { setClock(24000); return 'Draft 1: Yes, Saturday works.\nDraft 2: No, Sunday?\nI can bring the stove then.';
  });
  mockAsk.mockResolvedValue('');
  await expect(phoneWriter.write(request())).resolves.toEqual({ drafts: ['Yes, Saturday works.', 'No, Sunday?\nI can bring the stove then.'] });
});

test('missing labelled first slot is retried without moving the other replies', async () => {
  mockAsk.mockResolvedValueOnce('Draft 2: No, Saturday is out.\nDraft 3: Not sure yet, what time?');
  mockAsk.mockResolvedValue('Yes, Saturday works.');
  const landed: number[] = [];
  const { drafts } = await phoneWriter.write(request(), { landed: (_text, slot) => landed.push(slot) });
  expect(mockAsk).toHaveBeenCalledTimes(2);
  expect(mockAsk.mock.calls[0][1]).toBe(220);
  expect(mockAsk.mock.calls[1][1]).toBe(120);
  expect(mockAsk.mock.calls[1][0]).toContain('Say yes or agree');
  expect(landed).toEqual([1, 2, 0]);
  expect(drafts).toEqual(['Yes, Saturday works.', 'No, Saturday is out.', 'Not sure yet, what time?']);
});

test('only a captured Skip button removes its exact draft line', async () => {
  mockAsk.mockResolvedValue('Draft 1: Yes, Saturday works. I will bring the stove.\nSkip\nDraft 2: No, could we meet Sunday?\nDraft 3: What time Saturday?');
  const captured = { ...request(), nodes: [
    ...request().nodes,
    { text: 'Skip', left: 0, top: 300, bottom: 330, clickable: true },
  ] };
  expect((await phoneWriter.write(captured)).drafts[0]).toBe('Yes, Saturday works. I will bring the stove.');
  expect((await phoneWriter.write(request())).drafts[0]).toBe('Yes, Saturday works. I will bring the stove.\nSkip');
});

test('practice controls after the message are not sent as the latest message', async () => {
  mockAsk.mockResolvedValueOnce('Draft 1: Saturday works.');
  mockAsk.mockResolvedValue('');
  await phoneWriter.write({ ...request(), conversation: 'Sam\nAre we still on for Saturday?\nI can bring the tent if you bring the stove.\nRecent activity\nClear last screen', nodes: [
    { text: 'Sam', left: 10, top: 100, bottom: 120, clickable: false },
    { text: 'Are we still on for Saturday?\nI can bring the tent if you bring the stove.', left: 30, top: 125, bottom: 170, clickable: false },
    { text: 'Recent activity', left: 30, top: 290, bottom: 310, clickable: true },
    { text: 'Clear last screen', left: 30, top: 320, bottom: 340, clickable: true },
  ] });
  expect(mockAsk.mock.calls[0][0]).toContain('Latest message:\nAre we still on for Saturday?\nI can bring the tent if you bring the stove.\n\nConversation:');
});

test('at least one reply that is not a plain yes survives, and retries stop after 8 seconds', async () => {
  setClock(1000);
  mockAsk.mockResolvedValueOnce('Draft 1: Yep, still on for Saturday. 👍');
  const retry = async (prompt: string) => {
    setClock(9500); // The 8-second cap passes before the second retry.
    return prompt.includes('Give a different answer') ? 'Could we do Sunday instead?' : 'Yep';
  };
  mockAsk.mockImplementation(async (prompt: string) => retry(prompt));
  const landed: [string, number][] = [];
  const { drafts } = await phoneWriter.write(request(), { landed: (text, slot) => landed.push([text, slot]) });
  expect(drafts).toEqual(['Yep, still on for Saturday. 👍', 'Could we do Sunday instead?']);
  expect(mockAsk).toHaveBeenCalledTimes(2);
  expect(landed.map(([, slot]) => slot)).toEqual([0, 1]);
});

test('one retry per slot; a failed retry leaves the slot empty', async () => {
  mockAsk.mockResolvedValueOnce('Draft 1: Yes, and I will bring the stove.');
  mockAsk.mockRejectedValueOnce(new Error('9')).mockResolvedValueOnce('What time on Saturday? I will bring the stove.');
  const { drafts } = await phoneWriter.write(request());
  expect(drafts).toEqual(['Yes, and I will bring the stove.', 'What time on Saturday? I will bring the stove.']);
  expect(mockAsk).toHaveBeenCalledTimes(3);
});

test('the shown avoid list never comes back (Write new ones)', async () => {
  mockAsk.mockResolvedValueOnce('Draft 1: Fresh plan, happy to bring the stove.\nDraft 2: Yep, still on for Saturday.\nDraft 3: Yep, still on for Saturday 👍');
  mockAsk.mockResolvedValue('Yep, still on for Saturday.');
  const { drafts } = await phoneWriter.write(request({ avoid: ['Yep, still on for Saturday.'] }));
  expect(drafts).toEqual(['Fresh plan, happy to bring the stove.']);
  expect(mockAsk).toHaveBeenCalledTimes(3);
  expect(mockAsk.mock.calls[0][1]).toBe(220);
  expect(mockAsk.mock.calls[1][1]).toBe(120);
  expect(mockAsk.mock.calls[2][1]).toBe(120);
  expect(mockAsk.mock.calls[1][0]).toContain("Don't repeat these: Yep, still on for Saturday.");
});

test('an empty completed stream retries the missing slots', async () => {
  mockAsk.mockResolvedValueOnce('');
  mockAsk.mockImplementation(async (prompt: string) => prompt.includes('Say yes or agree')
    ? 'Yes, Saturday works; I can bring the stove.' : '');
  await expect(phoneWriter.write(request())).resolves.toEqual({ drafts: ['Yes, Saturday works; I can bring the stove.'] });
  expect(mockAsk).toHaveBeenCalledTimes(4);
});

test('no usable reply at all resolves empty instead of throwing', async () => {
  mockAsk.mockResolvedValueOnce('Here are three versions:');
  mockAsk.mockResolvedValue('“Here is the reply:”');
  await expect(phoneWriter.write(request())).resolves.toEqual({ drafts: [] });
  expect(mockAsk).toHaveBeenCalledTimes(4);
});

test('a hard failure surfaces as plain words', async () => {
  mockAsk.mockRejectedValue(new Error('9'));
  await expect(phoneWriter.write(request())).rejects.toThrow(words.busy);
});

test('download does not spend the reply-fill window', async () => {
  mockState.mockResolvedValue({ phase: 'not-installed' });
  kv.set(AGREED_KEY, 'true');
  mockInstall.mockImplementation(async () => { setClock(20000); });
  mockAsk.mockResolvedValueOnce('Draft 1: Yes, I can bring the stove.');
  mockAsk.mockImplementation(async (prompt: string) => prompt.includes('Give a different answer')
    ? 'No, could we meet Sunday?' : 'What time on Saturday?');
  const { drafts } = await phoneWriter.write(request());
  expect(drafts).toEqual(['Yes, I can bring the stove.', 'No, could we meet Sunday?', 'What time on Saturday?']);
  expect(mockAsk).toHaveBeenCalledTimes(3);
});

test('the model gets downloaded once, with the progress note and bar before writing', async () => {
  mockState.mockResolvedValue({ phase: 'not-installed' });
  kv.set(AGREED_KEY, 'true');
  const states: string[] = [];
  const fractions: number[] = [];
  mockInstall.mockImplementation(async (mobile, onProgress) => {
    expect(mobile).toBe(false);
    expect(states).toEqual(['downloading']);
    onProgress(0.5);
  });
  mockAsk.mockImplementation(async () => { expect(states).toEqual(['downloading', 'writing']); return 'Draft 1: Yes, I will bring the stove.\nDraft 2: Not sure yet, what time works?\nDraft 3: Sunday works better for me and my stove.'; });
  await expect(phoneWriter.write(request(), { state: state => states.push(state), fraction: f => fractions.push(f) })).resolves.toBeTruthy();
  expect(mockInstall).toHaveBeenCalledTimes(1);
  expect(fractions).toEqual([0, 0.5]);
});

test('without the person\'s yes the panel never downloads, and points to Ownvoice in plain words', async () => {
  mockState.mockResolvedValue({ phase: 'not-installed' });
  await expect(phoneWriter.write(request())).rejects.toThrow(words.readyPanel);
  expect(mockInstall).not.toHaveBeenCalled();
  expect(kv.has(AGREED_KEY)).toBe(false);
});

test('a phone that cannot write never starts a download', async () => {
  mockState.mockResolvedValue({ phase: 'unsupported' });
  await expect(phoneWriter.write(request())).rejects.toThrow(words.unsupported);
  expect(mockInstall).not.toHaveBeenCalled();
});

test('a phone still getting ready is waited for without recording a yes', async () => {
  let reads = 0;
  mockState.mockImplementation(async () => ({ phase: ++reads <= 2 ? 'installing' : 'ready' }) as { phase: 'installing' | 'ready' });
  mockAsk.mockImplementation(async () => {
    return 'Draft 1: Yes, I will bring the stove.\nDraft 2: Not sure yet, what time works?\nDraft 3: Sunday works better for me and my stove.';
  });
  const states: string[] = [];
  const { drafts } = await phoneWriter.write(request(), { state: state => states.push(state) });
  expect(states).toEqual(['downloading', 'writing']);
  expect(drafts).toHaveLength(3);
  expect(mockInstall).not.toHaveBeenCalled();
  expect(kv.has(AGREED_KEY)).toBe(false);
});

// ---- Polish and compose ----

test('phone polish declines the exact captured nonsense before a reordered alternate', async () => {
  jest.requireMock('../../core/polish').canPolish.mockImplementation(jest.requireActual('../../core/polish').canPolish);
  const typed = 'purple toaster clouds ate the database backwards banana banana';
  const bad = 'the database got eaten backwards by purple toaster clouds banana banana';
  mockAsk.mockResolvedValueOnce('UNCLEAR').mockResolvedValueOnce(JSON.stringify({ versions: [typed, bad] }));
  const landed = jest.fn();
  expect(await phoneWriter.write(request({ typed }), { landed })).toEqual({ drafts: [], declined: true });
  expect(mockAsk).toHaveBeenCalledTimes(1);
  expect(mockAsk.mock.calls[0][0]).toContain(typed);
  expect(landed).not.toHaveBeenCalled();
  mockAsk.mockReset();
});

test('polish runs the C2 rewrite through the phone model and lands labelled versions', async () => {
  mockAsk.mockResolvedValue('{"versions":["I will bring the stove. You are on the tent.","Stove: mine. Tent: yours. All agreed."]}');
  const landed: [string, number, string?][] = [];
  const { drafts } = await phoneWriter.write(request({ typed: 'i shoud bring the stove, super excited' }), { landed: (text, slot, label) => landed.push([text, slot, label]) });
  expect(drafts).toHaveLength(3);
  const [prompt, maxTokens] = mockAsk.mock.calls[0];
  expect(prompt).toContain('{"versions":["...","..."]}');
  expect(prompt).not.toContain('Light touch:');
  expect(prompt).toContain('Their text:\ni shoud bring the stove, super excited');
  expect(prompt).toContain("Don't add long dashes (—).");
  expect(prompt).toContain('their dashes: remove');
  expect(maxTokens).toBe(256);
  expect(landed.map(([, slot, label]) => [slot, label])).toEqual([[0, 'Cleaned up'], [1, 'Shorter'], [2, 'Main point first']]);
});

test('a polish of the numbered list keeps the list, after one layout fix', async () => {
  mockAsk.mockImplementation(async (prompt: string) => {
    if (prompt.includes('{"versions"')) return '{"versions":["I can bring the stove. 1. I will bring the stove. 2. You can bring the tent."]}';
    if (prompt.includes('Row 1:')) return 'Row 1: Stove is on me.\nRow 2: I will bring the stove.\nRow 3: You can bring the tent.';
    if (prompt.includes('Tighter:')) return 'Stove split.\n1. I bring the stove.\n2. Tent is yours.';
    return 'Stove and tent split:\n1. The stove is mine to bring.\n2. The tent is yours to bring.';
  });
  const { drafts } = await phoneWriter.write(request({ typed: LIST }));
  expect(drafts).toHaveLength(2);
  expect(drafts[0]).toBe('Stove is on me.\n1. I will bring the stove.\n2. You can bring the tent.');
  for (const draft of drafts) { expect(draft).toMatch(/1\. /); expect(draft).toMatch(/2\. /); }
  expect(mockAsk).toHaveBeenCalledTimes(3);
});

test('every shown card keeps the list; a fix that duplicates a shown card is dropped', async () => {
  mockAsk.mockImplementation(async (prompt: string) => {
    if (prompt.includes('{"versions"')) return '{"versions":["I bring the stove and you bring the tent.","Stove plan:\\n1. Stove: mine.\\n2. Tent: yours."]}';
    return 'Stove plan:\n1. Stove: mine.\n2. Tent: yours.';
  });
  const { drafts } = await phoneWriter.write(request({ typed: LIST }));
  expect(drafts).toHaveLength(1);
  for (const draft of drafts) {
    expect(draft).toMatch(/1\. /);
    expect(draft).toMatch(/2\. /);
  }
});

test('flattened versions losing numbers leave no accepted cards', async () => {
  mockAsk.mockImplementation(async (prompt: string) => prompt.includes('{"versions"')
    ? '{"versions":["Flat stove and tent plan."]}' : 'Still one flat line, again.');
  expect(await phoneWriter.write(request({ typed: LIST }))).toEqual({ drafts: [], unchanged: false });
});

test('no accepted polish leaves the original out of cleaned-up cards', async () => {
  mockAsk.mockImplementation(async (prompt: string) => prompt.includes('{"versions"')
    ? '{"versions":["unchanged input"]}' : 'unchanged input');
  expect(await phoneWriter.write(request({ typed: 'unchanged input' }))).toEqual({ drafts: [], unchanged: true });
});

test('only writer evidence of unchanged text marks an already-minimal list unchanged', async () => {
  const minimal = 'Quick update:\n\n1. Pack the stove\n2. Meet Saturday';
  mockAsk.mockResolvedValue('{"versions":["Quick update:\\n\\n1. Pack the stove\\n2. Meet Saturday","Quick update:\\n1. Pack the stove\\n2. Meet Saturday","Quick update:\\n\\n1. Pack the stove\\n2. Meet Saturday"]}');
  expect(await phoneWriter.write(request({ typed: minimal }))).toEqual({ drafts: [], unchanged: true });
  mockAsk.mockResolvedValue('{"versions":["Pack the stove, meet Saturday."]}');
  expect(await phoneWriter.write(request({ typed: minimal }))).toEqual({ drafts: [], unchanged: false });
});

test('a version equal to the writer text is dropped; dashes stay when their own text uses them', async () => {
  mockAsk.mockResolvedValueOnce('{"versions":["Yours — dashed","Yours — dashed, kept."]}')
    .mockResolvedValue('Yours — dashed');
  const { drafts } = await phoneWriter.write(request({ typed: 'Yours — dashed', dashes: 'keep' }));
  expect(drafts).toEqual(['Yours — dashed, kept.']);
});

test('their dash rule is removed by the writer even when the model leaks one', async () => {
  mockAsk.mockResolvedValue('{"versions":["Yes — see you Saturday then","Other one here","And a third version"]}');
  const { drafts } = await phoneWriter.write(request({ typed: 'see you Saturday' }));
  expect(drafts[0]).toBe('Yes, see you Saturday then');
});

test('polish prompts carry the avoid list', async () => {
  mockAsk.mockResolvedValue('{"versions":["Totally new words appear here.","Another fresh angle entirely.","And one more rewrite too."]}');
  await expect(phoneWriter.write(request({ typed: 'i shoud bring the stove, super excited', avoid: ['I can bring the stove.', 'Something different entirely.'] }))).resolves.toBeTruthy();
  expect(mockAsk.mock.calls[0][0]).toContain("Don't repeat these: I can bring the stove.; Something different entirely.");
});

test('the prompt carries the nearest message above the field and never the controls below it', async () => {
  const nodes = [
    { text: 'Ownvoice', left: 10, top: 60, bottom: 120, clickable: false },
    { text: 'Are we still on for Saturday?', left: 30, top: 290, bottom: 340, clickable: false },
    { text: 'I can bring the tent if you bring the stove.', left: 30, top: 360, bottom: 410, clickable: false },
    { text: 'Recent activity: 0', left: 30, top: 720, bottom: 780, clickable: false },
    { text: 'Clear last screen', left: 30, top: 800, bottom: 860, clickable: false },
  ];
  mockAsk.mockResolvedValueOnce('Draft 1: Yes, and I will bring the stove.\nDraft 2: Not sure yet, what time works?\nDraft 3: Sunday is better for me and the stove.');
  await phoneWriter.write(request({ nodes, fieldTop: 430 }));
  const prompt = mockAsk.mock.calls[0][0] as string;
  expect(prompt).toContain('Latest message:\nAre we still on for Saturday?\nI can bring the tent if you bring the stove.');
  expect(prompt).not.toContain('Recent activity');
  expect(prompt).not.toContain('Clear last screen');
});

test('emulator stub hands an already-minimal text back unchanged', async () => {
  process.env.EXPO_PUBLIC_E2E_STUB = '1';
  try {
    expect(await phoneWriter.write(request({ typed: 'Quick update:\n\n1. Pack the stove\n2. Meet Saturday' }))).toEqual({ drafts: [], unchanged: true });
  } finally { delete process.env.EXPO_PUBLIC_E2E_STUB; }
});

test.each([
  ['Its a good plan.', "It's a good plan.", "It's a good plan."],
  ['Its a plan. We shoud go.', "It's a plan. We should go.", "It's a plan. We shoud go."],
  ['Keep your right hand warm. I shoud leave.', 'Keep your right hand warm. I should leave.'],
  ['We shoud shoud go.', 'We should should go.'],
  ['Meet by teh the evening.', 'Meet by the evening.'],
  ['Meet by the The the evening.', 'Meet by the evening.'],
  ['Its a good plan, I shoud be there by the the evening.', "It's a good plan, I should be there by the evening."],
  ['Its a good plan, I shoud be there by the the evening.', "It's a good plan, I should be there by the evening.", "It's a good plan, I shoud be there by the the evening."],
  ['Its a good plan, Umer shoud be there by the the evening.', "It's a good plan, Umer should be there by the evening."],
  ['I shoud call at noon and leave at midnight.', 'I should call at noon and leave at midnight.', 'I should call at midnight and leave at noon.'],
  ['I shoud visit Bora Bora with @will.', 'I should visit Bora Bora with @will.', 'I should visit Bora with @bill.'],
])('Cleaned up fixes slips and keeps the rest: %s', async (typed, expected, answer = typed) => {
  mockAsk.mockResolvedValue(JSON.stringify({ versions: [answer, typed] }));
  const landed = jest.fn();
  const result = await phoneWriter.write(request({ typed }), { landed });
  expect(result.drafts).toContain(expected);
  expect(landed).toHaveBeenCalledWith(expected, 0, 'Cleaned up');
  expect(result.unchanged).toBe(false);
});

test.each(['Its own engine', 'Bring woud for the fire.', 'We should visit Bora Bora.', "Give Ben Ben's keys.", 'Hey @will will you join us?'])('phone cleanup preserves %s', async typed => {
  mockAsk.mockResolvedValue(JSON.stringify({ versions: [typed, typed] }));
  const landed = jest.fn();
  const result = await phoneWriter.write(request({ typed }), { landed });
  expect(result).toEqual({ drafts: [], unchanged: true });
  expect(landed).not.toHaveBeenCalled();
});
