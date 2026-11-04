import {
  type LcuCredentials,
  isOk,
  isRecord,
  parseJsonApiEvent,
  requestLcu,
  watchJsonApiEvents,
} from '@hexvis/utils';

import { getLcuCredentials } from './lcu-credentials';

const READY_CHECK_URI = '/lol-matchmaking/v1/ready-check';
const ACCEPT_PATH = '/lol-matchmaking/v1/ready-check/accept';
const ACCEPT_BODY = '{}';
const IN_PROGRESS_STATE = 'InProgress';
const ACCEPTED_RESPONSE = 'Accepted';

const shouldAccept = (payload: unknown): boolean =>
  isRecord(payload) &&
  payload['state'] === IN_PROGRESS_STATE &&
  payload['playerResponse'] !== ACCEPTED_RESPONSE;

/**
 * Verdict on one raw WAMP frame: true only for an API event published on the
 * readiness resource whose payload still waits for the local response. Frames of
 * any other opcode, resource or shape — including malformed JSON — yield false,
 * so an untrusted frame can never trigger a broadcast.
 *
 * @param {string} message Raw text frame received from the client.
 * @returns {boolean} True when the acceptance payload must be sent now.
 */
export const isReadyCheckAcceptable = (message: string): boolean => {
  const event = parseJsonApiEvent(message);
  return event !== undefined && event.uri === READY_CHECK_URI && shouldAccept(event.data);
};

/**
 * Broadcasts the acceptance payload to the local client over its self-signed
 * HTTPS endpoint; rejects on transport failures and stalled responses.
 *
 * @param {LcuCredentials} credentials Active client port and token.
 * @returns {Promise<void>} Resolves once the client answered the acceptance.
 */
const broadcastAccept = async (credentials: LcuCredentials): Promise<void> => {
  const status = await requestLcu(credentials, {
    method: 'POST',
    path: ACCEPT_PATH,
    body: ACCEPT_BODY,
  });
  if (isOk(status)) {
    console.info('ready-check: accepted');
  } else {
    console.error(`ready-check: acceptance refused with ${status}`);
  }
};

/**
 * Subscribes to the local client's readiness events and broadcasts the
 * acceptance payload the moment a check pops. The subscription re-sniffs
 * credentials after every drop (a client restart rotates port and token) and
 * retries at a fixed cadence while no client is running; the returned closure
 * closes the socket and disarms every pending retry.
 *
 * @returns {function(): void} Closure closing the subscription.
 */
export const watchReadyCheck = (): (() => void) =>
  watchJsonApiEvents(getLcuCredentials, (message, credentials) => {
    if (isReadyCheckAcceptable(message)) {
      broadcastAccept(credentials).catch(console.error);
    }
  });
