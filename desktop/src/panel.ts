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

let latest = 0;

async function read() {
  const request = ++latest;
  const render = (...args: Parameters<typeof show>) => { if (request === latest) show(...args); };
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    // Without access to the page Chrome hides its address, which is how a non-X page falls through.
    if (!tab?.id || platformFor(tab.url ?? '').id !== 'x') return render('Nothing to reply to yet', 'Open a post on x.com and I will read it here.');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPost, args: [SELECTORS] });
    if (!result) return render('Nothing to reply to yet', 'I can’t find a post with words on this page.');
    render('', '', result);
  } catch (error) {
    render('Could not read this page', error instanceof Error ? error.message : String(error));
  }
}

$('again').addEventListener('click', read);
chrome.tabs.onActivated.addListener(read);
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.status === 'complete' || change.url) read(); });
read();
