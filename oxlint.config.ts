import type { OxlintConfig } from 'oxlint';

/**
 * Single shared config for the whole workspace; oxlint walks up to it from any project.
 * Per-project configs must be self-contained: TS configs load via Node native ESM, where
 * relative imports require extensions — banned by the extensionless convention (see AGENTS.md).
 * Two config files in one directory is a hard oxlint error.
 */
export default {
  env: { builtin: true },
  // Vitest loads at base: plugins inside overrides are ignored (oxlint limitation, probed).
  // Its rules stay dormant outside test constructs.
  plugins: ['jsdoc', 'promise', 'typescript', 'oxc', 'vitest', 'unicorn'],
  options: { typeAware: true, typeCheck: true },
  categories: {
    correctness: 'error',
    pedantic: 'error',
    perf: 'error',
    restriction: 'error',
    style: 'error',
    suspicious: 'error',
  },
  /**
   * Disabled rules conflict with Angular/TS conventions or repo rules (AGENTS.md).
   */
  rules: {
    /**
     * Redundant under typeCheck: true — TS2454 reports reads before assignment
     * (type-aware, unlike this syntactic rule) and no-unassigned-vars covers the
     * never-assigned case; keeping it would only force no-op `= undefined` onto
     * declarations whose type already includes undefined.
     */
    'init-declarations': 'off',
    'new-cap': 'off',
    'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    /**
     * ES3-era guard against a writable `undefined` global; Electron/Node expose it
     * as a stable, non-writable binding.
     */
    'no-undefined': 'off',
    'one-var': ['error', 'never'],
    'oxc/no-async-await': 'off',
    /**
     * Payload documents must be copied, never mutated (prefer-object-spread bans the
     * assign alternative); the rule's own note allows disabling for copy-on-write.
     */
    'oxc/no-map-spread': 'off',
    'oxc/no-optional-chaining': 'off',
    'oxc/no-rest-spread-properties': 'off',
    /**
     * The Promise constructor is standard ES2015; the rule's own docs sanction
     * disabling it — its suggested alternative, util.promisify, is equally standard.
     */
    'promise/avoid-new': 'off',
    /**
     * A single-promise .catch chain beats try/await/catch in simple cases (bootstrap);
     * the await style remains available where it actually helps.
     */
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
    /**
     * Handlers receive mutable-by-type callbacks (Electron/Event params carry legacy mutable
     * DOM fields) but only read them.
     */
    'typescript/prefer-readonly-parameter-types': 'off',
    /**
     * Conflicts with `require-await` and `return-await` (never) on Promise-constructor
     * wrappers: the fixer injects `async`, which then has no `await` to satisfy
     * require-await and may not `return await` — leaving a redundant local as the
     * only compliant shape.
     */
    'typescript/promise-function-async': 'off',
    /**
     * TypeScript intentionally allows value-returning functions in void positions;
     * banning it misfires on Node's documented util.promisify(execFile) pattern.
     */
    'typescript/strict-void-return': 'off',
    'unicorn/prefer-top-level-await': 'off',
    /**
     * Off at base because it misfires on non-test bootstrap code (main.ts);
     * re-enabled for specs via overrides.
     */
    'vitest/require-hook': 'off',
  },
  // Spec-scoped exceptions live here; every other rule is active on every file type.
  overrides: [
    {
      files: ['*.spec.ts', '*.test.ts'],
      rules: {
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
