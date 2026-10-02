# X/Reddit panel source checkpoint reconciliation

Original PR: https://github.com/umeranjum17/ownvoice/pull/123

This is a preserving source replacement, not a new feature or live-output pass. Current-main base: `58caa7da7461db9df62cdf951b2a65639323703a`. Original branch `fm/ov-pm-2` stays at `09466e8be204e1d3233f4048a8c954168cc3b464`. Original run `01M3VGARAV691EVHZDXF0XZC4J` remains failed at Push: the stock mirror guard refused four at-risk original commits. No old branch, mirror ref or run record was forced, aborted or edited.

The corrected failed-Push endpoint `ed6942c004cb44bacd3e16c4a5462a5aa69f86d7` was archived read-only from its exact existing recovery ref in the task's recorded pipeline repository. Complete original and corrected bundles/source archives and SHA-256 receipts are preserved in task data outside this worktree. The immutable corrected bundle was fetched into this isolated copy; all five accepted commits were cherry-picked without conflict onto current main.

## Commit mapping

| Original accepted commit | Corrected pipeline equivalent | Replacement commit |
| --- | --- | --- |
| `f25192e09859d19351ec8a58176fa5ce9379f438` | `9a8b25a8a5146c73b89cc5a4d39c7cb6d53da1dc` | `9f763110dc4bd12b45b4451e7a0f7efc0889bb1c` |
| `e96710f221506027ec9ef100b6bcd26106f1d911` | `83f4bbe0d3bc63cb1db6c0fea716278de1479d2c` | `812ea957761fcda181627f47cc055235d8ad503e` |
| `90502ef019ff3a4897052e3e038367f0404d896c` | `f13ca66ef029cc27d048097eb8647f3ea4021b1d` | `4e78ef5ad910ac0960a47de0e4c35c448d7887dd` |
| `09466e8be204e1d3233f4048a8c954168cc3b464` | `df88e8ea2f767da30a8328247f5ccee44b6b364c` | `4fff8a01bb65f28749bebae1153066366df0f478` |
| Additional accepted documentation correction | `ed6942c004cb44bacd3e16c4a5462a5aa69f86d7` | `8ca59112cb7d56731517c00d26ce8afb51d77d2b` |

The five corrected-to-replacement range-diff entries are all `=`. No original accepted commit was skipped. The pipeline equivalents adapt the old patches to already-landed honest-verdict changes rather than restoring stale source or documentation.

## File containment

- `Panel.tsx`: exact corrected endpoint blob `db90c97d2f73c15e02430fe429c3bedb72334fb8`; node-aware platform selection, platform-specific drafting/checks/labels/hand-off, loading heading and X/Reddit-only heading scope retained. Current-main verdict changes remain intact.
- `PanelChromeReddit.test.tsx`, `PanelChromeX.test.tsx`, `PanelPlatformScope.test.tsx`: byte-identical original/corrected/replacement blobs. These are mocked behavioral tests, not proof of real generated output.
- `README.md`: accepted platform-heading paragraph retained; newer current-main streaming reply guidance preserved.
- `mobile/README.md`: corrected panel-heading pointer and captured-node guidance retained; newer current-main streaming acceptance/failure guidance preserved. Honest-verdict guidance already on main remains.
- All unrelated current-main files are unchanged by the five replayed commits, including the portable native-test `java.io.tmpdir` fix, native tests and response-streaming work. No manual conflict repair was needed.

## Acceptance boundary

Actual product proof is a release gate, not a merge gate. The six good/rambling/nonsense browser cases, real native X case, exact output quality/length/shortening thresholds, screenshots, recordings and insertion journey remain unproved on this replacement. Historical fictional-composer evidence is preserved but is not a current-main native/live pass. No Android device, personal app, paid request or release action is authorized or performed here.

The original pipeline's newest baseline and focused mocked checks passed; its live verdict remained inconclusive. The supervisor-approved original Test exception does not transfer as a clean Test pass to this replacement. This replacement requires one fresh full configured stock validation; any ask-user gate is routed to the supervisor.
