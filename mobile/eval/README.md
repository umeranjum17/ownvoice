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

## Threshold rule

A model or prompt change must not drop below the study's numbers on **P01,
P13, S05, R01, and R07** (R07 added with the never-invent-times fix).
`score.ts` enforces this as a gate: it exits 1 when any of the five fails.
Record the run's numbers in the PR.

P14-P19 require their exact Cleaned up sentences. P14-P15 require `It's` along with the spelling and repeated-word fixes. P17-P18 cover spelling before repetition and lowercase-first mixed-case runs; P19 combines protected wording with a supported spelling fix so the unchanged-card guard does not hide the safety check. Polish uses the shared [Cleaned up acceptance](../README.md#cleaned-up-acceptance), which derives slot 0 solely from the original text and local fixes, before scoring. Only the other two cards are requested from the writer.
