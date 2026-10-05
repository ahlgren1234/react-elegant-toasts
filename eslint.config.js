// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  // The demo is linted from P-25. Fixtures are excluded from the library's lint (§27).
  globalIgnores(['dist/', 'coverage/', 'demo-dist/', 'demo/', 'fixtures/']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: { globals: globals.browser },
    settings: { react: { version: 'detect' } },
    rules: {
      // The isomorphic layout effect takes dependencies like the hooks it wraps.
      'react-hooks/exhaustive-deps': ['warn', { additionalHooks: '^useIsomorphicLayoutEffect$' }],
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  // JS files belong to no tsconfig project, so they are linted without type information.
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  prettier
);
