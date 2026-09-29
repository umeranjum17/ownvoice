import { readFile } from 'node:fs/promises';

// Loader for the dev-only eval (mobile/eval/run.ts, score.ts): it imports the
// app's live core modules, which the phone bundles with Metro but plain node
// can't load as-is. Two shims, nothing else:
// 1. `./store` (expo-sqlite) resolves to an in-memory stub; the eval never
//    reads or writes the phone's settings.
// 2. `export enum` becomes a const object: this node build strips types but
//    doesn't transform enums, and both enums here are plain string maps.
//    The transform happens here (not via next()) because node's own format
//    sniffing rejects enums before a chained load ever runs.
export async function resolve(specifier, context, next) {
  if (/(^|\/)store$/.test(specifier)) {
    return next(new URL('./store-stub.ts', import.meta.url).href, context);
  }
  try {
    return await next(specifier, context);
  } catch (error) {
    if (/^\.\.?(\/|$)/.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw error;
  }
}

export async function load(url, context, next) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const raw = await readFile(new URL(url), 'utf8');
    // voice.ts mixes type names (Hit, Rules) into a value import; strip-only
    // mode keeps them and linking fails, so drop the two known type names.
    const noTypes = raw.replace('{ Hit, NO_RULES, Rules,', '{ NO_RULES,');
    const source = noTypes.replace(
      /export\s+enum\s+(\w+)\s*\{([^}]*)\}/g,
      (_, name, body) => `export const ${name} = {${body.replace(/(\w+)\s*=/g, '$1:')}}`,
    );
    return { format: 'module-typescript', source, shortCircuit: true };
  }
  return next(url, context);
}
