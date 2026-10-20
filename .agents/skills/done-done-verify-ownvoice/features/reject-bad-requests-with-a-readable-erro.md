# Reject bad requests with a readable error

Part of the ownvoice verification map. Source: `packages/engine/src/cli.mjs`.

## How to get to it (user POV)

A caller sends a malformed or unknown request by mistake.

## Driving it

Harness: A shell. Each probe is a one-shot pipe: printf a JSON request into the CLI, then read stdout and the exit code. No browser, tmux or PTY is needed.

1. Launch the app as SKILL.md says and wait until it is ready.
2. Printf '%s' '{"verb":"nope"}' | node --experimental-strip-types packages/engine/src/cli.mjs. Expect exit 1 and {"error":{"code":"unknown-verb",...}}. Then send printf 'not json' and expect exit 1 with code bad-request.
3. Capture: save the output and exit status to $DONE_DONE_EVIDENCE_ROOT/reject-bad-requests-with-a-readable-erro.txt, as SKILL.md's Evidence section says.
4. Stop what you started.

The drive changes no repo file: note findings in the run's report; after the drive, run done-done maintain to see what drifted, then fix the skill.
