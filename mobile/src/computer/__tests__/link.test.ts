const mockLink = { status: 'online', request: jest.fn() };

jest.mock('expo-secure-store', () => ({}));
jest.mock('../random', () => ({}));
jest.mock('@byokit/pair', () => ({
  secureDeviceStore: () => ({ load: async () => ({ hostName: 'Desk' }), save: async () => {}, clear: async () => {} }),
  pairWithOffer: async () => ({ hostName: 'Desk' }),
  DeviceLink: class {
    get status() { return mockLink.status; }
    request(...args: unknown[]) { return mockLink.request(...args); }
  },
}));

import { askComputer } from '../link';
import { words } from '../../core/words';

describe('askComputer read-log send mark', () => {
  it('marks sent after dispatch and before the reply when the computer is online', async () => {
    mockLink.status = 'online';
    const order: string[] = [];
    mockLink.request.mockImplementationOnce(() => { order.push('request'); return Promise.resolve({ text: 'hi' }); });
    const sent = jest.fn(async () => { order.push('sent'); });
    expect(await askComputer('i', 'p', undefined, sent)).toBe('hi');
    expect(order).toEqual(['request', 'sent']);
  });

  it('marks sent when an online computer times out after the frame went out', async () => {
    mockLink.status = 'online';
    mockLink.request.mockImplementationOnce(() => Promise.reject(new Error('timeout')));
    const sent = jest.fn(async () => {});
    await expect(askComputer('i', 'p', undefined, sent)).rejects.toThrow('timeout');
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('refuses an offline computer before queueing the request and leaves the log unmarked', async () => {
    mockLink.status = 'offline';
    mockLink.request.mockClear();
    const sent = jest.fn(async () => {});
    await expect(askComputer('i', 'p', undefined, sent)).rejects.toThrow(words.computerProblem);
    expect(mockLink.request).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });
});
