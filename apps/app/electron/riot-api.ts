// Personal keys allow 100 calls per 120 s; one call per 1.2 s never exceeds it.
export const CALL_SPACING_MS = 1200;
const TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;
const DEFAULT_RETRY_SECONDS = 1;

/** Rate-limited Riot API GET returning the parsed body, false or undefined without one. */
export type RiotReader = (url: string) => Promise<unknown>;

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * One Riot API call after the rate-limit spacing; a 429 is waited out as its
 * Retry-After demands and repeated.
 *
 * @param {string} url Riot API URL.
 * @param {string} key Riot API key.
 * @returns {Promise<unknown>} Parsed body, false when the call failed.
 */
const callRiot = async (url: string, key: string): Promise<unknown> => {
  await wait(CALL_SPACING_MS);
  const res = await fetch(url, { headers: { 'X-Riot-Token': key } });
  if (res.status === TOO_MANY_REQUESTS) {
    await wait(Number(res.headers.get('Retry-After') ?? DEFAULT_RETRY_SECONDS) * MS_PER_SECOND);
    return callRiot(url, key);
  }
  if (!res.ok) {
    console.error(`stats: ${res.status} for ${new URL(url).pathname}`);
  }
  return res.ok && res.json();
};

/**
 * Creates a Riot API reader that stays inside the personal key limits and makes
 * no further calls once the collector is stopped.
 *
 * @param {string} key Riot API key.
 * @param {function(): boolean} isStopped Whether the collector was stopped.
 * @returns {RiotReader} Reader returning the parsed body, undefined or false without one.
 */
export const createRiotReader =
  (key: string, isStopped: () => boolean): RiotReader =>
  async url => {
    let body: unknown;
    if (!isStopped()) {
      body = await callRiot(url, key);
    }
    return body;
  };
