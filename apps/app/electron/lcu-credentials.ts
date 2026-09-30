import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const PS_TIMEOUT_MS = 5000;
const CIM_INSTANCE = `Get-CimInstance Win32_Process -Filter "Name='LeagueClientUx.exe'" | Select-Object -ExpandProperty CommandLine`;
const PORT_PATTERN = /--app-port=(?<port>\d+)/u;
const TOKEN_PATTERN = /--remoting-auth-token=(?<token>[\w-]+)/u;
const runExecFile = promisify(execFile);

export interface LcuCredentials {
  port: number;
  token: string;
}

/**
 * Extracts the LCU port and remoting token from a LeagueClientUx command line.
 * The `riotclient-*` flags carry the Riot Client's own port/token; their names
 * differ beyond a dash, so these patterns cannot match them.
 *
 * @param {string} cmd Raw process command line.
 * @returns {LcuCredentials | undefined} Credentials, undefined when flags are absent.
 */
export const parseCmd = (cmd: string): LcuCredentials | undefined => {
  const port = PORT_PATTERN.exec(cmd)?.groups?.['port'];
  const token = TOKEN_PATTERN.exec(cmd)?.groups?.['token'];
  if (port === undefined || token === undefined) {
    return undefined;
  }
  return { port: Number(port), token };
};

/**
 * Sniffs port and auth token of the running local League client from its process
 * layer; no install path or lockfile location is assumed. Runs hidden with a hard
 * timeout; any failure (client not running, query blocked) resolves to undefined
 * so callers can poll safely.
 *
 * @returns {Promise<LcuCredentials | undefined>} Credentials, undefined when no
 * client is running or the process query fails.
 */
export const getLcuCredentials = async (): Promise<LcuCredentials | undefined> => {
  try {
    const { stdout } = await runExecFile(
      'powershell.exe',
      ['-NoProfile', '-Command', CIM_INSTANCE],
      { encoding: 'utf8', windowsHide: true, timeout: PS_TIMEOUT_MS },
    );
    return parseCmd(stdout);
  } catch {
    return undefined;
  }
};
