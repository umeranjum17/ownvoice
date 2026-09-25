# Slice 3 phone evidence

On the owner's OnePlus 13 (`a4b93ea2`), installed release `dev.ownvoice.next` beside the existing `dev.ownvoice.app`. With the Kotlin accessibility service off and the new service on, the practice screen produced non-stub phone-model drafts in the new panel. The first screenshot containing drafts was captured 5.405 seconds after tapping the bubble, so first-draft time was **at most 5.4 seconds**.

The screenshots use only Ownvoice's own screen and made-up practice text:

- `OWNVOICE-RN-03-01-practice.png`
- `OWNVOICE-RN-03-02-phone-drafts.png`

After testing, the Kotlin service was switched back on and the new service off. Verified `dev.ownvoice.next` remains installed. No credentials were read or copied, and no installed-tool configuration was changed; build homes and caches were under `.lab/` in this worktree.
