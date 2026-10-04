# Engine protocol

The published `ownvoice-engine` package answers one JSON request on stdin with one JSON response on stdout: writing checks, voice parsing, platform facts, reply briefs and splitting. Model-free, no runtime dependencies, no network. This is the host consumer seam — proving it says nothing about Android UI behavior.

## Sub-features

- `engine-hello`: `hello` and `schema` identify protocol, version and request shape.
- `engine-check`: `check` flags never-say hits, stock phrases, added/dropped numbers and fit; the response also carries `length`, `words` and `layoutKept`, and `voice`/`stock` name the phrase inside a sentence (e.g. `says "…" from your never-say list`).
- `engine-voice-parse`: `voice.parse` extracts never-say rules and reply samples from markdown; `check`/`brief` rules also accept a bounded `samples[]` (≤10 × 1000 chars).
- `engine-verbs`: `platforms`, `brief`, `split` and `voice.guide` round out the router (`src/protocol.ts`).
- `engine-errors`: bad input returns an error envelope and exit code 1.
- `engine-bounded`: inputs are bounded (`voice.parse` markdown ≤ 100,000 chars).

## How to get to it (user POV)

- Run the `ownvoice-engine` executable with a request on stdin (`npm exec -- ownvoice-engine < request.json`).
- Run `ownvoice-engine hello` or `ownvoice-engine schema` with no stdin.

## Driving it with the ownvoice-engine CLI

Preconditions:

- `packages/engine/dist` is built (skill Launch) and `node dist/cli.mjs hello` prints the package.json version.

- **Check a draft.** `printf '%s' '{"verb":"check","drafts":["At the end of the day, I shiped the fix—works now."],"platform":"x","rules":{"never":["at the end of the day"]},"original":"I shipped the fix at 5."}' | node dist/cli.mjs` — exit 0; the response names `At the end of the day` in both `voice` and `stock`, `5` in `dropped`, and `limit: 280`.
- **Verb coverage.** `printf '%s' '{"verb":"platforms"}' | node dist/cli.mjs` (likewise `brief`, `split`, `voice.guide`) — exit 0 with each verb's documented response.
- **Parse a voice file.** `printf '%s' '{"verb":"voice.parse","markdown":"## How I reply\n- tried it today.\n- say more?\n\n## Never say\n- \"at the end of the day\"\n"}' | node dist/cli.mjs` — exit 0; `rules.samples` holds both replies, `rules.never` holds the phrase (a never-say item needs quotes or ≤5 words — see Gotchas).
- **Unknown verb.** `printf '%s' '{"verb":"nope"}' | node dist/cli.mjs` — `{"error":{"code":"unknown-verb",...}}`, exit 1.
- **Non-JSON stdin.** `printf 'not json' | node dist/cli.mjs` — `bad-request` envelope, exit 1.
- **Bad platform.** `printf '%s' '{"verb":"check","drafts":["hi"],"platform":"nope"}' | node dist/cli.mjs` — `bad-request` naming the six valid ids, exit 1.
- **Extreme input.** A `voice.parse` markdown longer than 100,000 chars returns `bad-request`, exit 1.
- **Privacy/resource.** `npm ls --omit=dev` is empty and the CLI finishes in milliseconds: no model, no network, bounded input. Evidence uses synthetic text only.
- **Proof.** Save each command, stdout and exit code under `verify-artifacts/<task>/engine-protocol/` (stable per-task folder — see the skill's Review evidence).

## Gotchas

- Run from `packages/engine`; `dist/cli.mjs` is the built executable (plain `dist` from anywhere else fails).
- `check` needs non-empty `drafts[]` of strings and a valid `platform` id (`x, linkedin, reddit, slack, whatsapp, gmail`); `brief` needs `kind` (`reply|polish|post|thread`) plus a platform; `split` needs `{text, platform}`; `voice.guide` needs `rules` and boolean `post`.
- A never-say item is taken quoted, or unquoted only at ≤5 words — longer unquoted items land in `skipped`, not `never`.
- The protocol version comes from `src/protocol.ts`, not just `package.json`; `hello` is the doctor.
- Exit 1 with a JSON error envelope is correct behavior — assert the envelope, not a crash.
