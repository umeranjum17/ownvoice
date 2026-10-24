# Writer eval (dev-only)

The fixed case set in [`cases.ts`](cases.ts), extended from the offline-model study, including four per-platform reply cases (R09-R12: X, LinkedIn, Reddit, Slack), two tone-polish selection cases (S06-S07: Friendlier, Firmer), one trailing-chatter selection case (S08: Shorter drops appended dash lines) and three tone-line cases (T01-T03), and six local cleanup cases (P14-P19: spelling, a proper noun, advisory grammar, cleanup ordering, mixed-case repetition and protected wording), run through the app's
**live** phone-writer pipeline (`src/panel/phoneWriter.ts` polish + replies,
`src/rewrite/Rewrite.tsx` selection) against an OpenAI-compatible endpoint.
P01 (and P13, scored from P01's Shorter card) calls the same `polishVersions`
function as the phone. Nothing here ships: no app file imports `mobile/eval/`,
and Metro only bundles from the app entry point.

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
`ONLY=P01,P13,S05,R01,R07` for the gate cases only). Set
`EVAL_BACKEND=codex-cli` to use installed Codex (`gpt-6-luna`) instead of HTTP
(keep a placeholder base URL); `CODEX_BIN` optionally selects the executable.
All commands run from this directory. The pure core it imports (`judge`,
`drafts`, `slop`, `platforms`, `voice`, `threads`, `words`) comes straight from the
`ownvoice-engine` package (`packages/engine`), the same published seam
Crewhouse consumes; it loads under plain node with type stripping and no
loader and no `.mjs` helper in between; polish additionally imports the shared
mobile `src/core/polish.ts` acceptor and loads the bundled Hunspell dictionary;
prompts, pipeline and scorer are the app's own.

## Phone fit deadline regression

`node phone-fit.integration.ts` replays the retained native four-card answer through the
actual `judgeFit` and published decision engine. Complete output maps to its actual levels;
truncated JSON and a synthetic below-floor control still abstain. Add `--deadline` for a real
61-second loopback HTTP response: the unchanged cloud/default minute deadline abstains,
while the phone's five-minute deadline preserves the model's answer. This fixture serves
recorded text, not inference; it does not qualify phone-model quality. The native companion is
`PHONE_FIT=1 ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned> node mobile/e2e/phone-reply.mjs <scratch> <evidence>`
from the repo root: the lab X post plus Umer's typed reply, free phone writer, actual fit
results and every card captured without inserting or sending. Run the existing eight-case
hosted writer gate as well; the timing change does not alter any prompt or threshold.

## Fit calibration (G9, local only)

```sh
node fit-calibration.ts <reply-outcomes.json>
node fit-calibration.integration.ts
```

Run from this directory with Node's native TypeScript stripping and installed
mobile dependencies; no model endpoint, sign-in or emulator is needed.
Use the JSON array saved under `reply-outcomes`, with the real `Outcome`
shape from `src/core/store.ts`. `checkin` is `replies`, `likes`, `nothing` or
`not-posted`; `checkinAt` is optional milliseconds since epoch. No text is
needed. The CLI only reads the file and makes no network calls. Malformed
JSON, invalid insertion metadata and duplicate insertion IDs are rejected.

Strong/Good and Might/Skipped use the level strings from `src/grow/fit.ts`.
Only checked-in, posted replies with one of those four levels count; unrated,
unsure, absent check-ins and `not-posted` rows are excluded. Both groups need
at least 15 eligible check-ins. Pass requires a strictly higher fraction of
`replies` or `likes` in Strong/Good; a tie fails. Output includes group counts
and excluded rows. Exit codes: pass 0, fail 1, **not enough yet 2**, invalid
input 3 (with the actual cause on stderr). Neither an insufficient sample nor
invalid input can pass. This is a personal association, not proof Ownvoice
caused engagement. Selection bias remains: mostly inserting top cards makes
the lower group fill slowly; rated inserts of the person's own draft also count.
The integration command seeds files in TMPDIR and drives
the real CLI, including unequal denominators, exclusions and malformed input.

This is an explicitly approved calibration-only slice; no X import is built.
The account-analytics export is not verified for his plan (official X help does
not document it). Public examples have daily New follows/Unfollows but no
follower total, so they cannot fill the weekly follower count without a
baseline; weekly numbers therefore stay manual. Separately, account totals
are never used as per-reply check-ins for G9.

## Growth eval set (G01-G20, G2)

Twenty grow-mode feed cases join the fixed set: ten X-style (`com.twitter.android`) and
ten Reddit-style (`com.reddit.frontpage`), each a fictional author and post, some with
Umer's own draft, all carrying his demo voice profile (never-say "game changer", "delve",
"circle back"; `noDashes`; three sample replies). `scoreFeed` in `score.ts` applies the
G2 checks to a recorded run's cards: every shown suggestion has zero never-say phrases,
zero long dashes, and no number that is not already in the post plus the draft; his draft
comes back as the **Yours** card untouched; and a candidate that breaks the never-say list
(Yours included) is rated the bottom level (`Likely to be skipped`). Because local model
servers are banned here, a live pass against a model is out of scope for this lane: the G
set is driven by a recorded run (`results[].shown[]` suggestions with `slot`/`level`, plus
`results[].yours` and `results[].yoursLevel`), and it is reported beside the gate, never
inside it. The original five gate cases stay P01, P13, S05, R01 and R07. R13, R14 and P20 additionally gate parent-copy rejection, reply-not-instruction output and two distinct own-post versions.

## Threshold rule

A model or prompt change must not drop below the study's numbers on **P01,
P13, S05, R01, and R07** (R07 added with the never-invent-times fix).
`score.ts` enforces this as a gate: it exits 1 when any of the five fails.
Record the run's numbers in the PR. R13 and R14 run an X-style parent post through the phone reply prompts and admission, requiring three cards, no parent echoes and no instruction-style replies; they also replay the audit's bad answers through admission: copies and instructions must drop, while a preamble may only leave its clean reply text. R14 includes the person's own reply so far (grow mode). P20 runs the phone's slot-first polish pipeline from one line and requires both distinct writer versions. These three regressions are enforced alongside the original five; no original threshold is lowered. `node run.ts --replay` prints raw and admitted text for every recorded audit/native failure. It rejects copies and instructions, strips leading `Reply:` / `X:` preambles, and retains clean reply text. Historical prompt excerpts are replay-only fixtures for the leaked examples and the misquoted fixture's typed line; no few-shot example ships in a phone prompt. Live phone admission compares each candidate with the actual prompt it answered: labelled/unlabelled lines, sentences, quoted text and long verbatim spans, using stricter word overlap for prompt copies. A repeated or embedded reply preamble is not a reply. The phone pipeline gives each rejected slot one attempt regardless of inference speed, then withholds it rather than offering a bad draft.

For a host without a permitted local model server, use the documented Codex backend:

```sh
EVAL_BACKEND=codex-cli ONLY=P01,P13,S05,R01,R07,R13,R14,P20 node run.ts echo-guard http://unused /path/to/eval.json
node score.ts /path/to/eval.json
```

That run checks the prompts and admission on the hosted writer, not phone-model quality. The complementary native proof is `ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned> node e2e/phone-reply.mjs <scratch> <evidence>` from `mobile/` after installing the candidate, preparing **On this phone** through its download consent and enabling X in app choices. It uses the native X lab, one bubble tap, no browser or sign-in, and saves every offered reply plus its rating rows. Native acceptance requires at least one reply and every shown reply to be clean; fewer than three is allowed when bad slots are withheld. This explicit native acceptance does not relax the hosted eight-case gate.

P14-P19 require their exact Cleaned up sentences. P14-P15 require `It's` along with the spelling and repeated-word fixes. P17-P18 cover spelling before repetition and lowercase-first mixed-case runs; P19 combines protected wording with a supported spelling fix so the unchanged-card guard does not hide the safety check. P14-P19 exercise the shared [Cleaned up acceptance](../README.md#cleaned-up-acceptance) without endpoint calls; their results qualify local cleanup, not live writer quality. Other polish cases run the point check (`canPolish`) as advisory, as the phone does: an `UNCLEAR` answer still requests the writer cards, and a case counts as declined only when no card lands. The combined results are scored.
