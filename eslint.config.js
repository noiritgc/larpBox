import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'Larpbox-TV-Design-Handoff/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/server/**/*.ts', 'packages/**/*.ts', 'tests/**/*.ts', '*.config.{js,ts}', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Review scripts run in Node and pass callbacks into the browser through Playwright.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'User strings render as React text only.',
        },
      ],
    },
  },
  {
    // The prompt pack and server internals must never reach the browser bundle or shared code.
    files: ['apps/web/**/*.{ts,tsx}', 'packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/larpbox-prompts.json'], message: 'The prompt pack is server-only.' },
            { group: ['@larpbox/server', '**/apps/server/**'], message: 'Server code is server-only.' },
          ],
        },
      ],
    },
  },
);
