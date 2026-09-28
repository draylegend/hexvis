import type { OxlintConfig } from 'oxlint';

/**
 * Single shared config for the whole workspace; oxlint walks up to it from any project.
 * Per-project configs must be self-contained: TS configs load via Node native ESM, where
 * relative imports require extensions — banned by the extensionless convention (see AGENTS.md).
 * Two config files in one directory are a hard oxlint error.
 * 'vitest' loads at base: plugins inside overrides are ignored (oxlint limitation, probed).
 * Its rules stay dormant outside test constructs; 'vitest/require-hook' misfires on non-test
 * bootstrap code (main.ts), so it is off at base and re-enabled for specs via overrides.
 * Spec-scoped exceptions live in overrides; every other rule is active on every file type.
 * promise/prefer-await-to-* are off: a single-promise .catch chain beats try/await/catch
 * in simple cases (bootstrap); await style remains available where it actually helps.
 * Disabled rules conflict with Angular/TS conventions or repo rules (AGENTS.md).
 */
export default {
  env: { builtin: true },
  plugins: ['jsdoc', 'promise', 'typescript', 'oxc', 'vitest', 'unicorn'],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  categories: {
    correctness: 'error',
    pedantic: 'error',
    perf: 'error',
    restriction: 'error',
    style: 'error',
    suspicious: 'error',
  },
  rules: {
    'new-cap': 'off',
    'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    'oxc/no-async-await': 'off',
    'oxc/no-optional-chaining': 'off',
    'promise/prefer-await-to-callbacks': 'off',
    'promise/prefer-await-to-then': 'off',
    'sort-imports': ['error', { ignoreDeclarationSort: true }],
    'sort-keys': 'off',
    'typescript/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
    'typescript/no-confusing-void-expression': [
      'error',
      { ignoreArrowShorthand: true, ignoreVoidReturningFunctions: true },
    ],
    'typescript/no-extraneous-class': ['error', { allowWithDecorator: true }],
    'unicorn/prefer-top-level-await': 'off',
    'vitest/require-hook': 'off',
  },
  overrides: [
    {
      files: ['*.spec.ts', '*.test.ts'],
      rules: {
        'init-declarations': 'off',
        'no-unsafe-assignment': 'off',
        'one-var': 'off',
        'vitest/consistent-test-filename': 'off',
        'vitest/no-hooks': 'off',
        'vitest/prefer-describe-function-title': 'off',
        'vitest/prefer-expect-assertions': 'off',
        'vitest/prefer-importing-vitest-globals': 'off',
        'vitest/prefer-lowercase-title': 'off',
        'vitest/prefer-strict-boolean-matchers': 'off',
        'vitest/require-hook': 'error',
        'vitest/require-test-timeout': 'off',
      },
    },
  ],
} satisfies OxlintConfig;
