import type { RawData } from 'ws';

/**
 * Decodes a ws payload to text; the transport may deliver a single buffer, a
 * fragment list or a raw ArrayBuffer, and none of them stringifies meaningfully.
 *
 * @param {RawData} raw Payload as delivered by the ws transport.
 * @returns {string} UTF-8 text of the frame.
 */
export const toText = (raw: RawData): string => {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8');
  }
  if (Buffer.isBuffer(raw)) {
    return raw.toString('utf8');
  }
  return Buffer.from(raw).toString('utf8');
};
