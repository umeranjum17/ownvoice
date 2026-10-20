# Get the platform list and per-platform limits

Part of the ownvoice verification map. Source: `packages/engine/src/platforms.ts`.

## How to get to it (user POV)

A caller asks which platforms the engine knows before it drafts for one of them.

## Driving it

Harness: A shell. Each probe is a one-shot pipe: printf a JSON request into the CLI, then read stdout and the exit code. No browser, tmux or PTY is needed.

1. Launch the app as SKILL.md says and wait until it is ready.
2. Printf '%s' '{"verb":"platforms"}' | node --experimental-strip-types packages/engine/src/cli.mjs. Expect exit 0 and a JSON body listing the platforms, with X at a 280 limit.
3. Capture: save the output and exit status to $DONE_DONE_EVIDENCE_ROOT/get-the-platform-list-and-per-platform-l.txt, as SKILL.md's Evidence section says.
4. Stop what you started.

The drive changes no repo file: note findings in the run's report; after the drive, run done-done maintain to see what drifted, then fix the skill.
