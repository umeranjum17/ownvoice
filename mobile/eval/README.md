# Writer eval (dev-only)

The fixed 39-case set from the offline-model study, including four per-platform reply cases (R09-R12: X, LinkedIn, Reddit, Slack), two tone-polish selection cases (S06-S07: Friendlier, Firmer), one trailing-chatter selection case (S08: Shorter drops appended dash lines) and three tone-line cases (T01-T03), and three local cleanup cases (P14-P16: spelling, a proper noun and advisory grammar), run through the app's
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
loader, with no `../src/core` shim and no `.mjs` helper in between;
prompts, pipeline and scorer are the app's own.

## Threshold rule

A model or prompt change must not drop below the study's numbers on **P01,
P13, S05, R01, and R07** (R07 added with the never-invent-times fix).
`score.ts` enforces this as a gate: it exits 1 when any of the five fails.
Record the run's numbers in the PR.

P14-P15 require the Cleaned up slot to match one of two explicit sentences: the spelling and repeated-word fixes are required, while the writer may retain `Its` or correct it to `It's`. P16 still requires its exact sentence. Polish uses the same automatic dictionary spelling and whole-word function-word repetition cleanup as both app writers, before the existing acceptance guards. Heuristic grammar remains advisory; the writer's completed corrections are preserved.
