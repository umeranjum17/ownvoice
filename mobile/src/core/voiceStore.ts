import { store } from './store.ts';
import { NO_RULES } from './slop.ts';
import type { Rules } from './slop.ts';

// Voice.rules / Voice.save / Voice.wipe on the phone's key-value store (the panel reads the same entry).
export const loadVoice = (): Rules => ({ ...NO_RULES, ...(store.get<Rules>('voice') ?? {}) });
export const saveVoice = (rules: Rules): void => { store.set('voice', rules); };
export const wipeVoice = (): void => { store.set('voice', null); };
