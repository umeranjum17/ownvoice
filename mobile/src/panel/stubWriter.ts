export function stubDrafts(typed: string): string[] {
  return typed.trim()
    ? [`${typed.trim()}\nThanks for sharing.`, 'I hear you. Let me think about it.']
    : ['That sounds good to me.\nThanks for sharing!', 'I see what you mean.\nLet me think about it.'];
}
