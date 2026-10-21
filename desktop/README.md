# Ownvoice for desktop Chrome (side panel)

Slice 1: open the side panel on an x.com post and see the post Ownvoice read. No writer, no account, no key, no network code at all.

## Load it

```
cd desktop && npm install && npm run build
```

Then `chrome://extensions` › Developer mode › Load unpacked › `desktop/dist`. Click the Ownvoice button to open the panel. Chrome 114 or newer.

## What it reads

Only when the active tab is on x.com, and only when you open or refresh the panel: the post you are replying to (its author and words) and whether the reply box is open. A quoted post, other posts in the thread and the rest of the page are not read. Nothing is stored or sent; the extension asks for no permission beyond the side panel, reading x.com pages and the reading itself.

With nothing to read (another site, or a post with no words) the panel says "Nothing to reply to yet" and shows no post.

## Where things are

- `src/selectors.ts`: every handle on x.com's markup, in one file. If X changes its page, fix it there.
- `src/read.ts`: runs inside the page and returns the post.
- `src/platform.ts`: which site this is, from the engine's own Chrome rule (`packages/engine`, unchanged).

## Not verified on the real site

x.com answers HTTP 403 to automated browsers, so the selectors are written from X's known `data-testid` markup and checked against a local copy of that markup served as x.com, not against the live site. Open a real post once and look at the panel before trusting it.
