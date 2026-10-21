import { readPost, type Post } from './read.ts';
import { SELECTORS } from './selectors.ts';

const $ = (id: string) => document.getElementById(id)!;
const NOTHING = 'Nothing to reply to yet';

function show(note: string, detail: string, post?: Post) {
  $('note').hidden = !!post;
  $('note-title').textContent = note;
  $('note-detail').textContent = detail;
  $('post').hidden = !post;
  $('author').textContent = post?.author ?? '';
  $('text').textContent = post?.text ?? '';
}

let latest = 0;

async function read() {
  const request = ++latest;
  const render = (...args: Parameters<typeof show>) => { if (request === latest) show(...args); };
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    // Without access to the page Chrome hides its address, so a tab with no address is not x.com.
    if (!tab?.id || new URL(tab.url ?? 'about:blank').hostname !== 'x.com') return render(NOTHING, 'Open a post on x.com and I will read it here.');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPost, args: [SELECTORS] });
    if (!result) return render(NOTHING, 'I can’t find a post with words on this page.');
    render('', '', result);
  } catch (error) {
    render('Could not read this page', error instanceof Error ? error.message : String(error));
  }
}

$('again').addEventListener('click', read);
chrome.tabs.onActivated.addListener(read);
chrome.tabs.onUpdated.addListener((_id, change, tab) => { if (tab.active && (change.status === 'complete' || change.url)) read(); });
read();
