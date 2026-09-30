import { UNKNOWN_STATUS, isOk, isRecord, parseJson, scheduleRetry, toText } from '@hexvis/utils';
import { request } from 'node:https';
import WebSocket from 'ws';

import { type LcuCredentials, getLcuCredentials } from './lcu-credentials';

/**
 * WAMP (Web Application Messaging Protocol) is the JSON messaging layer the League
 * client speaks over its WebSocket. Every frame is an array starting with an opcode:
 * 5 = SUBSCRIBE ("notify me about a topic"), 8 = EVENT ("here is one payload"), which
 * then arrives as [8, 'OnJsonApiEvent', { uri, eventType, data }] — OnJsonApiEvent
 * being the client's catch-all topic for REST resource changes. That layout is what
 * OPCODE_INDEX and PAYLOAD_INDEX below point at; 'wamp' is the subprotocol name
 * announced during the WebSocket handshake.
 */

const JSON_API_EVENT = 'OnJsonApiEvent';
const WAMP_SUBPROTOCOL = 'wamp';
const WAMP_SUBSCRIBE_OPCODE = 5;
const WAMP_EVENT_OPCODE = 8;
const OPCODE_INDEX = 0;
const PAYLOAD_INDEX = 2;
const READY_CHECK_URI = '/lol-matchmaking/v1/ready-check';
const ACCEPT_PATH = '/lol-matchmaking/v1/ready-check/accept';
const ACCEPT_BODY = '{}';
const LCU_HOST = '127.0.0.1';
const RETRY_DELAY_MS = 5000;
const REQUEST_TIMEOUT_MS = 5000;
const IN_PROGRESS_STATE = 'InProgress';
const ACCEPTED_RESPONSE = 'Accepted';

const shouldAccept = (payload: unknown): boolean =>
  isRecord(payload) &&
  payload['state'] === IN_PROGRESS_STATE &&
  payload['playerResponse'] !== ACCEPTED_RESPONSE;

const isEventFrame = (frame: unknown): frame is unknown[] =>
  Array.isArray(frame) && frame[OPCODE_INDEX] === WAMP_EVENT_OPCODE;

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
  const frame = parseJson(message);
  if (!isEventFrame(frame)) {
    return false;
  }
  const payload = frame[PAYLOAD_INDEX];
  return isRecord(payload) && payload['uri'] === READY_CHECK_URI && shouldAccept(payload['data']);
};

/**
 * Broadcasts the acceptance payload to the local client over its self-signed
 * HTTPS endpoint; rejects on transport failures and stalled responses.
 *
 * @param {LcuCredentials} credentials Active client port and token.
 * @returns {Promise<number>} Response status code of the accept call.
 */
const postAccept = (credentials: LcuCredentials): Promise<number> =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        host: LCU_HOST,
        port: credentials.port,
        path: ACCEPT_PATH,
        method: 'POST',
        rejectUnauthorized: false,
        headers: {
          Authorization: `Basic ${Buffer.from(`riot:${credentials.token}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'Content-Length': ACCEPT_BODY.length,
        },
      },
      res => {
        res.resume();
        resolve(res.statusCode ?? UNKNOWN_STATUS);
      },
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('ready-check: accept stalled')));
    req.on('error', reject);
    req.end(ACCEPT_BODY);
  });

const broadcastAccept = async (credentials: LcuCredentials): Promise<void> => {
  const status = await postAccept(credentials);
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
export const watchReadyCheck = (): (() => void) => {
  let stopped = false;
  let credentials: LcuCredentials | undefined;
  let socket: WebSocket | undefined;

  const open = (client: LcuCredentials, onDrop: () => Promise<void>): void => {
    socket = new WebSocket(`wss://${LCU_HOST}:${client.port}/`, WAMP_SUBPROTOCOL, {
      headers: { Authorization: `Basic ${Buffer.from(`riot:${client.token}`).toString('base64')}` },
      rejectUnauthorized: false,
    });
    socket.on('open', () => socket?.send(JSON.stringify([WAMP_SUBSCRIBE_OPCODE, JSON_API_EVENT])));
    socket.on('message', raw => {
      if (isReadyCheckAcceptable(toText(raw))) {
        broadcastAccept(client).catch(console.error);
      }
    });
    socket.on('error', error => console.error(error));
    socket.on('close', () => {
      credentials = undefined;
      scheduleRetry(onDrop, RETRY_DELAY_MS);
    });
  };

  const connect = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    credentials ??= await getLcuCredentials();
    if (stopped) {
      return;
    }
    if (!credentials) {
      scheduleRetry(connect, RETRY_DELAY_MS);
      return;
    }
    open(credentials, connect);
  };
  connect().catch(console.error);

  return () => {
    stopped = true;
    socket?.close();
  };
};
