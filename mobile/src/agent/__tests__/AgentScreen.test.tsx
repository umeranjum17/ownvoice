import { Share } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import AgentScreen from '../Screen';
import Agent from '../../../app/agent';
import { labBrain } from '../labBrain';
import type { Brain, Call, Turn } from '../loop';
import { setSource } from '../../core/source';
import { words, technicalWords } from '../../core/words';
import { SendVeto } from '../../core/writers';
import { CHATGPT_OFF } from '../../core/switch';
import Native from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  modelStatus: jest.fn(async () => 'available'), bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: [] })),
} }));

const native = Native as jest.Mocked<typeof Native>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const call = (id: string, name: string, args: object): Call => ({ id, name, args: JSON.stringify(args) });
const FIRST = 'Hi Sam, Saturday is out for me.';
const LAST = 'Hi Sam, I can’t make Saturday. Sunday after 2 works.';

/** A scripted brain: each step streams its text, then hands back its calls; the calls are recorded. */
function scripted(...turns: (Turn | Error)[]) {
  const steps: number[] = [];
  const brain: Brain = { step: jest.fn(async (_i, _items, _tools, onText) => {
    steps.push(steps.length + 1);
    const turn = turns.shift();
    if (!turn) throw new Error('no more turns');
    if (turn instanceof Error) throw turn;
    for (const piece of turn.text.split(/(?<= )/)) if (piece) onText?.(piece);
    return turn;
  }) };
  return brain;
}
const loop = () => scripted(
  { text: FIRST, calls: [call('c1', 'check_voice', { draft: FIRST, original: 'Reply to Sam' })] },
  { text: '', calls: [call('c2', 'check_voice', { draft: LAST, original: 'Reply to Sam' })] },
  { text: '', calls: [call('c3', 'share_note', { title: 'Sam', body: LAST })] },
  { text: 'Shared your note.', calls: [] },
);

const shown = (): string[] => {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node === 'object' && Array.isArray((node as { children?: unknown }).children)) (node as { children: unknown[] }).children.forEach(walk);
  };
  walk(screen.toJSON());
  return out;
};
const plain = () => { const all = shown(); expect(all.filter(x => technicalWords.test(x) || /check_voice|share_note|function|tool/i.test(x))).toEqual([]); return all; };

const open = async (brains: Parameters<typeof AgentScreen>[0]['brains']) => {
  await render(<AgentScreen brains={brains} />);
  await act(async () => { await Promise.resolve(); });
};
const ask = async (task: string) => {
  await fireEvent.changeText(screen.getByLabelText(words.agentAsk), task);
  await fireEvent.press(screen.getByRole('button', { name: words.agentGo }));
};

let share: jest.SpyInstance;
beforeEach(() => {
  kv.clear();
  jest.clearAllMocks();
  native.modelStatus.mockResolvedValue('available');
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
});

describe('without a paired computer (plan §7)', () => {
  test('ChatGPT chosen: the full loop, one plain line per step, a share card, then done', async () => {
    setSource('chatgpt');
    const chatgpt = loop(), local = scripted();
    await open({ plan,local });
    await ask('Reply to Sam: can’t make Saturday, offer Sunday after 2.');
    expect(await screen.findByText(words.agentShareTitle)).toBeTruthy();
    // The card shows exactly the text that would leave the app, and nothing has gone yet.
    expect(screen.getByText(LAST)).toBeTruthy();
    expect(share).not.toHaveBeenCalled();
    plain();
    await fireEvent.press(screen.getByRole('button', { name: words.agentShare }));
    await waitFor(() => expect(screen.getByText('Shared your note.')).toBeTruthy());
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ message: LAST });
    expect(screen.getByText(LAST)).toBeTruthy();
    expect(plan.step).toHaveBeenCalledTimes(4);
    expect(local.step).not.toHaveBeenCalled();
    plain();
  });

  test('phone chosen and ready: the phone writes, and ChatGPT is never asked', async () => {
    setSource('phone');
    const chatgpt = scripted(), local = loop();
    await open({ plan,local });
    await ask('Reply to Sam');
    expect(await screen.findByText(words.agentShareTitle)).toBeTruthy();
    expect(local.step).toHaveBeenCalledTimes(3);
    expect(plan.step).not.toHaveBeenCalled();
  });

  test.each([
    ['phone chosen but it can\'t write', () => { setSource('phone'); native.modelStatus.mockResolvedValue('unavailable'); }],
    ['nothing chosen', () => { setSource(null); }],
  ])('%s: choose how Ownvoice writes first, nothing is asked', async (_name, arrange) => {
    arrange();
    const chatgpt = loop(), local = loop();
    await open({ plan,local });
    expect(await screen.findByText(words.needWriterPanel)).toBeTruthy();
    expect(screen.queryByLabelText(words.agentAsk)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: words.openOwnvoice }));
    expect(router.push).toHaveBeenCalledWith('/source');
    expect(plan.step).not.toHaveBeenCalled();
    expect(local.step).not.toHaveBeenCalled();
    plain();
  });

  test('a task that needs email or a calendar: one plain sentence, then the share card', async () => {
    setSource('chatgpt');
    const chatgpt = scripted(
      { text: '', calls: [call('c1', 'check_voice', { draft: LAST })] },
      { text: words.agentCant, calls: [call('c2', 'share_note', { title: 'Sam', body: LAST })] },
    );
    await open({ plan });
    await ask('Email this to Sam and put it in my calendar.');
    expect(await screen.findByText(words.agentShareTitle)).toBeTruthy();
    expect(screen.getByText(words.agentCant)).toBeTruthy();
    expect(screen.getByText(LAST)).toBeTruthy();
    plain();
  });

  test.each([
    ['no internet', Object.assign(new Error('Network request failed'), { kind: 'network' }), words.offlineNoPhone],
    ['the remote switch off', new SendVeto(CHATGPT_OFF), words.gptOffNoPhone],
    ['ChatGPT failing', new Error('HTTP 500 upstream'), words.gptFailedNoPhone],
  ])('%s with ChatGPT chosen: its plain line and Try again, never the phone instead', async (_name, error, line) => {
    setSource('chatgpt');
    const chatgpt = scripted(error, ...[1, 2, 3].map(() => ({ text: FIRST, calls: [] }))), local = loop();
    await open({ plan,local });
    await ask('Reply to Sam');
    expect(await screen.findByText(line)).toBeTruthy();
    expect(local.step).not.toHaveBeenCalled();
    expect(shown().join(' ')).not.toMatch(/HTTP|upstream|Network request/);
    plain();
    await fireEvent.press(screen.getByRole('button', { name: words.tryAgain }));
    expect(await screen.findByText(FIRST)).toBeTruthy();
    expect(plan.step).toHaveBeenCalledTimes(2);
  });
});

test('Not now: nothing is shared, nothing more is asked, and the draft stays', async () => {
  setSource('chatgpt');
  const chatgpt = loop();
  await open({ plan });
  await ask('Reply to Sam');
  expect(await screen.findByText(words.agentShareTitle)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: words.agentNotNow }));
  await waitFor(() => expect(screen.queryByText(words.agentShareTitle)).toBeNull());
  expect(share).not.toHaveBeenCalled();
  expect(plan.step).toHaveBeenCalledTimes(3);
  expect(screen.getByText(LAST)).toBeTruthy();
  expect(screen.getByRole('button', { name: words.agentGo })).toBeEnabled();
});

test('the step cap: one plain line and the latest draft, never a spinner', async () => {
  setSource('chatgpt');
  const again = (n: number) => ({ text: '', calls: [call(`c${n}`, 'check_voice', { draft: `Draft ${'x'.repeat(n)}` })] });
  const chatgpt = scripted(...[1, 2, 3, 4, 5, 6, 7].map(again));
  await open({ plan });
  await ask('Reply to Sam');
  expect(await screen.findByText(words.agentStopped)).toBeTruthy();
  expect(plan.step).toHaveBeenCalledTimes(6);
  expect(screen.getByText(`Draft ${'x'.repeat(6)}`)).toBeTruthy();
  plain();
});

test('while it works: the draft streams in and the line says it is checking, never what runs', async () => {
  setSource('chatgpt');
  let release!: (turn: Turn) => void;
  const steps: Turn[] = [{ text: FIRST, calls: [call('c1', 'check_voice', { draft: FIRST })] }];
  const plan: Brain = { step: jest.fn(async (_i, _items, _t, onText) => {
    const next = steps.shift();
    if (next) { onText?.(next.text); return next; }
    onText?.('Hi Sam, ');
    return new Promise<Turn>(done => { release = done; });
  }) };
  await open({ plan });
  await ask('Reply to Sam');
  await waitFor(() => expect(screen.getByText(words.agentChecking)).toBeTruthy());
  expect(screen.getByText('Hi Sam, ')).toBeTruthy();
  expect(screen.getByRole('button', { name: words.agentGo })).toBeDisabled();
  plain();
  await act(async () => { release({ text: LAST, calls: [] }); });
  expect(await screen.findByText(LAST)).toBeTruthy();
});

test('the lab stand-in speaks plainly all the way through', async () => {
  setSource('chatgpt');
  await open({ plan: labBrain(0) });
  await ask('Write my landlord a note that the heater’s broken since Monday, then make it firmer.');
  expect(await screen.findByText(words.agentShareTitle)).toBeTruthy();
  plain();
  await fireEvent.press(screen.getByRole('button', { name: words.agentShare }));
  await waitFor(() => expect(screen.getByText('Shared your note.')).toBeTruthy());
  plain();
});

test('unflagged, ownvoice://agent redirects Home', async () => {
  await render(<Agent />);
  expect(screen.toJSON()).toMatchObject({ type: 'Redirect', props: { href: '/' } });
});
