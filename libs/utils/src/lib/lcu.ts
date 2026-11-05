import { request } from 'node:https';
import WebSocket from 'ws';

import { UNKNOWN_STATUS } from './http-status';
import { isRecord } from './is-record';
import { parseJson } from './parse-json';
import { RIOT_CA } from './riot-ca';
import { scheduleRetry } from './schedule-retry';
import { toText } from './to-text';

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
const WAMP_SUBSCRIBE_OPCODE = 5;
const WAMP_EVENT_OPCODE = 8;
const OPCODE_INDEX = 0;
const PAYLOAD_INDEX = 2;
const LCU_HOST = '127.0.0.1';
const RETRY_DELAY_MS = 5000;
const REQUEST_TIMEOUT_MS = 5000;

/** Port and remoting token of the running local League client. */
export interface LcuCredentials {
  port: number;
  token: string;
}

/** One change notification published on the client's catch-all API topic. */
export interface JsonApiEvent {
  uri: string;
  data: unknown;
}

/** One call against the local client's REST surface; reads send no body. */
export interface LcuRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: string;
}

/** Status and parsed JSON body of one call; empty or malformed bodies read as undefined. */
export interface LcuResponse {
  status: number;
  body: unknown;
}

const isEventFrame = (frame: unknown): frame is unknown[] =>
  Array.isArray(frame) && frame[OPCODE_INDEX] === WAMP_EVENT_OPCODE;

/**
 * Parses one raw WAMP frame into its API event payload; frames of any other
 * opcode or shape — including malformed JSON — yield undefined, so an
 * untrusted frame can never masquerade as a resource change.
 *
 * @param {string} message Raw text frame received from the client.
 * @returns {JsonApiEvent | undefined} Event, undefined for foreign frames.
 */
export const parseJsonApiEvent = (message: string): JsonApiEvent | undefined => {
  const frame = parseJson(message);
  if (!isEventFrame(frame)) {
    return undefined;
  }
  const payload = frame[PAYLOAD_INDEX];
  if (!isRecord(payload) || typeof payload['uri'] !== 'string') {
    return undefined;
  }
  return { uri: payload['uri'], data: payload['data'] };
};

/**
 * Sends one call to the local client over its HTTPS endpoint, trusting only
 * Riot's root CA; rejects on transport failures, foreign certificates and
 * stalled responses.
 *
 * @param {LcuCredentials} credentials Active client port and token.
 * @param {LcuRequest} call Method, resource path and optional JSON body of the call.
 * @returns {Promise<LcuResponse>} Status and parsed body of the response.
 */
export const requestLcu = (credentials: LcuCredentials, call: LcuRequest): Promise<LcuResponse> =>
  new Promise((resolve, reject) => {
    const body = call.body ?? '';
    const req = request(
      {
        host: LCU_HOST,
        port: credentials.port,
        path: call.path,
        method: call.method,
        ca: RIOT_CA,
        headers: {
          Authorization: `Basic ${Buffer.from(`riot:${credentials.token}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? UNKNOWN_STATUS,
            body: parseJson(Buffer.concat(chunks).toString('utf8')),
          });
        });
      },
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`lcu: ${call.path} stalled`));
    });
    req.on('error', reject);
    req.end(body);
  });

/**
 * Subscribes to the local client's catch-all API events and hands every raw
 * frame to the handler together with the credentials that opened the socket.
 * The subscription re-sniffs credentials after every drop (a client restart
 * rotates port and token) and retries at a fixed cadence while no client is
 * running; the returned closure closes the socket and disarms every retry.
 *
 * @param {function(): (Promise<LcuCredentials | undefined>)} getCredentials Credential sniffer.
 * @param {function(string, LcuCredentials): void} onMessage Handler for one raw frame.
 * @returns {function(): void} Closure closing the subscription.
 */
export const watchJsonApiEvents = (
  getCredentials: () => Promise<LcuCredentials | undefined>,
  onMessage: (message: string, credentials: LcuCredentials) => void,
): (() => void) => {
  let stopped = false;
  let credentials: LcuCredentials | undefined;
  let socket: WebSocket | undefined;

  const open = (client: LcuCredentials, onDrop: () => Promise<void>): void => {
    socket = new WebSocket(`wss://${LCU_HOST}:${client.port}/`, 'wamp', {
      headers: { Authorization: `Basic ${Buffer.from(`riot:${client.token}`).toString('base64')}` },
      ca: RIOT_CA,
    });
    socket.on('open', () => socket?.send(JSON.stringify([WAMP_SUBSCRIBE_OPCODE, JSON_API_EVENT])));
    socket.on('message', raw => onMessage(toText(raw), client));
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
    credentials ??= await getCredentials();
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
