import Native from '../../../modules/ownvoice-native';
import { words } from '../../core/words';
import { phoneWriter } from '../phoneWriter';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  modelStatus: jest.fn(), downloadModel: jest.fn(), drafts: jest.fn(), ask: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;

const SAM = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';
const LIST = 'I can bring the stove.\n1. I will bring the stove.\n2. You can bring the tent.';
const request = (over: { conversation?: string; written?: string; typed?: string; dashes?: 'keep' | 'remove'; avoid?: string[] } = {}) => ({
  conversation: over.conversation ?? SAM,
  written: over.written ?? SAM,
  nodes: [{ text: over.written ?? SAM, top: 100, bottom: 180, clickable: false }],
  fieldTop: 200,
  typed: over.typed ?? '',
  dashes: over.dashes ?? ('remove' as const),
  avoid: over.avoid,
});

let clock = 1000;
const setClock = (value: number) => { clock = value; };

beforeEach(() => {
  jest.clearAllMocks();
  clock = 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  native.modelStatus.mockResolvedValue('available');
});

afterEach(() => { (Date.now as unknown as jest.SpyInstance).mockRestore(); });

// ---- Replies ----

test('the Sam message reaches the phone model as Latest message above Conversation, asking for labelled slots', async () => {
  native.drafts.mockResolvedValue([
    'Draft 1: Yes, still on! I can bring the stove if you get the tent.\nDraft 2: Saturday works — you bring the tent, I have the stove covered.\nDraft 3: Not sure about Saturday yet; who is bringing the stove?',
  ]);
  const landed: [string, number][] = [];
  await expect(phoneWriter.write(request(), { landed: (text, slot) => landed.push([text, slot]) })).resolves.toEqual({
    drafts: [
      'Yes, still on! I can bring the stove if you get the tent.',
      'Saturday works, you bring the tent, I have the stove covered.',
      'Not sure about Saturday yet; who is bringing the stove?',
    ],
  });
  const [prompt, options] = native.drafts.mock.calls[0];
  expect(prompt).toContain('Latest message:\nSam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.');
  expect(prompt).toContain('Every draft must respond to everything the latest message asks or offers.');
  expect(prompt).toContain('Draft 1:');
  expect(prompt).toContain('Say yes or agree, and answer each point.');
  expect(prompt).toContain(`Conversation:\n${SAM}`);
  expect(options).toEqual({ candidates: 1, maxTokens: 220 });
  expect(landed.map(([, slot]) => slot)).toEqual([0, 1, 2]);
  expect(landed.every(([text]) => text.includes('stove'))).toBe(true);
});

test('exact duplicate replies are dropped and their slots refilled with the shown texts off-limits', async () => {
  native.drafts.mockResolvedValue([
    'Draft 1: Yep, still on for Saturday. 👍\nDraft 2: YEP still on for Saturday!\nDraft 3: Yep, still on for Saturday. 👍',
  ]);
  native.ask.mockImplementation(async (_id: string, prompt: string) => {
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
  expect(native.ask).toHaveBeenCalledTimes(2);
  const retry = native.ask.mock.calls[0][1];
  expect(retry).toContain("Don't repeat these: Yep, still on for Saturday. 👍.");
  expect(retry).toContain('Give a different answer: decline or suggest a change, kindly, still answering each point.');
  expect(landed.map(([, slot]) => slot)).toEqual([0, 1, 2]);
});

test('a rejected middle reply refills the decline slot without shifting the unsure slot', async () => {
  native.drafts.mockResolvedValue(['Draft 1: Yes, Saturday works; I can bring the stove.\nDraft 2: YES Saturday works I can bring the stove!\nDraft 3: Not sure yet, what time?']);
  native.ask.mockResolvedValue('No, Saturday works; I can bring the stove.');
  const landed: number[] = [];
  const { drafts } = await phoneWriter.write(request(), { landed: (_text, slot) => landed.push(slot) });
  expect(native.ask).toHaveBeenCalledTimes(1);
  expect(native.ask.mock.calls[0][1]).toContain('Give a different answer');
  expect(landed).toEqual([0, 2, 1]);
  expect(drafts).toEqual(['Yes, Saturday works; I can bring the stove.', 'No, Saturday works; I can bring the stove.', 'Not sure yet, what time?']);
});

test('mixed labelled and unlabelled replies retain their slots without retries', async () => {
  native.drafts.mockResolvedValue(['Draft 1: Yes, I can bring it.', 'No, could we change the day?', 'Not sure; what time?']);
  const landed: number[] = [];
  const { drafts } = await phoneWriter.write(request(), { landed: (_text, slot) => landed.push(slot) });
  expect(drafts).toEqual(['Yes, I can bring it.', 'No, could we change the day?', 'Not sure; what time?']);
  expect(landed).toEqual([0, 1, 2]);
  expect(native.ask).not.toHaveBeenCalled();
});

test('missing labelled first slot is retried without moving the other replies', async () => {
  native.drafts.mockResolvedValue(['Draft 2: No, Saturday is out.\nDraft 3: Not sure yet, what time?']);
  native.ask.mockResolvedValue('Yes, Saturday works.');
  const landed: number[] = [];
  const { drafts } = await phoneWriter.write(request(), { landed: (_text, slot) => landed.push(slot) });
  expect(native.ask).toHaveBeenCalledTimes(1);
  expect(native.ask.mock.calls[0][1]).toContain('Say yes or agree');
  expect(landed).toEqual([1, 2, 0]);
  expect(drafts).toEqual(['Yes, Saturday works.', 'No, Saturday is out.', 'Not sure yet, what time?']);
});

test('practice controls after the message are not sent as the latest message', async () => {
  native.drafts.mockResolvedValue(['Draft 1: Saturday works.']);
  native.ask.mockResolvedValue('');
  await phoneWriter.write({ ...request(), conversation: 'Sam\nAre we still on for Saturday?\nI can bring the tent if you bring the stove.\nRecent activity\nClear last screen', nodes: [
    { text: 'Sam', top: 100, bottom: 120, clickable: false },
    { text: 'Are we still on for Saturday?\nI can bring the tent if you bring the stove.', top: 125, bottom: 170, clickable: false },
    { text: 'Recent activity', top: 290, bottom: 310, clickable: true },
    { text: 'Clear last screen', top: 320, bottom: 340, clickable: true },
  ] });
  expect(native.drafts.mock.calls[0][0]).toContain('Latest message:\nAre we still on for Saturday?\nI can bring the tent if you bring the stove.\n\nConversation:');
});

test('at least one reply that is not a plain yes survives, and retries stop after 8 seconds', async () => {
  setClock(1000);
  native.drafts.mockResolvedValue(['Draft 1: Yep, still on for Saturday. 👍']);
  const retry = async (prompt: string) => {
    setClock(9500); // The 8-second cap passes before the second retry.
    return prompt.includes('Give a different answer') ? 'Could we do Sunday instead?' : 'Yep';
  };
  native.ask.mockImplementation(async (_id: string, prompt: string) => retry(prompt));
  const landed: [string, number][] = [];
  const { drafts } = await phoneWriter.write(request(), { landed: (text, slot) => landed.push([text, slot]) });
  expect(drafts).toEqual(['Yep, still on for Saturday. 👍', 'Could we do Sunday instead?']);
  expect(native.ask).toHaveBeenCalledTimes(1);
  expect(landed.map(([, slot]) => slot)).toEqual([0, 1]);
});

test('one retry per slot; a failed retry leaves the slot empty', async () => {
  native.drafts.mockResolvedValue(['Draft 1: Yes, and I will bring the stove.']);
  native.ask.mockRejectedValueOnce(new Error('9')).mockResolvedValueOnce('What time on Saturday? I will bring the stove.');
  const { drafts } = await phoneWriter.write(request());
  expect(drafts).toEqual(['Yes, and I will bring the stove.', 'What time on Saturday? I will bring the stove.']);
  expect(native.ask).toHaveBeenCalledTimes(2);
});

test('the shown avoid list never comes back (Write new ones)', async () => {
  native.drafts.mockResolvedValue(['Draft 1: Fresh plan, happy to bring the stove.\nDraft 2: Yep, still on for Saturday.\nDraft 3: Yep, still on for Saturday 👍']);
  native.ask.mockResolvedValue('Yep, still on for Saturday.');
  const { drafts } = await phoneWriter.write(request({ avoid: ['Yep, still on for Saturday.'] }));
  expect(drafts).toEqual(['Fresh plan, happy to bring the stove.']);
  expect(native.ask).toHaveBeenCalledTimes(2);
  expect(native.ask.mock.calls[0][1]).toContain("Don't repeat these: Yep, still on for Saturday.");
});

test('no usable reply at all resolves empty instead of throwing', async () => {
  native.drafts.mockResolvedValue(['Here are three versions:']);
  native.ask.mockResolvedValue('“Here is the reply:”');
  await expect(phoneWriter.write(request())).resolves.toEqual({ drafts: [] });
  expect(native.ask).toHaveBeenCalledTimes(3); // all three slots, one retry each
});

test('a hard failure surfaces as plain words', async () => {
  native.drafts.mockRejectedValue(new Error('9'));
  await expect(phoneWriter.write(request())).rejects.toThrow(words.busy);
});

test('the model gets downloaded once, with the progress note before writing', async () => {
  native.modelStatus.mockResolvedValue('downloadable');
  const states: string[] = [];
  native.downloadModel.mockImplementation(async () => { expect(states).toEqual(['downloading']); });
  native.drafts.mockImplementation(async () => { expect(states).toEqual(['downloading', 'writing']); return ['Draft 1: Yes, I will bring the stove.\nDraft 2: Not sure yet, what time works?\nDraft 3: Sunday works better for me and my stove.']; });
  await expect(phoneWriter.write(request(), { state: state => states.push(state) })).resolves.toBeTruthy();
  expect(native.downloadModel).toHaveBeenCalledTimes(1);
});

// ---- Polish and compose ----

test('polish runs the C2 rewrite through the phone model and lands labelled versions', async () => {
  native.ask.mockResolvedValue('{"versions":["I can bring the stove.","I will bring the stove. You are on the tent.","Stove: mine. Tent: yours. Saturday: on."]}');
  const landed: [string, number, string?][] = [];
  const { drafts } = await phoneWriter.write(request({ typed: 'i can bring the stove, super excited' }), { landed: (text, slot, label) => landed.push([text, slot, label]) });
  expect(drafts).toHaveLength(3);
  const [, prompt, options] = native.ask.mock.calls[0];
  expect(prompt).toContain('{"versions"');
  expect(prompt).toContain('Their text:\ni can bring the stove, super excited');
  expect(prompt).toContain("Don't add long dashes (—).");
  expect(prompt).toContain('their dashes: remove');
  expect(options).toEqual({ maxTokens: 256 });
  expect(landed.map(([, slot, label]) => [slot, label])).toEqual([[0, 'Cleaned up'], [1, 'Shorter'], [2, 'Main point first']]);
});

test('a polish of the numbered list keeps the list, after one layout fix', async () => {
  native.ask.mockImplementation(async (_id: string, prompt: string) => {
    if (prompt.includes('{"versions"')) return '{"versions":["I can bring the stove, and you the tent."]}';
    if (prompt.includes('Keep their line breaks and list exactly.')) return 'Stove is on me.\n1. I will bring the stove.\n2. You can bring the tent.';
    if (prompt.includes('Tighter:')) return 'Saturday works.\n1. I bring the stove.\n2. Tent is yours.';
    return 'Stove and tent split:\n1. The stove is mine to bring.\n2. The tent is yours to bring.';
  });
  const { drafts } = await phoneWriter.write(request({ typed: LIST }));
  expect(drafts).toHaveLength(3);
  expect(drafts[0]).toBe('Stove is on me.\n1. I will bring the stove.\n2. You can bring the tent.');
  for (const draft of drafts) { expect(draft).toMatch(/1\. /); expect(draft).toMatch(/2\. /); }
  expect(native.ask).toHaveBeenCalledTimes(4); // one rewrite call, two slot fallbacks, one layout fix
});

test('every shown card keeps the list; a fix that duplicates a shown card is dropped', async () => {
  native.ask.mockImplementation(async (_id: string, prompt: string) => {
    if (prompt.includes('{"versions"')) return '{"versions":["I bring the stove and you bring the tent.","Saturday plan:\\n1. I bring the stove.\\n2. You bring the tent, please.","Saturday plan:\\n1. Stove: mine.\\n2. Tent: yours."]}';
    return 'Saturday plan:\n1. Stove: mine.\n2. Tent: yours.';
  });
  const { drafts } = await phoneWriter.write(request({ typed: LIST }));
  expect(drafts).toHaveLength(2);
  for (const draft of drafts) {
    expect(draft).toMatch(/1\. /);
    expect(draft).toMatch(/2\. /);
  }
});

test('a version that stays flattened after its fix is dropped', async () => {
  native.ask.mockImplementation(async (_id: string, prompt: string) => {
    if (prompt.includes('{"versions"')) return '{"versions":["I can bring the stove, and you the tent.","I can bring the stove.\n1. I will bring the stove.","Third:\n1. different\n2. version there"]}';
    return 'Still one flat line, again.';
  });
  const { drafts } = await phoneWriter.write(request({ typed: LIST }));
  expect(drafts).toEqual(['Third:\n1. different\n2. version there']);
});

test('a version equal to the writer text is dropped; dashes stay when their own text uses them', async () => {
  native.ask.mockResolvedValueOnce('{"versions":["Yours — dashed","Yours — dashed, kept."]}')
    .mockResolvedValue('Yours — dashed');
  const { drafts } = await phoneWriter.write(request({ typed: 'yours — dashed', dashes: 'keep' }));
  expect(drafts).toEqual(['Yours — dashed, kept.']);
});

test('their dash rule is removed by the writer even when the model leaks one', async () => {
  native.ask.mockResolvedValue('{"versions":["Yes — see you","Other one here","And a third version"]}');
  const { drafts } = await phoneWriter.write(request({ typed: 'see you saturday' }));
  expect(drafts[0]).toBe('Yes, see you');
});

test('polish prompts carry the avoid list', async () => {
  native.ask.mockResolvedValue('{"versions":["Totally new words appear here.","Another fresh angle entirely.","And one more rewrite too."]}');
  await expect(phoneWriter.write(request({ typed: 'i can bring the stove, super excited', avoid: ['I can bring the stove.', 'Something different entirely.'] }))).resolves.toBeTruthy();
  expect(native.ask.mock.calls[0][1]).toContain("Don't repeat these: I can bring the stove.; Something different entirely.");
});
