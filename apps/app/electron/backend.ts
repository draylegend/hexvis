import { ipcMain } from 'electron';

import { CHANNELS } from './ipc';

/** Backend entry running in the main process; services (database, engine) attach here. */
export const startBackend = (): void => {
  ipcMain.handle(CHANNELS.ping, () => 'pong');
};
