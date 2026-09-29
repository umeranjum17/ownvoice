# Writer eval (dev-only)

The fixed 30-case set from the offline-model study, including four per-platform reply cases (R09-R12: X, LinkedIn, Reddit, Slack), run through the app's
**live** phone-writer pipeline (`src/panel/phoneWriter.ts` polish + replies,
`src/rewrite/Rewrite.tsx` selection) against an OpenAI-compatible endpoint.
Nothing here ships: no app file imports `mobile/eval/`, and Metro only
bundles from the app entry point.

## Run

```sh
# host llama-server (report §9)
llama-server -m models/<m>.gguf --port 18101 -ngl 99 -c 8192 --jinja -np 1
node --import ./register.mjs run.ts <label> http://localhost:18101 out/<m>.json
node --import ./register.mjs score.ts out/*.json   # table + out/scores.json

# or ollama's OpenAI-compatible endpoint
MODEL=qwen3.8:27b-q4_K_M node --import ./register.mjs run.ts <label> http://localhost:11434 out/<m>.json
```

Env: `MODEL` (ollama model name; unset for llama-server's loaded model),
Thread cases `T01` (X) and `T02` (LinkedIn) run the package-5 thread writer:
one model call for the split plus 3 hooks, checked for the cap, kept words,
`addedNumbers` both ways and hook words from their text (see `scoreThread` in
`score.ts`); they are reported but outside the enforced five-case gate.

`TEMP` (default 0), `SEED` (default 7), `MAXTOK_EXTRA` (extra headroom for
thinking models, default 0), `ONLY` (comma prefixes, e.g.
`ONLY=P01,P13,S05,R01,R07` for the gate cases only). All commands run from
this directory. `hooks.mjs` only shims the phone's settings store and the
TS enums for plain node; prompts, pipeline and scorer are the app's own.

## Threshold rule

A model or prompt change must not drop below the study's numbers on **P01,
P13, S05, R01, and R07** (R07 added with the never-invent-times fix).
`score.ts` enforces this as a gate: it exits 1 when any of the five fails.
Record the run's numbers in the PR.
