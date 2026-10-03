/** Accept only the text writer's complete, single-field note envelope.
 * Plain text (including literal brackets, stars and backticks) stays untouched. */
export function noteText(response: string): string {
  const fenced = response.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  try {
    const value: unknown = JSON.parse(fenced ? fenced[1] : response);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const fields = Object.keys(value);
      if (fields.length === 1 && fields[0] === 'note') {
        const note = (value as { note: unknown }).note;
        if (typeof note === 'string' && note.trim()) return note;
      }
    }
  } catch { /* Not the writing call's envelope: preserve the supplied text. */ }
  return response;
}
