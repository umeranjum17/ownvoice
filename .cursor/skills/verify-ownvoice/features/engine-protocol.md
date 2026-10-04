# Engine protocol

The published `ownvoice-engine` package answers one JSON request on stdin with one JSON response on stdout: writing checks, voice parsing, platform facts. Model-free, no runtime dependencies, no network. This is the host consumer seam — proving it says nothing about Android UI behavior.

## Sub-features

- `engine-hello`: `hello` and `schema` identify protocol, version and request shape.
- `engine-check`: `check` flags never-say hits, stock phrases, added/dropped numbers, fit.
- `engine-voice-parse`: `voice.parse` extracts never-say rules and reply samples from markdown.
- `engine-errors`: bad input returns an error envelope and exit code 1.
- `engine-bounded`: inputs are bounded (`voice.parse` markdown ≤ 100,000 chars).

## How to get to it (user POV)

- Run the `ownvoice-engine` executable with a request on stdin (`npm exec -- ownvoice-engine < request.json`).
- Run `ownvoice-engine hello` or `ownvoice-engine schema` with no stdin.

## Driving it with the ownvoice-engine CLI

Preconditions:

- `packages/engine/dist` is built (skill Launch) and `node dist/cli.mjs hello` prints the package.json version.

- **Check a draft.** `printf '%s' '{"verb":"check","drafts":["At the end of the day, I shiped the fix—works now."],"platform":"x","rules":{"never":["at the end of the day"]},"original":"I shipped the fix at 5."}' | node dist/cli.mjs` — exit 0; the response lists `At the end of the day` in both `voice` and `stock`, `5` in `dropped`, and `limit: 280`.
- **Parse a voice file.** `printf '%s' '{"verb":"voice.parse","markdown":"## How I reply\n- tried it today.\n- say more?\n\n## Never say\n- at the end of the day\n"}' | node dist/cli.mjs` — exit 0; `rules.samples` holds both replies, `rules.never` holds the phrase.
- **Unknown verb.** `printf '%s' '{"verb":"nope"}' | node dist/cli.mjs` — `{"error":{"code":"unknown-verb",...}}`, exit 1.
- **Non-JSON stdin.** `printf 'not json' | node dist/cli.mjs` — `bad-request` envelope, exit 1.
- **Bad platform.** `printf '%s' '{"verb":"check","drafts":["hi"],"platform":"nope"}' | node dist/cli.mjs` — `bad-request` naming the six valid ids, exit 1.
- **Extreme input.** A `voice.parse` markdown longer than 100,000 chars returns `bad-request`, exit 1.
- **Privacy/resource.** `npm ls --omit=dev` is empty and the CLI finishes in milliseconds: no model, no network, bounded input. Evidence uses synthetic text only.
- **Proof.** Save each command, stdout and exit code under `verify-artifacts/engine-protocol/<run>/`.

## Gotchas

- Run from `packages/engine`; `dist/cli.mjs` is the built executable (plain `dist` from anywhere else fails).
- `check` needs non-empty `drafts[]` of strings and a valid `platform` id (`x, linkedin, reddit, slack, whatsapp, gmail`).
- The protocol version comes from `src/protocol.ts`, not just `package.json`; `hello` is the doctor.
- Exit 1 with a JSON error envelope is correct behavior — assert the envelope, not a crash.
