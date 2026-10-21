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

describe('askComputer read-log send mark', () => {
  it('marks sent before the reply when the computer is online', async () => {
    mockLink.status = 'online';
    const order: string[] = [];
    mockLink.request.mockImplementationOnce(() => { order.push('request'); return Promise.resolve({ text: 'hi' }); });
    const sent = jest.fn(async () => { order.push('sent'); });
    expect(await askComputer('i', 'p', undefined, sent)).toBe('hi');
    expect(order).toEqual(['request', 'sent']);
  });

  it('keeps the log unmarked when the computer is unreachable and the request fails', async () => {
    mockLink.status = 'offline';
    mockLink.request.mockImplementationOnce(() => Promise.reject(new Error('timeout')));
    const sent = jest.fn(async () => {});
    await expect(askComputer('i', 'p', undefined, sent)).rejects.toThrow('timeout');
    expect(sent).not.toHaveBeenCalled();
  });

  it('marks sent when an unreachable computer answers', async () => {
    mockLink.status = 'offline';
    mockLink.request.mockImplementationOnce(() => Promise.resolve({ text: 'hi' }));
    const sent = jest.fn(async () => {});
    expect(await askComputer('i', 'p', undefined, sent)).toBe('hi');
    expect(sent).toHaveBeenCalledTimes(1);
  });
});
