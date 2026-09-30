import { parseCmd } from './lcu-credentials';

// Real LeagueClientUx command lines as documented by LCU tooling (hextechdocs,
// Overwolf launcher events): flags arrive quoted and mixed with riotclient-* ones.
const UX_PORT = 57_610;
const UX_TOKEN = 'scIN957coAwcbo0WW78nzg';
const UX_COMMAND_LINE =
  `E:/Games/LeagueClient/LeagueClientUx.exe "--remoting-auth-token=${UX_TOKEN}" ` +
  `"--app-port=${UX_PORT}" "--install-directory=E:/Games/" "--app-name=LeagueClient" ` +
  `"--riotclient-auth-token=abcDEF123" "--riotclient-app-port=63154"`;

describe('lcu credentials', () => {
  it('extracts port and token from the client command line', () => {
    expect(parseCmd(UX_COMMAND_LINE)).toStrictEqual({ port: UX_PORT, token: UX_TOKEN });
  });

  it('returns undefined without lcu flags', () => {
    expect(
      parseCmd('--riotclient-auth-token=abcDEF123 --riotclient-app-port=63154'),
    ).toBeUndefined();
    expect(parseCmd('')).toBeUndefined();
  });
});
