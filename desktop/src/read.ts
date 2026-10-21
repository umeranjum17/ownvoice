import type { Selectors } from './selectors.ts';

export type Post = { author: string; text: string; composer: boolean };

/** Runs inside the page (chrome.scripting serialises it), so it uses nothing from this module. */
export function readPost(s: Selectors): Post | null {
  const posts = [...document.querySelectorAll(s.post)];
  // On a post page the one being replied to links to its own address; a thread may show others above it.
  const post = posts.find(p => p.querySelector(`a[href^="${location.pathname}"]`)) ?? posts[0];
  // A quoted post's words sit inside a link block; they are not the post being replied to.
  const text = [...(post?.querySelectorAll(s.text) ?? [])].find(n => {
    const quoted = n.closest(s.quoted);
    return !(quoted && post?.contains(quoted));
  })?.textContent?.trim();
  if (!post || !text) return null;
  return {
    author: (post.querySelector<HTMLElement>(s.author)?.innerText ?? '').replace(/\s+/g, ' ').trim(),
    text,
    composer: !!document.querySelector(s.composer),
  };
}
