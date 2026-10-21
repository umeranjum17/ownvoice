import { platformFor } from './platform.ts';
import { readPost } from './read.ts';
import { SELECTORS } from './selectors.ts';

const $ = (id: string) => document.getElementById(id)!;

function show(note: string, detail: string, post?: { author: string; text: string; composer: boolean }) {
  $('note').hidden = !!post;
  $('note-title').textContent = note;
  $('note-detail').textContent = detail;
  $('post').hidden = !post;
  $('author').textContent = post?.author ?? '';
  $('text').textContent = post?.text ?? '';
  $('composer').textContent = post?.composer ? 'The reply box is open.' : 'The reply box is not open yet.';
}

async function read() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    // Without access to the page Chrome hides its address, which is how a non-X page falls through.
    if (!tab?.id || platformFor(tab.url ?? '').id !== 'x') return show('Nothing to reply to yet', 'Open a post on x.com and I will read it here.');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPost, args: [SELECTORS] });
    if (!result) return show('Nothing to reply to yet', 'I can’t find a post with words on this page.');
    show('', '', result);
  } catch (error) {
    show('Could not read this page', error instanceof Error ? error.message : String(error));
  }
}

$('again').addEventListener('click', read);
chrome.tabs.onActivated.addListener(read);
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.status === 'complete' || change.url) read(); });
read();
