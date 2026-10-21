import type { Selectors } from './selectors.ts';

export type Post = { author: string; text: string };

/** Runs inside the page (chrome.scripting serialises it), so it uses nothing from this module. */
export function readPost(s: Selectors): Post | null {
  const id = location.pathname.match(/\/status\/(\d+)/)?.[1];
  if (!id) return null;
  // The post being replied to links to its own status; a thread may show other posts above it.
  const post = [...document.querySelectorAll(s.post)].find(p =>
    p.querySelector('time')?.closest<HTMLAnchorElement>('a')?.pathname.match(/\/status\/(\d+)$/)?.[1] === id);
  if (!post) return null;
  // A quoted post is a link card inside this post that carries its own author line.
  const text = [...post.querySelectorAll(s.text)].find(n => {
    const quoted = n.closest(s.quoted);
    return !(quoted && post.contains(quoted) && quoted.querySelector(s.author));
  })?.textContent?.trim();
  if (!text) return null;
  return {
    author: (post.querySelector<HTMLElement>(s.author)?.innerText ?? '').replace(/\s+/g, ' ').trim(),
    text,
  };
}
