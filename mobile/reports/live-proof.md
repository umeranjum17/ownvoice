# Live rewrite proof

Opt-in, outside CI. One streamed call using `gpt-6-sol` and the C2 prompt from `Judge.rewritePrompt` for the existing RewriteTest situation: text `ya im in`, screen `bro are you still up for padel`, rule `No em dashes.` The existing sign-in was copied read-only into a throwaway HOME, loaded into byokit's in-memory credential store, and not refreshed or written back.

- Time to first text: 2,087 ms
- Total time: 2,565 ms
- Drafts:
  1. `ya, im in`
  2. `ya im in`
  3. `im in, ya`

The temporary HOME and copied credentials were deleted after the call. No installed tool configuration was changed.
