// Package 1 regression: Why? must rescore with the capture's platform, so a
// 2900-character LinkedIn draft keeps "Right length for a post" instead of
// flipping to the flat 280-character "Long for a post".
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { stubWriter } from '../stubWriter';
import Native from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
  modelStatus: jest.fn(async () => 'available'), ask: jest.fn(), closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;

// 2900 characters: over X's 280 cap but inside LinkedIn's 3000.
const LONG = `${'x'.repeat(2899)}.`;

const PASS_ANSWER = [
  'GENERIC: 2', 'SPECIFICITY: 8',
  'SPECIFIC: pass - says something concrete',
  'CLEAR: pass - one clear point',
  'VOICE: pass - sounds like you',
  'FITS: pass - fits this post',
  'CLAIMS: pass - makes nothing up',
  'CONVERSATION: pass - invites replies',
  'NOT_INTERESTED: pass - will not put people off',
  'HOOK: pass - strong first line',
].join('\n');

test('Why? on a 2900-character LinkedIn draft keeps Right length for a post', async () => {
  native.capture.mockResolvedValue({ conversation: 'Sam: new role!', written: '', nodes: [], fieldTop: null, typed: LONG, app: 'com.linkedin.android', label: 'LinkedIn', at: 0, id: 'why-linkedin', hasField: true });
  native.ask.mockImplementation(async (_id: string, prompt: string) => {
    if (prompt.includes('You check a reply draft')) return PASS_ANSWER;
    if (prompt.includes('Compare a rewrite')) return 'MEANING: pass';
    return 'POST';
  });
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter()} />
    </SafeAreaProvider>);
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Why?' }).length).toBeGreaterThan(0));
  fireEvent.press(screen.getAllByRole('button', { name: 'Why?' })[0]);
  await waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain('Right length for a post'));
  expect(JSON.stringify(screen.toJSON())).not.toContain('Long for a post');
});
