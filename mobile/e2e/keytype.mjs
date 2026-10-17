// Hardware key-event typing for the typing-check journeys (ov-typing-fix-go-live).
//
// Why: `adb shell input text` pastes through the soft keyboard's composing
// session, so Gboard's autocorrect can rewrite a slip mid-type ("recieve" ->
// "receive") before the 700 ms typing pause reads the field, and the
// overlay-proof exact-input check then fails on text the driver never typed.
// Per-character `input keyevent` events arrive as hardware keys, which no
// soft-keyboard autocorrect pass rewrites (intact slips under a visible
// Gboard prove it); hiding the soft keyboard first is best-effort. The
// overlay-proof `exact field input` read-back still proves the field holds
// exactly what was typed.
const LETTER_BASE = 29; // KEYCODE_A
const SPACE = 62;
const COMMA = 55;
const PERIOD = 56;
const APOSTROPHE = 75;
const SHIFT_LEFT = 59;

/** One hardware key event (or shift chord for capitals) per character. Throws on anything outside the journey sentences. */
export async function typeKeys(adb, wait, text) {
  for (const ch of text) {
    if (ch >= 'a' && ch <= 'z') adb('shell', 'input', 'keyevent', String(LETTER_BASE + ch.charCodeAt(0) - 97));
    else if (ch >= 'A' && ch <= 'Z') adb('shell', 'input', 'keycombination', String(SHIFT_LEFT), String(LETTER_BASE + ch.charCodeAt(0) - 65));
    else if (ch === ' ') adb('shell', 'input', 'keyevent', String(SPACE));
    else if (ch === ',') adb('shell', 'input', 'keyevent', String(COMMA));
    else if (ch === '.') adb('shell', 'input', 'keyevent', String(PERIOD));
    else if (ch === "'") adb('shell', 'input', 'keyevent', String(APOSTROPHE));
    else throw new Error(`key-event typing has no mapping for ${JSON.stringify(ch)}`);
    await wait(90);
  }
}

/** Hide the soft keyboard so hardware keys bypass the IME's composing session. True when hidden.
 * At most two Back presses: a stale visible flag must never walk Chrome's history. */
export async function hideKeyboard(adb, wait) {
  // This emulator build reports visibility as mIsInputViewShown (mInputShown stays false).
  const shown = () => /mInputShown=true|mIsInputViewShown=true/.test(adb('shell', 'dumpsys', 'input_method'));
  for (let i = 0; i < 2 && shown(); i++) {
    adb('shell', 'input', 'keyevent', '4');
    await wait(600);
  }
  return !shown();
}
