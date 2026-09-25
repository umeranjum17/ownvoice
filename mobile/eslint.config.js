const { defineConfig } = require('eslint/config');
const tsParser = require('@typescript-eslint/parser');
module.exports = defineConfig([{files:['**/*.ts','**/*.tsx'],languageOptions:{parser:tsParser,parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},rules:{'no-undef':'off'}}]);
