import {
  REPLY_SLOTS, acceptReplies, cleanDrafts, dashDecision, dashesFor, dedupe, latestMessage,
  layoutKept, nearDuplicate, norm, phoneReplyPrompt, phoneSlotPrompt, replyPrompt, replySlotPrompt, undash, versionAcceptor,
} from '../drafts';
import { versionsList } from '../judge';

// ---- 5.5 cleanDrafts (unchanged; now living here) ----

test('cleans preambles, numbering and quotes into one draft per card', () => {
  expect(cleanDrafts(['Okay, here are three short, natural versions:\n1. "Are we still on?"\n2. ‘I can bring the tent.’\n3) See you Saturday!'])).toEqual([
    'Are we still on?', 'I can bring the tent.', 'See you Saturday!',
  ]);
});

test('keeps a numbered or bulleted message intact unless explicitly labelled as alternatives', () => {
  expect(cleanDrafts(["1. I'll bring the tent. 2. You bring the stove.", '- Bring the tent\n- Bring the stove'])).toEqual([
    "1. I'll bring the tent. 2. You bring the stove.", '- Bring the tent\n- Bring the stove',
  ]);
  expect(cleanDrafts(['Version 1: See you there. Version 2: Sounds good.'])).toEqual(['See you there.', 'Sounds good.']);
  expect(cleanDrafts(['Here are two options:\n- See you there.\n- Sounds good.'])).toEqual(['See you there.', 'Sounds good.']);
  expect(cleanDrafts(['Version 1: Sounds good.', 'Option 2: See you there.', 'Draft 3: I can bring it.'])).toEqual(['Sounds good.', 'See you there.', 'I can bring it.']);
  expect(cleanDrafts(['Here are two versions:\n1. Sounds good.'])).toEqual(['Sounds good.']);
  expect(cleanDrafts(['1. Bring the tent\n- Bring the stove', 'See you there.'])).toEqual(['1. Bring the tent\n- Bring the stove', 'See you there.']);
  expect(cleanDrafts(['1. Sounds good.', 'See you there.'])).toEqual(['1. Sounds good.', 'See you there.']);
  expect(cleanDrafts(['1. Sounds good.'], 1)).toEqual(['1. Sounds good.']);
  expect(cleanDrafts(["1. I'll bring the tent. 2. You bring the stove."], 1)).toEqual(["1. I'll bring the tent. 2. You bring the stove."]);
  expect(cleanDrafts(["Here's a reply: ‘Sounds good!’", "Here's the reply:\nSee you there."])).toEqual(['Sounds good!', 'See you there.']);
  expect(cleanDrafts(["Here is the plan:\nI'll bring the tent."])).toEqual(["Here is the plan:\nI'll bring the tent."]);
  expect(cleanDrafts(['Here are the snacks:\nApples and pears.'])).toEqual(['Here are the snacks:\nApples and pears.']);
  expect(cleanDrafts(["Sure, here's a reply: Sounds good."])).toEqual(['Sounds good.']);
  expect(cleanDrafts(['Version 1: “Here are three versions:”'])).toEqual([]);
});

// ---- 5.3 Near-duplicates ----

test('norm folds agreement words, emoji and punctuation', () => {
  expect(norm('Yep, still on for Saturday. 👍')).toBe(norm('Yeah, still on for Saturday'));
  expect(norm('OK')).toBe('yes');
  expect(norm('nope')).toBe('no');
  expect(norm('Sure!')).toBe('yes');
  expect(norm('Ya, 9 works')).toBe('yes 9 works');
});

test('the three real-phone reply drafts collapse to one', () => {
  const qa = ['Yep, still on for Saturday. 👍', 'Yeah, still on for Saturday.', 'Yeah, still on for Saturday. 👍'];
  expect(dedupe(qa)).toHaveLength(1);
  expect(nearDuplicate(qa[0], qa[1])).toBe(true);
});

test('the two real-phone polish cards collapse to one', () => {
  expect(dedupe(["I'll bring the stove. You bring the tent.", "I'll bring the stove. You get the tent."])).toHaveLength(1);
});

test('yes and no stay two choices', () => {
  expect(dedupe(['Yes, Saturday works.', "No, Saturday doesn't work for me."])).toHaveLength(2);
  expect(nearDuplicate('Yes, Saturday works.', "No, Saturday doesn't work for me.")).toBe(false);
});

test('acceptReplies cleans, dedupes and respects the avoid list', () => {
  const raw = ['Yep, still on for Saturday. 👍', 'Yeah, still on for Saturday.', 'Not sure yet — what time works?'];
  expect(acceptReplies(raw, [], 3)).toEqual(['Yep, still on for Saturday. 👍', 'Not sure yet, what time works?']);
  expect(acceptReplies(raw, ['Yep, still on for Saturday. 👍'], 3)).toHaveLength(1);
});

// ---- 5.2 Keep the writer's formatting ----

test('layoutKept: a list stays a list with the same markers', () => {
  const qa = 'I can bring the stove.\n1. I will bring the stove.\n2. You can bring the tent.';
  expect(layoutKept(qa, 'I can bring the stove.\n1. I will bring the stove.\n2. You can bring the tent.')).toBe(true);
  expect(layoutKept(qa, 'I can bring the stove, and you the tent.')).toBe(false);
  expect(layoutKept(qa, 'I can bring the stove.\n- I will bring the stove.\n- You can bring the tent.')).toBe(false);
  expect(layoutKept('Bring:\n- the tent\n- the stove', 'Bring:\n- the tent\n- the stove, packed')).toBe(true);
  expect(layoutKept('Bring:\n- the tent\n- the stove', 'Bring the tent and the stove.')).toBe(false);
  expect(layoutKept('One line only.', 'One single line.')).toBe(true);
});

test('layoutKept allows one line fewer', () => {
  const three = 'Hi.\nMiddle line here.\nBye.';
  expect(layoutKept(three, 'Hi.\nBye.')).toBe(true);
  expect(layoutKept(three, 'Hi.')).toBe(false);
});

// ---- 5.4 The dash rule ----

test('undash replaces every dash shape with a comma', () => {
  expect(undash('Yes — see you')).toBe('Yes, see you');
  expect(undash('Yes—see you')).toBe('Yes, see you');
  expect(undash('Yes – see you')).toBe('Yes, see you');
  expect(undash('9–5 stays')).toBe('9–5 stays');
});

test('the dash table: their text and their switch win', () => {
  expect(dashDecision(true, 'any — text')).toBe('remove');
  expect(dashDecision(false, 'their — own dash')).toBe('keep');
  expect(dashDecision(false, 'no dash here')).toBe('remove');
  expect(dashesFor({ never: [], noDashes: true, statementEndings: false, note: '' }, '—')).toBe('remove');
  expect(dashesFor({ never: [], noDashes: false, statementEndings: false, note: '' }, '—')).toBe('keep');
});

// ---- 5.1 Reply prompts ----

const input = { latest: 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.', conversation: 'Earlier.\n' + 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.', dashes: 'remove' as const };

test('the reply prompt answers every point, offers no blanks, and carries the slots', () => {
  const prompt = replyPrompt(input);
  expect(prompt).toContain('Every draft must respond to everything the latest message asks or offers');
  expect(prompt).toContain('If an honest answer would need a fact only they know, ask a short question back or reply without it.');
  expect(prompt).not.toMatch(/blank/i);
  for (const slot of REPLY_SLOTS) expect(prompt).toContain(slot);
  expect(prompt).toContain('news, thanks or a feeling');
  expect(prompt).toContain("Don't add long dashes (—).");
  expect(prompt).toContain('their dashes: remove');
  expect(replyPrompt({ ...input, dashes: 'keep' })).toContain('their dashes: keep');
  expect(prompt).toContain(`Latest message:\n${input.latest}`);
  expect(prompt).toContain('Conversation:\nEarlier.\n');
  expect(prompt).toContain('Output only JSON: {"drafts"');
});

test('latestMessage keeps the last 3 non-empty lines, capped at 300 characters', () => {
  expect(latestMessage('a\n\nb\n\nc\n\nd')).toBe('b\nc\nd');
  expect(latestMessage('x'.repeat(400))).toHaveLength(300);
  expect(latestMessage('')).toBe('');
});

test('slot retries carry one slot and the avoid list', () => {
  const slot = replySlotPrompt(REPLY_SLOTS[2], { ...input, avoid: ['Yes, on!'] });
  expect(slot).toContain(`1. ${REPLY_SLOTS[2]}`);
  expect(slot).toContain("Don't repeat these: Yes, on!.");
  expect(slot).toContain('Write one draft');
  expect(slot).not.toContain('Give a different answer');
  expect(phoneSlotPrompt(REPLY_SLOTS[1], input, ['a', 'b'])).toContain("Don't repeat these: a; b.");
});

test('the phone reply prompt stays under 700 characters of instructions and asks for labelled replies', () => {
  const prompt = phoneReplyPrompt(input);
  const instructions = prompt.split('\n\nLatest message:')[0];
  expect(instructions.length).toBeLessThanOrEqual(700);
  expect(prompt).toContain('Draft 1:');
  expect(prompt).toContain('Every draft must respond to everything');
});

// ---- 5.2 Version acceptance ----

const list = 'I can bring the stove.\n1. I will bring the stove.\n2. You can bring the tent.';

test('versionAcceptor drops a version equal to the writer text and near-duplicates', () => {
  const acceptor = versionAcceptor('see you at 7', 'remove', []);
  expect(acceptor.accept('See you at 7!', 0, versionsList[0].label)).toBeNull();
  expect(acceptor.accept('see you at 7', 1, versionsList[1].label)).toBeNull();
  const first = acceptor.accept('I can be there at 7.', 0, versionsList[0].label);
  expect(first).toBe('I can be there at 7.');
  expect(acceptor.accept('I can be there at 7 o clock', 1, versionsList[1].label)).toBeNull();
  expect(acceptor.results).toEqual([{ text: 'I can be there at 7.', slot: 0, label: versionsList[0].label }]);
});

test('versionAcceptor queues a flattened list for one fix, then drops it', () => {
  const acceptor = versionAcceptor(list, 'remove', []);
  expect(acceptor.accept('I can bring the stove, and you the tent.', 1, versionsList[1].label)).toBeNull();
  expect(acceptor.layoutFails).toEqual([{ slot: 1, label: versionsList[1].label }]);
  expect(acceptor.fix('Still one flat line.', 1, versionsList[1].label)).toBeNull();
  expect(acceptor.results).toEqual([]);
  const fixed = versionAcceptor(list, 'remove', []);
  fixed.accept('I can bring the stove, and you the tent.', 1, versionsList[1].label);
  expect(fixed.fix('I can bring the stove.\n1. I will bring it.\n2. You the tent.', 1, versionsList[1].label)).toBe('I can bring the stove.\n1. I will bring it.\n2. You the tent.');
});

test('versionAcceptor undashes when the table says so, and honours avoid', () => {
  const undashed = versionAcceptor('see you — promised', 'remove', []);
  expect(undashed.accept('see you there — promised', 0)).toBe('see you there, promised');
  const kept = versionAcceptor('see you — promised', 'keep', []);
  expect(kept.accept('see you there — same', 0)).toBe('see you there — same');
  const avoided = versionAcceptor('hi', 'remove', ['NEW PLAN: meet at 8']);
  expect(avoided.accept('New plan: meet at 8!', 0)).toBeNull();
});

test('acceptReplies strips a leaked dash from replies', () => {
  expect(acceptReplies(['Yes — see you'], [], 3, 'remove')).toEqual(['Yes, see you']);
  expect(acceptReplies(['Yes — see you'], [], 3, 'keep')).toEqual(['Yes — see you']);
});
