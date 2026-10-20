# Check drafts against never-say rules

Part of the ownvoice verification map. Source: `packages/engine/src/protocol.ts`.

## How to get to it (user POV)

A caller (an agent or script) sends one check request to the engine, the same way the mobile writer does before it shows a draft.

## Driving it

Harness: A shell. Each probe is a one-shot pipe: printf a JSON request into the CLI, then read stdout and the exit code. No browser, tmux or PTY is needed.

1. Launch the app as SKILL.md says and wait until it is ready.
2. Printf '%s' '{"verb":"check","drafts":["At the end of the day, I shiped the fix; works now."],"platform":"x","rules":{"never":["at the end of the day"]},"original":"I shipped the fix at 5."}' | node --experimental-strip-types packages/engine/src/cli.mjs. Expect the drafted text back, a dropped entry naming "5", and "limit":280 (the same assertions as the engine-protocol journey's check probe).
3. Capture: save the output and exit status to $DONE_DONE_EVIDENCE_ROOT/check-drafts-against-never-say-rules.txt, as SKILL.md's Evidence section says.
4. Stop what you started.

The drive changes no repo file: note findings in the run's report; after the drive, run done-done maintain to see what drifted, then fix the skill.
