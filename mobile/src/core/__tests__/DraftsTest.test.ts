import {
  REPLY_SLOTS, acceptReplies, cleanDrafts, cleanSelection, dashDecision, dashesFor, latestMessage,
  layoutKept, norm, numbersAndTimesKept, phoneReplyPrompt, phoneSlotPrompt, preserveFragment,
  rebuildLines, replyPrompt, replySlotPrompt, slotsFor, stripControlLines, undash, versionAcceptor,
} from '../drafts';
import { versionsList } from '../judge';
import { platformForApp } from '../platforms';

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

test('a control-only draft line and leaked practice navigation are removed', () => {
  expect(stripControlLines('Yes, I can bring the stove.\nSend\nSkip', ['Send', 'Skip'])).toBe('Yes, I can bring the stove.');
  expect(acceptReplies(['Draft 1: Saturday works.\nPost'], [], 3, 'remove', ['Post'])).toEqual(['Saturday works.']);
  expect(acceptReplies(['Draft 1: Reply\nBack'], [], 3, 'remove', [])).toEqual(['Reply\nBack']);
  expect(stripControlLines('Reply\nreply', ['Reply'])).toBe('reply');
  expect(stripControlLines('Saturday works. Skip.', ['Skip'])).toBe('Saturday works. Skip.');
});

test('only a single word loses added final punctuation', () => {
  expect(preserveFragment('meeting', 'meeting.')).toBe('meeting');
  expect(preserveFragment('meeting,', 'Meeting,.')).toBe('Meeting,.');
  expect(preserveFragment('why', 'Why?')).toBe('Why?');
  expect(preserveFragment('wow', 'Wow!')).toBe('Wow!');
  expect(preserveFragment('see you Saturday', 'See you Saturday!')).toBe('See you Saturday!');
  expect(preserveFragment('can you come', 'Can you come?')).toBe('Can you come?');
  expect(preserveFragment('Are you coming?', 'Are you coming?')).toBe('Are you coming?');
});

// Selection rewrite (phone check 29 Sep): Shorter on 'Please bring the tent on
// Saturday.' appended dash restatements, one inventing a "deadline" framing.
// Trailing lines past the original are chatter and drop; real lists keep every line.
test('cleanSelection drops trailing chatter lines past the original', () => {
  expect(cleanSelection(
    'Please bring the tent on Saturday.',
    'Bring the tent on Saturday.\n- Please bring the tent.\n- The deadline is Saturday.',
  )).toBe('Bring the tent on Saturday.');
  expect(cleanSelection('See you Saturday!', 'See you Saturday!\nHope this helps!')).toBe('See you Saturday!');
  const list = 'Please bring the tent\n1. Pack the stove\n2. Meet Saturday at noon';
  expect(cleanSelection(list, list)).toBe(list);
  expect(cleanSelection('tommorow', 'tomorrow')).toBe('tomorrow');
});

// ---- 5.3 Duplicates ----

test('one leading agreement may repeat, but opposite answers and different days survive', () => {
  expect(norm('  YES, Saturday!  ')).toBe(norm('yes saturday'));
  expect(norm('Sounds good, Saturday!')).toBe(norm('Yep Saturday'));
  expect(norm("I'm on")).toBe(norm('Im on'));
  expect(norm("I can't bring it")).not.toBe(norm('I can bring it'));
  expect(acceptReplies(["Yep, I'm on", 'Yeah Im on'], [], 2)).toEqual(["Yep, I'm on"]);
  const punctuation = versionAcceptor('Any update?', 'remove', []);
  expect(punctuation.accept("Yep, I'm on", 0)).toBe("Yep, I'm on");
  expect(punctuation.accept('Yeah Im on', 1)).toBeNull();
  expect(acceptReplies(['Yes, Saturday works.', 'YES Saturday works!'], [], 2)).toEqual(['Yes, Saturday works.']);
  expect(acceptReplies(['Yep, still on for Saturday. 👍', 'Yeah, still on for Saturday.'], [], 2))
    .toEqual(['Yep, still on for Saturday. 👍']);
  expect(acceptReplies(['Yes, Saturday works; I can bring the stove', 'No, Saturday works; I can bring the stove'], [], 2)).toHaveLength(2);
  expect(acceptReplies(['I can bring the stove', "I can't bring the stove"], [], 2)).toHaveLength(2);
  expect(acceptReplies(['Could we meet on Saturday?', 'Could we meet on Sunday?'], [], 2)).toHaveLength(2);
  const versions = versionAcceptor('Meet Saturday or Sunday?', 'remove', []);
  expect(versions.accept('Could we meet Saturday or Sunday?', 0)).toBeTruthy();
  expect(versions.accept('Should we meet on Saturday or Sunday?', 1)).toBeTruthy();
  expect(versions.accept('COULD WE MEET SATURDAY OR SUNDAY!', 2)).toBeNull();
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

test('acceptReplies drops a card that only echoes their line, so the empty slot is asked once more', () => {
  // Main765: the one-line starter came back only re-capitalised; an echo-only card is never offered.
  expect(acceptReplies(['Shipping offline notes.'], [], 3, 'remove', [], [], 'shipping offline notes')).toEqual([]);
  expect(acceptReplies(['coffee  tomorrow MORNING!'], [], 3, 'remove', [], [], 'Coffee tomorrow morning')).toEqual([]);
  expect(acceptReplies(['Fix the login bug'], [], 3, 'remove', [], [], 'fix the login bug.')).toEqual([]);
  // A draft that adds to the line still lands, and differs from it.
  const [first] = acceptReplies(['Shipping offline notes changed how we work.'], [], 3, 'remove', [], [], 'shipping offline notes');
  expect(first).toBe('Shipping offline notes changed how we work.');
  // Without their line there is nothing to echo: the old callers keep working.
  expect(acceptReplies(['Shipping offline notes.'], [], 3)).toEqual(['Shipping offline notes.']);
  // A card that is only a slot instruction, or opens with it before a newline, a colon or
  // its own full stop, is stripped the same way (live 2026-10-09: bare instruction cards
  // under an X post); an instruction-only card drops so the per-slot retry re-asks once.
  const xSlots = ['Agree and add one concrete detail from the post.', 'Push back kindly, with one reason from the post.', 'Ask one sharp question about the post.'];
  expect(acceptReplies(['Agree and add one concrete detail from the post.'], [], 3, 'remove', [], [], '', xSlots)).toEqual([]);
  expect(acceptReplies(['AGREE AND ADD ONE CONCRETE DETAIL FROM THE POST'], [], 3, 'remove', [], [], '', xSlots)).toEqual([]);
  expect(acceptReplies(['Agree and add one concrete detail from the post.\nIt caches every article, so a tunnel cannot stop you.'], [], 3, 'remove', [], [], '', xSlots))
    .toEqual(['It caches every article, so a tunnel cannot stop you.']);
  expect(acceptReplies(['Push back kindly, with one reason from the post: I am not sure the cache survives a tunnel.'], [], 3, 'remove', [], [], '', xSlots))
    .toEqual(['I am not sure the cache survives a tunnel.']);
  expect(acceptReplies(['Agree and add one concrete detail from the post. Agree, the offline cache is the real win.'], [], 3, 'remove', [], [], '', xSlots))
    .toEqual(['Agree, the offline cache is the real win.']);
  // Any slot's instruction leaks the same way, even landed in the wrong slot.
  expect(acceptReplies(['Ask one sharp question about the post.'], [], 3, 'remove', [], [], '', xSlots)).toEqual([]);
  // An instruction wrapping their own echoed line still drops: only the echo remains.
  expect(acceptReplies(['Push back kindly, with one reason from the post.\nshipping offline notes'], [], 3, 'remove', [], [], 'shipping offline notes', xSlots)).toEqual([]);
  // A card that is only the prompt's own draft label, or opens with one, is stripped the same
  // way (live: an agree card whose whole text was "Draft"); a label-only card drops and the
  // slot is asked once more.
  expect(acceptReplies(['Draft'], [], 3, 'remove', [], [], '', xSlots)).toEqual([]);
  expect(acceptReplies(['draft 1'], [], 3, 'remove', [], [], '', xSlots)).toEqual([]);
  expect(acceptReplies(['Draft 1:'], [], 3, 'remove', [], [], '', xSlots)).toEqual([]);
  expect(acceptReplies(['Draft 1: It caches every article, so a tunnel cannot stop you.'], [], 3, 'remove', [], [], '', xSlots))
    .toEqual(['It caches every article, so a tunnel cannot stop you.']);
  expect(acceptReplies(['Draft 1\nIt caches every article, so a tunnel cannot stop you.'], [], 3, 'remove', [], [], '', xSlots))
    .toEqual(['It caches every article, so a tunnel cannot stop you.']);
  // A label before a slot instruction strips both, leaving the reply.
  expect(acceptReplies(['Draft 1: Agree and add one concrete detail from the post. It caches every article.'], [], 3, 'remove', [], [], '', xSlots))
    .toEqual(['It caches every article.']);
  // A reply that never quotes an instruction still lands untouched.
  expect(acceptReplies(['Totally agree, the offline cache is the real win.'], [], 3, 'remove', [], [], '', xSlots))
    .toEqual(['Totally agree, the offline cache is the real win.']);
});

// ---- 5.2 Keep the writer's formatting ----

test('acceptReplies drops a card that contradicts its label, so that slot is asked once more', () => {
  const slots = ['Say yes or agree, and answer each point.', 'Give a different answer: decline or suggest a change, kindly.', 'Not sure yet: a short honest reply that asks the one thing needed.'];
  // A decline word in the say-yes slot is dropped; a real decline in the decline slot lands.
  expect(acceptReplies(['Draft 1: No, sorry, that does not work.'], [], 3, 'remove', [], [], '', slots)).toEqual([]);
  expect(acceptReplies(['Draft 2: No, sorry, that does not work.'], [], 3, 'remove', [], [], '', slots)).toEqual([null, 'No, sorry, that does not work.']);
  // An agreement in the decline slot is dropped; a soft alternative that states a real fact is kept.
  expect(acceptReplies(['Draft 2: Yes, Saturday works!'], [], 3, 'remove', [], [], '', slots)).toEqual([]);
  expect(acceptReplies(['Draft 2: Saturday is tricky, could we do Sunday?'], [], 3, 'remove', [], [], '', slots)).toEqual([null, 'Saturday is tricky, could we do Sunday?']);
  // The ask slot is never judged: a refusal there is a legitimate honest answer.
  expect(acceptReplies(['Draft 3: No, not sure yet.'], [], 3, 'remove', [], [], '', slots)).toEqual([null, null, 'No, not sure yet.']);
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
    { text: 'Sam', left: 10, top: 100, bottom: 120, clickable: false },
    { text: 'Are we still on for Saturday?\nI can bring the tent if you bring the stove.', left: 30, top: 125, bottom: 170, clickable: false },
    { text: 'Turn on Ownvoice', left: 30, top: 210, bottom: 230, clickable: true },
    { text: 'Recent activity', left: 30, top: 300, bottom: 320, clickable: true },
    { text: 'Clear last screen', left: 30, top: 330, bottom: 350, clickable: true },
  ];
  expect(latestMessage(nodes, 200)).toBe(nodes[1].text);
  expect(latestMessage(nodes.slice(2), 200)).toBe('');
  expect(latestMessage([{ text: 'x'.repeat(400), left: 0, top: 0, bottom: 1, clickable: false }], 200)).toHaveLength(400);
  const long = 'Can you bring the stove? ' + 'Earlier context. '.repeat(230) + 'What time works?';
  const latest = latestMessage([{ text: long, left: 0, top: 0, bottom: 1, clickable: false }], 200);
  const prompt = phoneReplyPrompt({ ...input, latest, conversation: 'Earlier screen. '.repeat(240) });
  expect(prompt).toContain('Latest message:\nCan you bring the stove?');
  expect(prompt).toContain('What time works?');
  expect(latest).toContain('(middle shortened)');
  expect(latest.length).toBeLessThan(1530);
  const middle = 'a'.repeat(1100) + 'Can we meet in the middle? ' + 'b'.repeat(1100);
  const shortened = latestMessage([{ text: middle, left: 0, top: 0, bottom: 1, clickable: false }], 200);
  expect(shortened).not.toContain('Can we meet in the middle?');
  expect(shortened).toContain('(middle shortened)');
  expect(phoneReplyPrompt({ ...input, latest: 'Hello', conversation: 'x'.repeat(3100) })).toContain(`Conversation:\n${'x'.repeat(3000)}`);
  const short = 'What about Saturday? ' + 'a'.repeat(1450);
  expect(latestMessage([{ text: short, left: 0, top: 0, bottom: 1, clickable: false }], 200)).toBe(short);
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

test('phone prompts carry the shortest fitting samples labelled, and drop them past the floor', () => {
  const label = "Replies they wrote (match this voice, don't copy)";
  const samples = ['Sounds good.', "I'm in.", 'See you soon.'];
  const base = { latest: 'Sam: Saturday?', conversation: 'Sam: Saturday?', samples };
  // Gmail leaves room for all three; Slack only for the two shortest; both stay in budget.
  const gmail = phoneReplyPrompt({ ...base, platform: platformForApp('com.google.android.gm') });
  expect(gmail).toContain(label);
  expect(gmail).toContain('["I\'m in.","Sounds good.","See you soon."]');
  expect(gmail.split('\n\nLatest message:')[0].length).toBeLessThanOrEqual(700);
  const slack = phoneReplyPrompt({ ...base, platform: platformForApp('com.Slack') });
  expect(slack).toContain(label);
  expect(slack).toContain('["I\'m in.","Sounds good."]');
  expect(slack).not.toContain('See you soon.');
  expect(slack.split('\n\nLatest message:')[0].length).toBeLessThanOrEqual(700);
  const full = phoneReplyPrompt({ ...input, samples: ['x'.repeat(300), 'y'.repeat(300)] });
  expect(full).toBe(phoneReplyPrompt(input));
  expect(full).not.toContain(label);
  const gmailPlatform = platformForApp('com.google.android.gm');
  const slot = phoneSlotPrompt(slotsFor(gmailPlatform)[0], { latest: 'Dana: still on?', conversation: 'Dana: still on?', platform: gmailPlatform, samples: ['ok', 'yes'] }, []);
  expect(slot).toContain(label);
  expect(slot).toContain('["ok","yes"]');
  expect(phoneSlotPrompt(REPLY_SLOTS[1], { ...input, samples: ['x'.repeat(300), 'y'.repeat(300)] }, [])).toBe(phoneSlotPrompt(REPLY_SLOTS[1], input, []));
});

// ---- 5.2 Version acceptance ----

const list = 'I can bring the stove.\n1. I will bring the stove.\n2. You can bring the tent.';

test('versionAcceptor drops a version equal to the writer text and near-duplicates', () => {
  const acceptor = versionAcceptor('see you at 7', 'remove', []);
  expect(acceptor.accept('see you at 7', 0, versionsList[0].label)).toBeNull();
  expect(acceptor.accept('see you at 7', 1, versionsList[1].label)).toBeNull();
  const first = acceptor.accept('I can be there at 7.', 0, versionsList[0].label);
  expect(first).toBe('I can be there at 7.');
  expect(acceptor.accept('I can be there at 7 o clock', 1, versionsList[1].label)).toBe('I can be there at 7 o clock');
  expect(acceptor.results).toEqual([{ text: 'I can be there at 7.', slot: 0, label: versionsList[0].label }, { text: 'I can be there at 7 o clock', slot: 1, label: versionsList[1].label }]);
  expect(versionAcceptor('see you Saturday', 'remove', []).accept('See you on Saturday!', 0)).toBe('See you on Saturday!');
});

test('versionAcceptor calls their text unchanged only when it comes back the same, give or take spacing', () => {
  const list = 'Quick update:\n\n1. Pack the stove\n2. Meet Saturday';
  const same = versionAcceptor(list, 'remove', []);
  expect(same.accept('Quick update:\n\n1. Pack the stove\n2.  Meet Saturday ', 0)).toBeNull();
  expect(same.unchanged).toBe(true);
  expect(same.accept('Quick update:\n\n1. Pack the stove.\n2. Meet on Saturday', 1)).not.toBeNull();
  expect(same.unchanged).toBe(false); // a real version shows instead
  const collapsed = versionAcceptor(list, 'remove', []);
  expect(collapsed.accept('Quick update:\n1. Pack the stove\n2. Meet Saturday', 0)).toBeNull();
  expect(collapsed.unchanged).toBe(false);
  const flattened = versionAcceptor(list, 'remove', []);
  expect(flattened.accept('Quick update: 1. Pack the stove 2. Meet Saturday', 0)).toBeNull();
  expect(flattened.unchanged).toBe(false);
  const failed = versionAcceptor(list, 'remove', []);
  failed.accept('Pack the stove and meet Saturday.', 0); // flattened: a failure, not "looks good"
  failed.accept('', 1);
  expect(failed.unchanged).toBe(false);
  const recased = versionAcceptor(list, 'remove', []);
  recased.accept('quick update:\n\n1. pack the stove\n2. meet saturday', 0); // dropped as a duplicate, but not the same text
  expect(recased.unchanged).toBe(false);
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

const PRACTICE_NODES = [
  { text: 'Ownvoice', left: 10, top: 60, bottom: 120, clickable: false },
  { text: 'Your writing helper. It stays on this phone.', left: 10, top: 140, bottom: 190, clickable: false },
  { text: 'Sam', left: 10, top: 230, bottom: 270, clickable: false },
  { text: 'Are we still on for Saturday?', left: 30, top: 290, bottom: 340, clickable: false },
  { text: 'I can bring the tent if you bring the stove.', left: 30, top: 360, bottom: 410, clickable: false },
  { text: 'Turn on Ownvoice', left: 30, top: 460, bottom: 540, clickable: true },
  { text: 'Where the bubble shows', left: 30, top: 560, bottom: 620, clickable: true },
  { text: 'Pause for now', left: 30, top: 640, bottom: 700, clickable: true },
  { text: 'Recent activity: 0', left: 30, top: 720, bottom: 780, clickable: false },
  { text: 'Clear last screen', left: 30, top: 800, bottom: 860, clickable: false },
];
const FIELD_TOP = 430;

test('practice screen groups Sam’s question and offer without controls', () => {
  expect(latestMessage(PRACTICE_NODES, FIELD_TOP)).toBe('Are we still on for Saturday?\nI can bring the tent if you bring the stove.');
});

test('an earlier separate message stays outside the latest block', () => {
  const nodes = [
    { text: 'Can you send it today?', left: 30, top: 200, bottom: 250, clickable: false },
    { text: 'Are we still on for Saturday?', left: 30, top: 290, bottom: 340, clickable: false },
    { text: 'I can bring the tent if you bring the stove.', left: 30, top: 360, bottom: 410, clickable: false },
  ];
  expect(latestMessage(nodes, FIELD_TOP)).toBe('Are we still on for Saturday?\nI can bring the tent if you bring the stove.');
});

test('a node straddling the field top edge, a clickable row, or no field sends no latest message', () => {
  expect(latestMessage(PRACTICE_NODES.map(n => ({ ...n, clickable: true })), FIELD_TOP)).toBe('');
  expect(latestMessage([PRACTICE_NODES[4]], 380)).toBe(''); // the node crosses the field's top edge
  expect(latestMessage(PRACTICE_NODES)).toBe('');
  expect(latestMessage([], 1000)).toBe('');
});

// Phone-model markdown (offline-model study §5.2, Appendix E): Nano answers the
// numbered reply call with a preamble line, **bold** headers and "Draft N: label"
// headers. All three must go before splitting, leaving three clean drafts.
test('acceptReplies strips phone-model markdown, preamble and label headers', () => {
  const r04 = `Okay, here are three reply drafts for Jake's messages, keeping in mind the instructions.\n\n**Draft 1: Agreeing & Answering**\n\nDraft 1: Yeah, I saw. It's frustrating. I think we should roll back. The last build had that memory leak, right? It was causing crashes.\n\n**Draft 2: Declining/Suggesting Change**\n\nDraft 2: Hmm, I don't think we should roll back just yet. Let's try a different configuration first. Maybe tweaking the database connection? It might resolve the issue without a rollback.\n\n**Draft 3: Uncertain & Asking a Question**\n\nDraft 3: Not sure yet. What's the root cause this time? Knowing that would help me decide.`;
  expect(acceptReplies([r04], [], 3)).toEqual([
    "Yeah, I saw. It's frustrating. I think we should roll back. The last build had that memory leak, right? It was causing crashes.",
    "Hmm, I don't think we should roll back just yet. Let's try a different configuration first. Maybe tweaking the database connection? It might resolve the issue without a rollback.",
    "Not sure yet. What's the root cause this time? Knowing that would help me decide.",
  ]);
  const r06 = `Okay, here are three reply drafts for Alex, responding to "I got the job!!! starting Oct 14", each following your instructions.\n\n**Draft 1: Agree/Yes**\n\nDraft 1: That's awesome Alex! Congrats. Oct 14 is great. So happy for you.\n\n**Draft 2: Decline/Suggest Change (Kindly)**\n\nDraft 2: Congrats Alex! That's fantastic news. Oct 14 works for you? Just checking if that's okay with the team.\n\n**Draft 3: Not Sure Yet**\n\nDraft 3: Wow, congrats Alex! That's great news. What kind of role is it?`;
  const drafts = acceptReplies([r06], [], 3);
  expect(drafts).toHaveLength(3);
  expect(drafts.every(d => d && !d.includes('**') && !/^(Okay|Sure),? here are/i.test(d))).toBe(true);
  expect(drafts.join('\n')).not.toMatch(/Agree\/Yes|Suggest Change|Not Sure Yet/);
});

test('replyPromptsUseOnlySourceTimes',()=>{
  const input={latest:"Tom: what time's your flight tomorrow?",conversation:"Tom: what time's your flight tomorrow?",guide:''};
  expect(replyPrompt({...input,dashes:'remove'})).toContain('Use only times, dates and facts');
  expect(phoneReplyPrompt(input)).toContain('Never invent facts, times or dates');
  expect(phoneSlotPrompt(REPLY_SLOTS[1],input,[])).toContain('Use only times, dates and facts');
});

test('rebuildLines rescues a flattened list onto the original markers', () => {
  const original = 'Bring the tent\n1. Pack the stove\n2. Meet Saturday at noon';
  const answer = 'Row 1: Bring the tent\nRow 2: Pack the stove\nRow 3: Meet Saturday at noon';
  expect(rebuildLines(original, answer)).toBe('Bring the tent\n1. Pack the stove\n2. Meet Saturday at noon');
});

test('rebuildLines keeps only expected Row lines; chatter never becomes row content', () => {
  const original = 'Please bring the tent\n1. Pack the stove\n2. Meet Saturday at noon';
  expect(rebuildLines(original, 'Row 1: Bring the tent\nRow 2: Pack the stove\nRow 3: Meet Saturday at noon\nThanks!'))
    .toBe('Bring the tent\n1. Pack the stove\n2. Meet Saturday at noon');
  expect(rebuildLines(original, 'Row 1: Bring the tent\nRow 2: Pack the stove\nHope this helps!\nRow 3: Meet Saturday at noon'))
    .toBe('Bring the tent\n1. Pack the stove\n2. Meet Saturday at noon');
  expect(rebuildLines(original, 'Bring the tent\nPack the stove\nMeet Saturday at noon')).toBeNull();
  expect(rebuildLines(original, 'Row 1: Bring the tent\nRow 2: Pack the stove')).toBeNull();
});

test('numbersAndTimesKept fails dropped or invented numbers and times', () => {
  expect(numbersAndTimesKept('2. Meet Saturday at noon', '2. The tent and Saturday are sorted.')).toBe(false);
  expect(numbersAndTimesKept('2. Meet Saturday', '2. Meet Saturday at noon')).toBe(false);
  expect(numbersAndTimesKept('2. Meet Saturday at noon', '2. Meet Saturday at noon!')).toBe(true);
});

test('versionAcceptor rejects first-pass versions that drop or invent times', () => {
  const dropped = versionAcceptor('Bring the tent\n1. Pack the stove\n2. Meet Saturday at noon', 'remove', []);
  expect(dropped.accept('Bring the tent\n1. Pack the stove\n2. Saturday works.', 1, versionsList[1].label)).toBeNull();
  expect(dropped.layoutFails).toEqual([{ slot: 1, label: versionsList[1].label }]);
  const invented = versionAcceptor('Bring the tent\n1. Pack the stove\n2. Meet Saturday', 'remove', []);
  expect(invented.accept('Bring the tent\n1. Pack the stove\n2. Meet Saturday at noon', 1, versionsList[1].label)).toBeNull();
  expect(invented.layoutFails).toEqual([{ slot: 1, label: versionsList[1].label }]); // queued, but the rescue guard drops it
  expect(invented.fix('Bring the tent\n1. Pack the stove\n2. Meet Saturday at noon', 1, versionsList[1].label)).toBeNull();
  const kept = versionAcceptor('Bring the tent\n1. Pack the stove\n2. Meet Saturday at noon', 'remove', []);
  expect(kept.accept('Bring the tent\n1. Pack the stove\n2. Meet Saturday around noon', 1, versionsList[1].label))
    .toBe('Bring the tent\n1. Pack the stove\n2. Meet Saturday around noon');
});

test.each(['accept', 'fix'] as const)('version %s retains casing and apostrophes with all guards', method => {
  expect(versionAcceptor('Its a good plan.', 'keep', [])[method]("It's a good plan.", 0)).toBe("It's a good plan.");
  expect(versionAcceptor('a plan.', 'keep', [])[method]('A plan.', 0)).toBe('A plan.');
  expect(versionAcceptor('Its a plan at 8.', 'keep', [])[method]("It's a plan at 9.", 0)).toBeNull();
  expect(versionAcceptor('Its a plan at noon.', 'keep', [])[method]("It's a plan.", 0)).toBeNull();
  expect(versionAcceptor('Its a plan.\n\n1. Go at 8.', 'keep', [])[method]("It's a plan. 1. Go at 8.", 0)).toBeNull();
  expect(versionAcceptor('Its a plan.', 'keep', ["It's a plan."])[method]("It's a plan.", 0)).toBeNull();
  const accepted = versionAcceptor('Its a plan.', 'keep', []);
  expect(accepted[method]("It's a plan.", 0)).toBe("It's a plan.");
  expect(accepted[method]("IT'S A PLAN!", 1)).toBeNull();
});


test('dash removal preserves protected tokens in replies and every polish slot', () => {
  const tokens = 'https://example.com/a—b. a—b@example.com @a—b #a—b';
  const answer = `Read ${tokens} — please.`;
  const expected = `Read ${tokens}, please.`;
  expect(undash(answer)).toBe(expected);
  expect(acceptReplies([answer], [], 1, 'remove')).toEqual([expected]);
  for (const method of ['accept', 'fix'] as const) for (const slot of [0, 1, 2]) {
    const acceptor = versionAcceptor(`Read ${tokens}.`, 'remove', []);
    expect(acceptor[method](answer, slot)).toBe(expected);
  }
});
