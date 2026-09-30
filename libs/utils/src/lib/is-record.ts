/**
 * Narrows an unknown payload to an object record, the precondition for reading
 * named fields without casting.
 *
 * @param {unknown} value Candidate value.
 * @returns {value is Record<string, unknown>} True when the value is a non-null object.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && Boolean(value);
