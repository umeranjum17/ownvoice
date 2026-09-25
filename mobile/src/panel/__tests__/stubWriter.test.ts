import { stubDrafts } from '../stubWriter';

test('returns two predictable drafts for the native panel smoke test', () => {
  expect(stubDrafts('')).toHaveLength(2);
  expect(stubDrafts(' hello ')[0]).toContain('hello');
});
