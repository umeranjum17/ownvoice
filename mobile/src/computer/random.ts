import { getRandomValues } from 'expo-crypto';

// @byokit/pair's crypto reads crypto.getRandomValues when it loads, and Hermes lacks it, so this module runs first.
if (!globalThis.crypto?.getRandomValues) (globalThis as { crypto?: unknown }).crypto = { getRandomValues };
