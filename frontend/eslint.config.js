// Flat ESLint config tuned for agentic development.
//
// Design goals (see CODING_STANDARDS.md and docs/superpowers/plans/2026-10-03-frontend-spa.md):
// - deterministic, autofixable rules an agent can satisfy without human feedback
// - one source of truth per concern (prettier owns formatting, eslint owns semantics)
// - type-aware linting is intentionally OFF: it is by far the slowest mode and the
//   required rules below do not need type information.
import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import testingLibrary from 'eslint-plugin-testing-library';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const REACT_COMPILER_MESSAGE =
  'React Compiler memoizes automatically — do not call useMemo/useCallback manually ' +
  '(CODING_STANDARDS.md §3). Move the computation into the render body or a plain helper.';

const TEST_FILES = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  'src/test/**/*.{ts,tsx}',
];
const CONFIG_FILES = ['*.config.js', '*.config.ts', '*.config.mjs'];

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'public/**', 'src/assets/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,

  {
    name: 'tailcut/source',
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    plugins: {
      'react-refresh': reactRefresh,
      'simple-import-sort': simpleImportSort,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // --- structural limits: the 300-line rule is what keeps agent context small ---
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],

      // --- explicit, uniform function signatures ---
      'react/function-component-definition': [
        'error',
        { namedComponents: 'function-declaration', unnamedComponents: 'arrow-function' },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          // Inline JSX handlers (`onClick={() => ...}`) must not be flagged.
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],

      // --- type hygiene ---
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // --- React Compiler anti-patterns (manual memoization) ---
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportSpecifier[imported.name='useMemo']",
          message: REACT_COMPILER_MESSAGE,
        },
        {
          selector: "ImportSpecifier[imported.name='useCallback']",
          message: REACT_COMPILER_MESSAGE,
        },
        { selector: "CallExpression[callee.name='useMemo']", message: REACT_COMPILER_MESSAGE },
        { selector: "CallExpression[callee.name='useCallback']", message: REACT_COMPILER_MESSAGE },
        {
          selector: "CallExpression[callee.property.name='useMemo']",
          message: REACT_COMPILER_MESSAGE,
        },
        {
          selector: "CallExpression[callee.property.name='useCallback']",
          message: REACT_COMPILER_MESSAGE,
        },
      ],

      // --- import order: fully autofixable, no style debates ---
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // --- hygiene ---
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      // TypeScript already checks props (no JS source in this repo), and the rule misfires on
      // inline components whose props are contextually typed by a library (calendar.tsx).
      'react/prop-types': 'off',
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },

  {
    // Vendored shadcn/ui output (`npx shadcn add ...` writes these files verbatim).
    // It is generated code we do not own, so the rules below cannot be satisfied without
    // forking the generator output. Keep this list minimal — import sorting, type imports
    // and component-definition findings stay ON here on purpose, they are autofixable.
    // - max-lines: one generated file per primitive, some exceed 300 lines.
    // - explicit-function-return-type: the generator emits untyped declarations.
    // - react-refresh/only-export-components: variants are exported next to components.
    name: 'tailcut/vendored-shadcn-ui',
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'max-lines': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },

  {
    name: 'tailcut/tests',
    files: TEST_FILES,
    plugins: {
      ...vitest.configs.recommended.plugins,
      ...testingLibrary.configs['flat/react'].plugins,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...vitest.environments.env.globals },
    },
    settings: {
      // Asercje mogą żyć w lokalnym helperze (`expectIconAndLabel`, `expectBadgeIcon`), nie tylko
      // w ciele `it`. Bez tego `vitest/expect-expect` zgłasza „Test has no assertions” w testach,
      // które właśnie sprawdzają dwie rzeczy naraz — a to zaproszenie do rozbicia asercji na ślepo.
      vitest: { typecheck: false },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      ...testingLibrary.configs['flat/react'].rules,
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expectIconAndLabel', 'expectBadgeIcon'] },
      ],
    },
  },

  {
    // Build/tooling config files: no components, no React runtime, Node globals.
    name: 'tailcut/config-files',
    files: CONFIG_FILES,
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'max-lines': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react-refresh/only-export-components': 'off',
      'no-console': 'off',
    },
  },

  // Must stay last: turns off every rule that would fight Prettier.
  prettier,
];
