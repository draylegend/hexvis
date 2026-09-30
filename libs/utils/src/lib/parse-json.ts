/**
 * Parses JSON defensively: a truncated or non-JSON payload must read as "no
 * data" instead of throwing at the trust boundary.
 *
 * @param {string} text Raw payload text.
 * @returns {unknown} Parsed value, undefined when the body is malformed.
 */
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
