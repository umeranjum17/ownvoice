import type { Speller } from './typing';

let loading: Promise<Speller> | null = null;

// The dictionary is dictionary-en 4.0.0 (Hunspell's en_US, MIT AND BSD; LICENSE beside it). Android keeps
// app files by name without the extension, so the two files need different names.
/** The English dictionary, read once from the app's own files the first time a check needs it (about half a megabyte). */
export function speller(): Promise<Speller> {
  loading ??= (async () => {
    // Required here, not at the top: people who leave the typing check off never load it.
    const { Asset } = require('expo-asset') as typeof import('expo-asset');
    const { File } = require('expo-file-system') as typeof import('expo-file-system');
    const nspell = require('nspell') as typeof import('nspell');
    const read = async (module: number) => new File((await Asset.fromModule(module).downloadAsync()).localUri!).text();
    const [aff, dic] = await Promise.all([read(require('../../assets/dictionary/en-affixes.aff')), read(require('../../assets/dictionary/en-words.dic'))]);
    return nspell(aff, dic);
  })().catch(error => { loading = null; throw error; });
  return loading;
}
