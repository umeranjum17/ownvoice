# Parse a writing-voice note into rules

Part of the ownvoice verification map. Source: `packages/engine/src/voice.ts`.

## How to get to it (user POV)

A user saves Your voice (the never-say list and the How-I-write note) in the app. The app sends the same markdown to the engine's voice.parse verb.

## Driving it

Harness: A shell. Each probe is a one-shot pipe: printf a JSON request into the CLI, then read stdout and the exit code. No browser, tmux or PTY is needed.

1. Launch the app as SKILL.md says and wait until it is ready.
2. Printf '%s' '{"verb":"voice.parse","markdown":"## How I reply\n- tried it today.\n- say more?\n\n## Never say\n- \"at the end of the day\"\n"}' | node --experimental-strip-types packages/engine/src/cli.mjs. Expect the phrases "tried it today" and "at the end of the day" in the parsed output.
3. Capture: save the output and exit status to $DONE_DONE_EVIDENCE_ROOT/parse-a-writing-voice-note-into-rules.txt, as SKILL.md's Evidence section says.
4. Stop what you started.

The drive changes no repo file: note findings in the run's report; after the drive, run done-done maintain to see what drifted, then fix the skill.
