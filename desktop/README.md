# Ownvoice for desktop Chrome (side panel)

Slice 1: open the side panel on an x.com post and see the post Ownvoice read. No writer, no account, no key, no network code at all.

## Load it

```
cd desktop && npm install && npm run build
```

Then `chrome://extensions` › Developer mode › Load unpacked › `desktop/dist`. Click the Ownvoice button to open the panel. Chrome 114 or newer.

## What it reads

Only the post whose address matches the page you are on (its author and words), and only when the active tab is on x.com. The panel reads when you open it, when you switch to another tab, when the active tab finishes loading or changes address, and when you press Read again. A quoted post, other posts in the thread and the rest of the page are not read. Nothing is stored or sent; the extension asks for no permission beyond the side panel, reading x.com pages and the reading itself.

With nothing to read (another site, a timeline or profile page, or a post with no words) the panel says "Nothing to reply to yet" and shows no post.

## Where things are

- `src/selectors.ts`: every handle on x.com's markup, in one file. If X changes its page, fix it there.
- `src/read.ts`: runs inside the page and returns the post.

## Not verified on the real site

x.com answers HTTP 403 to automated browsers, so the selectors are written from X's known `data-testid` markup and checked against a local copy of that markup served as x.com, not against the live site. Open a real post once and look at the panel before trusting it.

## Check it

`npm run build`, then `PLAYWRIGHT_DIR=<playwright install> node e2e/side-panel.mjs dist <evidence dir>` loads the unpacked extension in Chromium against `e2e/post.html` served as x.com and checks the panel, light and dark.
