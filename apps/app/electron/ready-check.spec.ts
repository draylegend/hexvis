import { isReadyCheckAcceptable } from './ready-check';

// Real WAMP (Web Application Messaging Protocol) frames as documented by hextechdocs.
// The LCU websocket payloads look like [opcode, event name, { uri, eventType, data }].
// Readiness pops for 12 seconds.
const WAMP_EVENT_OPCODE = 8;
const WAMP_UNSUBSCRIBE_OPCODE = 6;
const READY_CHECK_URI = '/lol-matchmaking/v1/ready-check';
const ACCEPTABLE_FRAME = JSON.stringify([
  WAMP_EVENT_OPCODE,
  'OnJsonApiEvent',
  {
    uri: READY_CHECK_URI,
    eventType: 'Update',
    data: { state: 'InProgress', playerResponse: 'None' },
  },
]);

const frame = (uri: string, data: unknown): string =>
  JSON.stringify([WAMP_EVENT_OPCODE, 'OnJsonApiEvent', { uri, eventType: 'Update', data }]);

describe('ready check', () => {
  it('accepts while the check waits for the local response', () => {
    expect(isReadyCheckAcceptable(ACCEPTABLE_FRAME)).toBeTruthy();
  });

  it('skips answered and terminal states', () => {
    expect(
      isReadyCheckAcceptable(
        frame(READY_CHECK_URI, { state: 'InProgress', playerResponse: 'Accepted' }),
      ),
    ).toBeFalsy();
    expect(isReadyCheckAcceptable(frame(READY_CHECK_URI, { state: 'EveryoneReady' }))).toBeFalsy();
    expect(isReadyCheckAcceptable(frame(READY_CHECK_URI, { state: 'Invalid' }))).toBeFalsy();
    expect(isReadyCheckAcceptable(frame(READY_CHECK_URI, { state: 'Declined' }))).toBeFalsy();
    expect(
      isReadyCheckAcceptable(
        JSON.stringify([WAMP_EVENT_OPCODE, 'OnJsonApiEvent', { uri: READY_CHECK_URI }]),
      ),
    ).toBeFalsy();
  });

  it('ignores other resources and non-event frames', () => {
    expect(
      isReadyCheckAcceptable(frame('/lol-gameflow/v1/gameflow-phase', { state: 'InProgress' })),
    ).toBeFalsy();
    expect(
      isReadyCheckAcceptable(JSON.stringify([WAMP_UNSUBSCRIBE_OPCODE, 'OnJsonApiEvent'])),
    ).toBeFalsy();
    expect(
      isReadyCheckAcceptable(JSON.stringify([WAMP_EVENT_OPCODE, 'OnJsonApiEvent', 'payload'])),
    ).toBeFalsy();
  });

  it('never accepts a malformed frame', () => {
    expect(isReadyCheckAcceptable('')).toBeFalsy();
    expect(isReadyCheckAcceptable('<html lang="en">502</html>')).toBeFalsy();
    expect(isReadyCheckAcceptable('["InProgress"]')).toBeFalsy();
    expect(isReadyCheckAcceptable('"InProgress"')).toBeFalsy();
  });
});
