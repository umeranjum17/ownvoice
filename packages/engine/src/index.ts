// ownvoice-engine: the pure writing core, re-exported from the app's files.
// Single source of truth: mobile/src/core/*.ts is the code; this package only
// re-exports it, so Metro/Expo and mobile/ tests keep resolving untouched.
// (words.ts rides along: judge.ts imports it.)
export * as Slop from '../../../mobile/src/core/slop.ts';
export * as Voice from '../../../mobile/src/core/voice.ts';
export * as Platforms from '../../../mobile/src/core/platforms.ts';
export * as Drafts from '../../../mobile/src/core/drafts.ts';
export * as Judge from '../../../mobile/src/core/judge.ts';
export * as Words from '../../../mobile/src/core/words.ts';
