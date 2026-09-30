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
ownvoice-engine hello
ownvoice-engine schema
printf '%s' '{"verb":"voice.parse","markdown":"Keep it short."}' | ownvoice-engine
```

## Development and release

From `packages/engine`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`,
and `npm run smoke:pack`. Tests build `dist` first; packing rebuilds it too.
The app continues to import `ownvoice-engine/src/*` so Metro uses source directly.
Consumers should use the compiled root or `ownvoice-engine/protocol` exports.

Bump `package.json` and `src/protocol.ts` together, update the lockfile and merge
through a reviewed PR. The **Release engine** workflow (`release.yml`) only runs
on main and defaults to a dry run. It builds, tests and checks a fresh tarball
consumer, then skips publishing if that version is already on npm. Registry
errors other than a missing version stop the release. Real releases require a
clean checkout at `origin/main`; GitHub Actions uses OIDC and provenance, with
no stored npm token. Local preview: `npm run release -- --dry-run`.

For the first release only, after merging, use a clean checkout of merged main:
run the checks above, verify `npm whoami`, then `npm publish --access public`
from this directory using the owner's existing login. Stop if npm requires an
OTP or interactive approval. Once the package exists, configure later releases:

```sh
npm trust github ownvoice-engine --repository umeranjum17/ownvoice --file release.yml --allow-publish
```

This setup may also require the owner to approve an interactive prompt.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
