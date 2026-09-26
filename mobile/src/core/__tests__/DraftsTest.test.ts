import {
  REPLY_SLOTS, acceptReplies, cleanDrafts, dashDecision, dashesFor, latestMessage,
  layoutKept, norm, phoneReplyPrompt, phoneSlotPrompt, replyPrompt, replySlotPrompt, undash, versionAcceptor,
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

// ---- 5.3 Duplicates ----

test('one leading agreement may repeat, but opposite answers and different days survive', () => {
  expect(norm('  YES, Saturday!  ')).toBe(norm('yes saturday'));
  expect(norm('Sounds good, Saturday!')).toBe(norm('Yep Saturday'));
  expect(norm("I can't bring it")).not.toBe(norm('I can bring it'));
  expect(acceptReplies(['Yes, Saturday works.', 'YES Saturday works!'], [], 2)).toEqual(['Yes, Saturday works.']);
  expect(acceptReplies(['Yep, still on for Saturday. 👍', 'Yeah, still on for Saturday.'], [], 2))
    .toEqual(['Yep, still on for Saturday. 👍']);
  expect(acceptReplies(['Yes, Saturday works; I can bring the stove', 'No, Saturday works; I can bring the stove'], [], 2)).toHaveLength(2);
  expect(acceptReplies(['I can bring the stove', "I can't bring the stove"], [], 2)).toHaveLength(2);
  expect(acceptReplies(['Could we meet on Saturday?', 'Could we meet on Sunday?'], [], 2)).toHaveLength(2);
  const versions = versionAcceptor('Meet this weekend', 'remove', []);
  expect(versions.accept('Could we meet on Saturday?', 0)).toBeTruthy();
  expect(versions.accept('Could we meet on Sunday?', 1)).toBeTruthy();
  expect(versions.accept('COULD WE MEET ON SATURDAY!', 2)).toBeNull();
});

test('explicit labels retain empty earlier slots through reply acceptance', () => {
  expect(acceptReplies(['Draft 2: No, Saturday is out.\nDraft 3: Not sure yet, what time?'], [], 3))
    .toEqual([null, 'No, Saturday is out.', 'Not sure yet, what time?']);
  expect(acceptReplies(['Draft 3: Not sure yet, what time?'], [], 3))
    .toEqual([null, null, 'Not sure yet, what time?']);
  expect(acceptReplies(['Draft 1: Yes, I can bring it.', 'No, could we change the day?', 'Not sure; what time?'], [], 3))
    .toEqual(['Yes, I can bring it.', 'No, could we change the day?', 'Not sure; what time?']);
  expect(acceptReplies(['Draft 1: Yes, I can bring it.', 'No, could we change the day?', 'Not sure; what time?'], ['Yes, I can bring it.'], 3))
    .toEqual([null, 'No, could we change the day?', 'Not sure; what time?']);
  expect(acceptReplies(['Draft 2: No, could we change the day?', 'Not sure; what time?'], [], 3))
    .toEqual([null, 'No, could we change the day?', 'Not sure; what time?']);
});

test('acceptReplies cleans, dedupes and respects the avoid list', () => {
  const raw = ['Yep, still on for Saturday. 👍', 'Yeah, still on for Saturday.', 'Not sure yet — what time works?'];
  expect(acceptReplies(raw, [], 3)).toEqual(['Yep, still on for Saturday. 👍', null, 'Not sure yet, what time works?']);
  expect(acceptReplies(raw, ['Yep, still on for Saturday. 👍'], 3)).toEqual([null, null, 'Not sure yet, what time works?']);
  expect(acceptReplies([], [], 3)).toEqual([]);
  expect(acceptReplies(['Yep, still on for Saturday. 👍'], ['Yep, still on for Saturday. 👍'], 3)).toEqual([]);
});

// ---- 5.2 Keep the writer's formatting ----

test('layoutKept: a list stays a list with the same markers', () => {
  const qa = 'I can bring the stove.\n1. I will bring the stove.\n2. You can bring the tent.';
  expect(layoutKept(qa, 'I can bring the stove.\n1. I will bring the stove.\n2. You can bring the tent.')).toBe(true);
  expect(layoutKept(qa, 'I can bring the stove, and you the tent.')).toBe(false);
  expect(layoutKept(qa, 'I can bring the stove.\n- I will bring the stove.\n- You can bring the tent.')).toBe(false);
  expect(layoutKept(qa, 'I can bring the stove.\n1. I will bring the stove.')).toBe(false);
  expect(layoutKept('Bring:\n- the tent\n- the stove', 'Bring:\n- the tent\n- the stove, packed')).toBe(true);
  expect(layoutKept('Bring:\n- the tent\n- the stove', 'Bring:\n- the tent')).toBe(false);
  expect(layoutKept('Bring:\n- the tent\n- the stove', 'Bring the tent and the stove.')).toBe(false);
  expect(layoutKept('1. First\n2. Second', '1) First\n2) Second')).toBe(false);
  expect(layoutKept('Bring:\n- the tent\n- the stove', 'Bring:\n* the tent\n* the stove')).toBe(false);
  expect(layoutKept('Bring:\n- the tent\n- the stove', 'Bring:\n- the tent\n- the stove\n- another')).toBe(false);
  expect(layoutKept('One line only.', 'One single line.')).toBe(true);
});

test('layoutKept allows one ordinary line fewer but preserves paragraph breaks', () => {
  const three = 'Hi.\nMiddle line here.\nBye.';
  expect(layoutKept(three, 'Hi.\nBye.')).toBe(true);
  expect(layoutKept(three, 'Hi.')).toBe(false);
  const paragraphs = 'Hello\n\nI can bring the stove.\n\nThanks';
  expect(layoutKept(paragraphs, 'Hello\nI can bring the stove.\nThanks')).toBe(false);
  expect(layoutKept(paragraphs, 'Hello\n\nI will bring the stove.\n\nThanks')).toBe(true);
  expect(layoutKept('Hello\nThanks', 'Hello\n\nThanks')).toBe(false);
  const versions = versionAcceptor(paragraphs, 'remove', []);
  expect(versions.accept('Hello\nI will bring the stove.\nThanks', 0)).toBeNull();
  expect(versions.layoutFails).toEqual([{ slot: 0, label: undefined }]);
  expect(versions.fix('Hello\n\nI will bring the stove.\n\nThanks', 0)).toBeTruthy();
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

test('nearest non-clickable message above the field wins over practice controls', () => {
  const nodes = [
    { text: 'Sam', top: 100, bottom: 120, clickable: false },
    { text: 'Are we still on for Saturday?\nI can bring the tent if you bring the stove.', top: 125, bottom: 170, clickable: false },
    { text: 'Turn on Ownvoice', top: 210, bottom: 230, clickable: true },
    { text: 'Recent activity', top: 300, bottom: 320, clickable: true },
    { text: 'Clear last screen', top: 330, bottom: 350, clickable: true },
  ];
  expect(latestMessage(nodes, 200)).toBe(nodes[1].text);
  expect(latestMessage(nodes.slice(2), 200)).toBe('');
  expect(latestMessage([{ text: 'x'.repeat(400), top: 0, bottom: 1, clickable: false }], 200)).toHaveLength(400);
  const long = 'Can you bring the stove? ' + 'Earlier context. '.repeat(230) + 'What time works?';
  const latest = latestMessage([{ text: long, top: 0, bottom: 1, clickable: false }], 200);
  const prompt = phoneReplyPrompt({ ...input, latest, conversation: 'Earlier screen. '.repeat(240) });
  expect(prompt).toContain('Latest message:\nCan you bring the stove?');
  expect(prompt).toContain('What time works?');
  expect(latest).toContain('(middle shortened)');
  expect(latest.length).toBeLessThan(1530);
  const middle = 'a'.repeat(1100) + 'Can we meet in the middle? ' + 'b'.repeat(1100);
  const shortened = latestMessage([{ text: middle, top: 0, bottom: 1, clickable: false }], 200);
  expect(shortened).not.toContain('Can we meet in the middle?');
  expect(shortened).toContain('(middle shortened)');
  expect(phoneReplyPrompt({ ...input, latest: 'Hello', conversation: 'x'.repeat(3100) })).toContain(`Conversation:\n${'x'.repeat(3000)}`);
  const short = 'What about Saturday? ' + 'a'.repeat(1450);
  expect(latestMessage([{ text: short, top: 0, bottom: 1, clickable: false }], 200)).toBe(short);
  expect(replyPrompt({ ...input, latest: latestMessage(nodes.slice(2), 200) })).not.toContain('Latest message:');
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
  expect(acceptor.accept('I can be there at 7 o clock', 1, versionsList[1].label)).toBe('I can be there at 7 o clock');
  expect(acceptor.results).toEqual([{ text: 'I can be there at 7.', slot: 0, label: versionsList[0].label }, { text: 'I can be there at 7 o clock', slot: 1, label: versionsList[1].label }]);
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

// ---- The practice screen's layout (firstmate, run 01M3DQPNAA09QT8P78FEE8YX4H): Sam's two
// lines above the focused field, the app's controls below; the latest message is the nearest
// non-clickable text node fully above the field's top edge, or nothing. ----

const PRACTICE_NODES = [
  { text: 'Ownvoice', top: 60, bottom: 120, clickable: false },
  { text: 'Your writing helper. It stays on this phone.', top: 140, bottom: 190, clickable: false },
  { text: 'Sam', top: 230, bottom: 270, clickable: false },
  { text: 'Are we still on for Saturday?', top: 290, bottom: 340, clickable: false },
  { text: 'I can bring the tent if you bring the stove.', top: 360, bottom: 410, clickable: false },
  { text: 'Turn on Ownvoice', top: 460, bottom: 540, clickable: true },
  { text: 'Where the bubble shows', top: 560, bottom: 620, clickable: true },
  { text: 'Pause for now', top: 640, bottom: 700, clickable: true },
  { text: 'Recent activity: 0', top: 720, bottom: 780, clickable: false },
  { text: 'Clear last screen', top: 800, bottom: 860, clickable: false },
];
const FIELD_TOP = 430;

test('practice screen: the latest message is Sam\'s nearest line above the field, never the controls below it', () => {
  expect(latestMessage(PRACTICE_NODES, FIELD_TOP)).toBe('I can bring the tent if you bring the stove.');
});

test('a node straddling the field top edge, a clickable row, or no field sends no latest message', () => {
  expect(latestMessage(PRACTICE_NODES.map(n => ({ ...n, clickable: true })), FIELD_TOP)).toBe('');
  expect(latestMessage([PRACTICE_NODES[4]], 380)).toBe(''); // the node crosses the field's top edge
  expect(latestMessage(PRACTICE_NODES)).toBe('');
  expect(latestMessage([], 1000)).toBe('');
});
