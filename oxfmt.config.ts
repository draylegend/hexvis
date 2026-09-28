import type { OxfmtConfig } from 'oxfmt';

export default {
  arrowParens: 'avoid',
  singleQuote: true,
  trailingComma: 'all',
  sortImports: {
    groups: [
      'type-import',
      ['value-builtin', 'value-external'],
      'type-internal',
      'value-internal',
      ['type-parent', 'type-sibling', 'type-index'],
      ['value-parent', 'value-sibling', 'value-index'],
      'unknown',
    ],
  },
} satisfies OxfmtConfig;
