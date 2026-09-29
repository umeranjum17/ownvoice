// P4: Why? follows whether the phone can write: rules-only plus noChecks where the
// phone cannot write, unchanged checks where it can.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { stubWriter } from '../stubWriter';
import { words } from '../../core/words';
import Native from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), ask: jest.fn(), closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
const SAM = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';

const renderPanel = async (id: string) => {
  native.capture.mockResolvedValue({ conversation: SAM, written: SAM, nodes: [], fieldTop: null, typed: '', app: 'dev.ownvoice.app', label: 'Ownvoice', at: 0, id, hasField: true });
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter({ drafts: ['Yes, still on for Saturday.'] })} />
    </SafeAreaProvider>);
};

test('Why? on a phone that cannot write shows the rules row and noChecks without asking the phone', async () => {
  native.modelStatus.mockResolvedValue('unavailable');
  const screen = await renderPanel('tap-2');
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Why?' })).toHaveLength(1));
  fireEvent.press(screen.getAllByRole('button', { name: 'Why?' })[0]);
  await waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain(words.noChecks));
  expect(JSON.stringify(screen.toJSON())).toContain(words.howItReads);
  expect(native.ask).not.toHaveBeenCalled();
});

test('Why? on a phone that can write still asks the phone', async () => {
  native.modelStatus.mockResolvedValue('available');
  native.ask.mockImplementation(async (_id: string, prompt: string) => {
    if (prompt.startsWith('Below is the text')) return 'MESSAGE';
    return 'GENERIC: 2\nSPECIFICITY: 8\nSPECIFIC: pass - says something concrete\nCLEAR: pass - one clear point\nVOICE: pass - sounds like you\nFITS: pass - fits this chat\nCLAIMS: pass - makes nothing up\nANSWERS: pass - answers the question\nNEXT_STEP: pass - the time is clear';
  });
  const screen = await renderPanel('tap-3');
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Why?' })).toHaveLength(1));
  fireEvent.press(screen.getAllByRole('button', { name: 'Why?' })[0]);
  await waitFor(() => expect(native.ask).toHaveBeenCalled());
  await waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain('Says something real'));
  expect(JSON.stringify(screen.toJSON())).not.toContain(words.noChecks);
});
