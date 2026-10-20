# Read the published protocol schema

Part of the ownvoice verification map. Source: `packages/engine/protocol/schema.json`.

## How to get to it (user POV)

A caller wants the request and response shapes before it sends anything.

## Driving it

Harness: A shell. Each probe is a one-shot pipe: printf a JSON request into the CLI, then read stdout and the exit code. No browser, tmux or PTY is needed.

1. Launch the app as SKILL.md says and wait until it is ready.
2. Node --experimental-strip-types packages/engine/src/cli.mjs schema. Expect exit 0 and the JSON that matches the committed packages/engine/protocol/schema.json.
3. Capture: save the output and exit status to $DONE_DONE_EVIDENCE_ROOT/read-the-published-protocol-schema.txt, as SKILL.md's Evidence section says.
4. Stop what you started.

The drive changes no repo file: note findings in the run's report; after the drive, run done-done maintain to see what drifted, then fix the skill.
