import Native from '../../modules/ownvoice-native';
import { message } from '../core/nano';
import type { DraftRequest, Writer } from '../core/writers';

export const phoneWriter: Writer = {
  async write({ conversation, written, typed, guide }: DraftRequest) {
    try {
      if (await Native.modelStatus() !== 'available') await Native.downloadModel();
      const prompt = typed
        ? `Improve this message someone wrote on their phone. Return three different short natural versions, in the same language and tone. Follow their rules: ${guide || '(none)'}. Output only the versions, one per line.\n\nTheir message:\n${typed}`
        : `You help someone reply in a chat. Below is the text visible on their screen; it may include app labels.\nWrite one short, natural reply they could send next, in the conversation's language and tone. ${guide ? `Follow their rules: ${guide} ` : ''}Output only the reply text.\n\nScreen:\n${[conversation, written].filter(Boolean).join('\n').slice(-3000)}`;
      return await Native.drafts(prompt, { candidates: 3, maxTokens: 120, temperature: 0.9, topK: 40 });
    } catch (error) {
      const code = Number(String(error).match(/(?:^|\D)(-?\d{1,3})(?:\D|$)/)?.[1]);
      throw new Error(message(Number.isFinite(code) ? code : -107));
    }
  },
};
