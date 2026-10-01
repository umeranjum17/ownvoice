# ownvoice-engine

Ownvoice's model-free writing core: voice rules, platform briefs, draft parsing,
thread splitting and writing checks. It makes no network requests, downloads no
models, and has no runtime dependencies. Apache-2.0 licensed.

```sh
npm install ownvoice-engine
```

The package ships JavaScript and TypeScript declarations; Node.js 18+ consumers
need no TypeScript stripping or build step.

```js
import { Protocol } from 'ownvoice-engine';
// Alternatively: import { handle } from 'ownvoice-engine/protocol';
const result = Protocol.handle({ verb: 'check', drafts: ['See you Saturday.'], platform: 'x' });
```

Protocol **1** takes plain JSON requests and returns plain JSON responses.
`ownvoice-engine/protocol/schema.json` contains the request/response schema.
The `ownvoice-engine` executable reads one request on stdin and prints one
response on stdout. Errors print an error envelope and exit with status 1.

```sh
npm exec -- ownvoice-engine hello
npm exec -- ownvoice-engine schema
printf '%s' '{"verb":"voice.parse","markdown":"Keep it short."}' | npm exec -- ownvoice-engine
```

## Development and release

Use the development Node.js and npm versions configured in
[`release.yml`](https://github.com/umeranjum17/ownvoice/blob/main/.github/workflows/release.yml).
From `packages/engine`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`,
and `npm run smoke:pack`. Tests build `dist` first; packing rebuilds it too.
The app continues to import `ownvoice-engine/src/*` so Metro uses source directly.
Consumers should use the compiled root or `ownvoice-engine/protocol` exports.

### Feed screen extraction

`Feed.feedRead(nodes, fieldTop)` is a pure, best-effort extractor over captured
`ScreenText` nodes. It returns `post` using `latestMessage`'s nearest-block
heuristic, plus optional `author`, raw `age`, visible `counts` (replies, likes,
reposts, upvotes), `subredditRules` and up to three `thread` strings. A missing
field position yields an empty post; an unfamiliar layout retains the existing
post-only fallback. Other header-led blocks are visible context, not proven
ancestors. It cannot identify a parent that has scrolled off screen, or distinguish
a parent from a sibling nearest the composer. Layout fixtures are evidence for
the heuristics; real app layouts remain unverified. Screen text is untrusted data:
the extractor never builds prompts, interprets instructions or makes AI calls.

`Platforms.platformForApp(app, nodes)` accepts optional captured nodes. For
Chrome it reads only `com.android.chrome:id/url_bar`, then matches the parsed
host to X (`x.com`, `twitter.com`) or Reddit (`reddit.com`), including common
web/mobile host aliases. Hidden, malformed or ambiguous bars return the default
platform. The Android bridge includes the browser-owned editable URL bar and
preserves optional `viewId` and `description` metadata; other editable fields
remain excluded. Panel integration must pass these nodes when choosing a platform.
The JSON protocol's existing six platform IDs remain unchanged.

Verified identifiers: [Threads Android listing](https://play.google.com/store/apps/details?id=com.instagram.barcelona)
(`com.instagram.barcelona`, cap 500), [Bluesky Android listing](https://play.google.com/store/apps/details?id=xyz.blueskyweb.app)
(`xyz.blueskyweb.app`, cap 300), and [Chromium URL-bar layout](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/android/java/res/layout/url_bar.xml)
(`@+id/url_bar`). These platforms share X's existing feed style; F1 adds no writer
prompt changes or panel wiring.

Bump `package.json` and `src/protocol.ts` together, update the lockfile and merge
through a reviewed PR. The **Release engine** workflow (`release.yml`) only runs
on main and defaults to a dry run. It builds, tests and checks a fresh tarball
consumer, then skips publishing if that version is already on npm. Registry
errors other than a missing version stop the release. Real releases require a
clean checkout at `origin/main`; GitHub Actions uses OIDC and provenance, with
no stored npm token. Local preview: `npm run release -- --dry-run`.

For the first release only, after merging, use a clean checkout of merged main:
run `npm ci`, verify `npm whoami`, then `npm run release`
from this directory using the owner's existing login. This runs the same gates
and checkout safeguards as later releases. Stop if npm requires an
OTP or interactive approval. Once the package exists, configure later releases:

```sh
npm trust github ownvoice-engine --repository umeranjum17/ownvoice --file release.yml --allow-publish
```

This setup may also require the owner to approve an interactive prompt.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
