const mockLink = { status: 'online', request: jest.fn() };
const mockLoad = { next: async (): Promise<unknown> => ({ hostName: 'Desk' }) };
const mockMade: Array<{ stop: jest.Mock }> = [];

jest.mock('expo-secure-store', () => ({}));
jest.mock('../random', () => ({}));
jest.mock('@byokit/pair', () => ({
  secureDeviceStore: () => ({ load: () => mockLoad.next(), save: async () => {}, clear: async () => {} }),
  pairWithOffer: async () => ({ hostName: 'Desk' }),
  DeviceLink: class {
    stop = jest.fn();
    constructor() { mockMade.push(this); }
    get status() { return mockLink.status; }
    request(...args: unknown[]) { return mockLink.request(...args); }
  },
}));

import { askComputer, forgetComputer } from '../link';
import { words } from '../../core/words';

const passGate = async () => {};

describe('askComputer read-log send mark', () => {
  it('marks sent after dispatch and before the reply when the computer is online', async () => {
    mockLink.status = 'online';
    const order: string[] = [];
    mockLink.request.mockImplementationOnce(() => { order.push('request'); return Promise.resolve({ text: 'hi' }); });
    const sent = jest.fn(async () => { order.push('sent'); });
    expect(await askComputer('i', 'p', undefined, passGate, sent)).toBe('hi');
    expect(order).toEqual(['request', 'sent']);
  });

  it('waits for a link that is still connecting, then sends', async () => {
    mockLink.status = 'connecting';
    setTimeout(() => { mockLink.status = 'online'; }, 250);
    mockLink.request.mockImplementationOnce(() => Promise.resolve({ text: 'hi' }));
    expect(await askComputer('i', 'p', undefined, passGate, async () => {})).toBe('hi');
  });

  it('marks sent when an online computer times out after the frame went out', async () => {
    mockLink.status = 'online';
    mockLink.request.mockImplementationOnce(() => Promise.reject(new Error('timeout')));
    const sent = jest.fn(async () => {});
    await expect(askComputer('i', 'p', undefined, passGate, sent)).rejects.toThrow('timeout');
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('refuses an offline computer before queueing the request and leaves the log unmarked', async () => {
    mockLink.status = 'offline';
    mockLink.request.mockClear();
    const sent = jest.fn(async () => {});
    await expect(askComputer('i', 'p', undefined, passGate, sent)).rejects.toThrow(words.computerProblem);
    expect(mockLink.request).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });

  it('re-checks consent at dispatch when the link is still loading', async () => {
    await forgetComputer();
    mockLink.status = 'online';
    mockLink.request.mockClear();
    let consent = true;
    const gate = jest.fn(async () => { if (!consent) throw new Error('withdrawn'); });
    let finishLoad: (grant: unknown) => void = () => {};
    mockLoad.next = () => new Promise(resolve => { finishLoad = resolve; });
    const sent = jest.fn(async () => {});
    const asked = askComputer('i', 'p', undefined, gate, sent);
    await Promise.resolve();
    consent = false;
    finishLoad({ hostName: 'Desk' });
    await expect(asked).rejects.toThrow('withdrawn');
    expect(mockLink.request).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
    mockLoad.next = async () => ({ hostName: 'Desk' });
  });

  it('reads the stored grant again after an ask found none', async () => {
    await forgetComputer();
    mockLink.status = 'online';
    mockLoad.next = async () => null;
    await expect(askComputer('i', 'p', undefined, passGate, async () => {})).rejects.toThrow(words.computerNone);
    mockLoad.next = async () => ({ hostName: 'Desk' });
    mockLink.request.mockImplementationOnce(() => Promise.resolve({ text: 'ok' }));
    expect(await askComputer('i', 'p', undefined, passGate, async () => {})).toBe('ok');
  });

  it('sends nothing when the ask is aborted while the link is still connecting', async () => {
    await forgetComputer();
    mockLink.status = 'connecting';
    mockLink.request.mockClear();
    const sent = jest.fn(async () => {});
    const controller = new AbortController();
    const asked = askComputer('i', 'p', controller.signal, passGate, sent);
    setTimeout(() => { controller.abort(); mockLink.status = 'online'; }, 150);
    await expect(asked).rejects.toThrow('aborted');
    expect(mockLink.request).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });

  it('refuses a computer that drops offline during the consent gate', async () => {
    await forgetComputer();
    mockLink.status = 'online';
    mockLink.request.mockClear();
    const sent = jest.fn(async () => {});
    const dropping = async () => { mockLink.status = 'offline'; };
    await expect(askComputer('i', 'p', undefined, dropping, sent)).rejects.toThrow(words.computerProblem);
    expect(mockLink.request).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
    mockLink.status = 'online';
  });

  it('opens one connection for concurrent asks on a cold link', async () => {
    await forgetComputer();
    mockLink.status = 'online';
    mockMade.length = 0;
    mockLink.request.mockImplementationOnce(() => Promise.resolve({ text: 'a' }));
    mockLink.request.mockImplementationOnce(() => Promise.resolve({ text: 'b' }));
    await Promise.all([
      askComputer('i', 'p', undefined, passGate, async () => {}),
      askComputer('i', 'p', undefined, passGate, async () => {}),
    ]);
    expect(mockMade).toHaveLength(1);
  });

  it('stops a link whose load was still running when the computer was forgotten', async () => {
    await forgetComputer();
    mockMade.length = 0;
    mockLink.status = 'online';
    let finishLoad: (grant: unknown) => void = () => {};
    mockLoad.next = () => new Promise(resolve => { finishLoad = resolve; });
    const asked = askComputer('i', 'p', undefined, passGate, async () => {}).catch((error: Error) => error);
    await Promise.resolve();
    const forgotten = forgetComputer();
    finishLoad({ hostName: 'Desk' });
    await forgotten;
    await asked;
    expect(mockMade).toHaveLength(1);
    expect(mockMade[0].stop).toHaveBeenCalledTimes(1);
    mockLoad.next = async () => ({ hostName: 'Desk' });
  });
});
