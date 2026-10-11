import { prefillFor, prefillUrl } from '../prefill';
import { platformForApp } from '../platforms';
import { technicalWords } from '../words';

const x = platformForApp('com.twitter.android');
const whatsapp = platformForApp('com.whatsapp');
const reddit = platformForApp('com.reddit.frontpage');

test('each place gets its own hand-off, unknown apps the share sheet', () => {
  expect(prefillFor(x)).toEqual({ dest: 'x', label: 'Open in X with this text' });
  expect(prefillFor(whatsapp)).toEqual({ dest: 'whatsapp', label: 'Open in WhatsApp with this text' });
  expect(prefillFor(platformForApp('com.whatsapp.w4b')).dest).toBe('whatsapp');
  expect(prefillFor(reddit)).toEqual({ dest: 'share', label: 'Share this text' });
  for (const app of ['com.linkedin.android', 'com.Slack', 'com.google.android.gm', 'com.example.other', undefined, null]) {
    expect(prefillFor(platformForApp(app ?? undefined))).toEqual({ dest: 'share', label: 'Share this text' });
  }
  expect(prefillFor().dest).toBe('share');
});

test('compose links carry the whole text, encoded, and never send', () => {
  const text = 'Shipped it today & tomorrow? Yes! 😀\nSecond line.';
  const xUrl = prefillUrl('x', text);
  expect(xUrl).toBe(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`);
  expect(xUrl).not.toMatch(/post|send|publish/);
  expect(prefillUrl('whatsapp', text)).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
  expect(prefillUrl('share', text)).toBeNull();
  for (const dest of ['x', 'whatsapp'] as const) {
    const url = new URL(prefillUrl(dest, text)!);
    expect(url.searchParams.get('text')).toBe(text);
  }
});

test('labels stay plain words', () => {
  const labels = [prefillFor(x).label, prefillFor(whatsapp).label, prefillFor(reddit).label, prefillFor().label];
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.filter(label => technicalWords.test(label))).toEqual([]);
});
