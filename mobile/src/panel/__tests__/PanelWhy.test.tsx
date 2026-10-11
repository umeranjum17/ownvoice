// P4: Why? follows whether the phone can write: rules-only plus noChecks where the
// phone cannot write, unchanged checks where it can.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { words } from '../../core/words';
import Native from '../../../modules/ownvoice-native';
import type { DraftRequest, WriterEvents } from '../../core/writers';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
  closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(), agreedToDownload: jest.fn(() => false) }));
import { askLocal, localModelState } from '../../core/localModel';
const mockAsk = askLocal as jest.MockedFunction<typeof askLocal>;
const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
const SAM = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';

const renderPanel = async (id: string) => {
  native.capture.mockResolvedValue({ conversation: SAM, written: SAM, nodes: [], fieldTop: null, typed: 'Yes, still on for Saturday.', app: 'dev.ownvoice.app', label: 'Ownvoice', at: 0, id, hasField: true });
  const write = async (_request: DraftRequest, on: WriterEvents = {}) => {
    on.landed?.('Yes, still on for Saturday, I can bring the stove.', 0);
    return { drafts: ['Yes, still on for Saturday, I can bring the stove.'] };
  };
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={{ write }} />
    </SafeAreaProvider>);
};
// One Yours card plus one version: index 1 is the version's Why?.

test('Why? on a phone that cannot write shows the rules row and noChecks without asking the phone', async () => {
  mockState.mockResolvedValue({ phase: 'unsupported' });
  const screen = await renderPanel('tap-2');
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Why?' })).toHaveLength(2));
  fireEvent.press(screen.getAllByRole('button', { name: 'Why?' })[1]);
  await waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain(words.noChecks));
  expect(JSON.stringify(screen.toJSON())).toContain(words.howItReads);
  expect(mockAsk).not.toHaveBeenCalled();
});

test('Why? on a phone that can write still asks the phone', async () => {
  mockState.mockResolvedValue({ phase: 'ready' });
  mockAsk.mockImplementation(async (prompt: string) => {
    if (prompt.startsWith('Below is the text')) return 'MESSAGE';
    return 'GENERIC: 2\nSPECIFICITY: 8\nSPECIFIC: pass - says something concrete\nCLEAR: pass - one clear point\nVOICE: pass - sounds like you\nFITS: pass - fits this chat\nCLAIMS: pass - makes nothing up\nANSWERS: pass - answers the question\nNEXT_STEP: pass - the time is clear';
  });
  const screen = await renderPanel('tap-3');
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Why?' })).toHaveLength(2));
  fireEvent.press(screen.getAllByRole('button', { name: 'Why?' })[1]);
  await waitFor(() => expect(mockAsk).toHaveBeenCalled());
  await waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain('Says something real'));
  expect(JSON.stringify(screen.toJSON())).not.toContain(words.noChecks);
});
