// Registers hooks.mjs via the legacy loader API. module.register is
// deprecated in favour of registerHooks, but this build's registerHooks
// validate chain is stricter than its own next() results (it rejects the
// chained {url} object its nextResolve returns), so the legacy call stays
// until the toolchain moves on. Dev-only either way.
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
