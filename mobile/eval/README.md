# Writer eval (dev-only)

The fixed case set in [`cases.ts`](cases.ts), extended from the offline-model study, including four per-platform reply cases (R09-R12: X, LinkedIn, Reddit, Slack), two tone-polish selection cases (S06-S07: Friendlier, Firmer), one trailing-chatter selection case (S08: Shorter drops appended dash lines) and three tone-line cases (T01-T03), and six local cleanup cases (P14-P19: spelling, a proper noun, advisory grammar, cleanup ordering, mixed-case repetition and protected wording), run through the app's
**live** phone-writer pipeline (`src/panel/phoneWriter.ts` polish + replies,
`src/rewrite/Rewrite.tsx` selection) against an OpenAI-compatible endpoint.
Nothing here ships: no app file imports `mobile/eval/`, and Metro only
bundles from the app entry point.

## Run

```sh
# host llama-server (report §9)
llama-server -m models/<m>.gguf --port 18101 -ngl 99 -c 8192 --jinja -np 1
node run.ts <label> http://localhost:18101 out/<m>.json
node score.ts out/*.json   # table + out/scores.json

# or ollama's OpenAI-compatible endpoint
MODEL=qwen3.8:27b-q4_K_M node run.ts <label> http://localhost:11434 out/<m>.json
```

Env: `MODEL` (ollama model name; unset for llama-server's loaded model),
Thread cases `H01` (X) and `H02` (LinkedIn) run the package-5 thread writer:
one model call for the split plus 3 hooks, checked for the cap, kept words,
`addedNumbers` both ways and hook words from their text (see `scoreThread` in
`score.ts`); they are reported but outside the enforced five-case gate.

`TEMP` (default 0), `SEED` (default 7), `MAXTOK_EXTRA` (extra headroom for
thinking models, default 0), `ONLY` (comma prefixes, e.g.
`ONLY=P01,P13,S05,R01,R07` for the gate cases only). All commands run from
this directory. The pure core it imports (`judge`, `drafts`, `slop`,
`platforms`, `voice`, `threads`, `words`) comes straight from the
`ownvoice-engine` package (`packages/engine`), the same published seam
Crewhouse consumes; it loads under plain node with type stripping and no
loader and no `.mjs` helper in between; polish additionally imports the shared
mobile `src/core/polish.ts` acceptor and loads the bundled Hunspell dictionary;
prompts, pipeline and scorer are the app's own.

## Fit calibration (G9, local only)

```sh
node fit-calibration.ts <reply-outcomes.json>
node fit-calibration.integration.ts
```

Use the JSON array saved under `reply-outcomes`, with the real `Outcome`
shape from `src/core/store.ts`. `checkin` is `replies`, `likes`, `nothing` or
`not-posted`; `checkinAt` is optional milliseconds since epoch. No text is
needed. The CLI only reads the file and makes no network calls.

Strong/Good and Might/Skipped use the level strings from `src/grow/fit.ts`.
Only checked-in, posted replies with one of those four levels count; unrated,
unsure, absent check-ins and `not-posted` rows are excluded. Both groups need
at least 15 eligible check-ins. Pass requires a strictly higher fraction of
`replies` or `likes` in Strong/Good; a tie fails. Output includes group counts
and excluded rows. Exit codes: pass 0, fail 1, **not enough yet 2**, invalid
input 3 (with the actual cause on stderr). Neither an insufficient sample nor
invalid input can pass. This is a personal association, not proof Ownvoice
caused engagement. The integration command seeds files in TMPDIR and drives
the real CLI, including unequal denominators, exclusions and malformed input.

This is an explicitly approved calibration-only slice; no X import is built.
The account-analytics export is not verified for his plan (official X help does
not document it). Public examples have daily New follows/Unfollows but no
follower total, so they cannot fill the weekly follower count without a
baseline; weekly numbers therefore stay manual. Separately, account totals
are never used as per-reply check-ins for G9.

## Threshold rule

A model or prompt change must not drop below the study's numbers on **P01,
P13, S05, R01, and R07** (R07 added with the never-invent-times fix).
`score.ts` enforces this as a gate: it exits 1 when any of the five fails.
Record the run's numbers in the PR.

P14-P19 require their exact Cleaned up sentences. P14-P15 require `It's` along with the spelling and repeated-word fixes. P17-P18 cover spelling before repetition and lowercase-first mixed-case runs; P19 combines protected wording with a supported spelling fix so the unchanged-card guard does not hide the safety check. P14-P19 exercise the shared [Cleaned up acceptance](../README.md#cleaned-up-acceptance) without endpoint calls; their results qualify local cleanup, not live writer quality. Other polish cases request the writer cards and score the combined results.
