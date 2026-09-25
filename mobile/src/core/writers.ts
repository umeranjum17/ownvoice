export type DraftRequest = { conversation: string; written: string; typed: string; guide?: string };
export interface Writer { write(request: DraftRequest): Promise<string[]> }
export type PhoneWriter = Writer;
export type Choice = { drafts: string[]; reason?: string };

export async function withPhoneFallback(primary: Writer, phone: PhoneWriter, request: DraftRequest): Promise<Choice> {
  try {
    const drafts = await primary.write(request);
    if (drafts.length !== 3 || drafts.some(draft => !draft.trim())) throw new Error('empty');
    return { drafts };
  } catch {
    const drafts = await phone.write(request);
    return { drafts, reason: "ChatGPT didn't answer. This phone wrote these instead." };
  }
}
