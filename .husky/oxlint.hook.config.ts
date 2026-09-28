import type { OxlintConfig } from 'oxlint';

/**
 * Pre-commit fix scope for pass 2. The CLI `-D NAME` drops rule options
 * (probed: declaration sort fired despite the main config), so the hook
 * declares `sort-imports` itself with `ignoreDeclarationSort` — specifier
 * order only, statement order stays with oxfmt. Lives outside the repo root
 * because two config files in one directory are a hard oxlint error.
 */
export default {
  rules: {
    'sort-imports': ['error', { ignoreDeclarationSort: true }],
  },
} satisfies OxlintConfig;
