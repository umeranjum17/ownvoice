import { words } from './words';

export type DraftRequest = { conversation: string; written: string; typed: string; guide?: string; dashes?: 'keep' | 'remove'; avoid?: string[] };
export type WriterState = 'downloading' | 'writing';
export type WriterEvents = { state?: (state: WriterState) => void; landed?: (text: string, slot: number, label?: string) => void; fraction?: (value: number) => void };
export type Choice = { drafts: string[]; reason?: string };
export interface Writer { write(request: DraftRequest, on?: WriterEvents): Promise<Choice> }

export async function withPhoneFallback(primary: Writer, phone: Writer, request: DraftRequest, on?: WriterEvents): Promise<Choice> {
  try {
    const { drafts } = await primary.write(request, on);
    if (drafts.length !== 3 || drafts.some(draft => !draft.trim())) throw new Error('empty');
    return { drafts };
  } catch {
    return { ...(await phone.write(request, on)), reason: words.fallback };
  }
}
