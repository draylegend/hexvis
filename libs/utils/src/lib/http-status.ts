const OK_MIN = 200;
const OK_MAX = 300;

/** Status code used when a response never delivered one. */
export const UNKNOWN_STATUS = 0;

/**
 * Reports whether an HTTP status belongs to the 2xx success range.
 *
 * @param {number} status Response status code.
 * @returns {boolean} True for 2xx statuses.
 */
export const isOk = (status: number): boolean => status >= OK_MIN && status < OK_MAX;
