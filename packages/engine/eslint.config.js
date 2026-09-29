import { defineConfig } from 'eslint/config';
import tsParser from '@typescript-eslint/parser';
// Mirrors mobile/eslint.config.js; kept as a separate file so the engine
// package lints standalone (mobile's config only covers files under mobile/).
export default defineConfig([{files:['**/*.ts'],languageOptions:{parser:tsParser,parserOptions:{ecmaVersion:'latest',sourceType:'module'}},rules:{'no-undef':'off'}}]);
