import { ipcMain } from 'electron';

import { openDatabase } from './database';
import { CHANNELS } from './ipc';

/**
 * Backend entry running in the main process; services (database, engine) attach here.
 *
 * @returns {function(): Promise<void>} Closure releasing the database before process exit.
 */
export const startBackend = async (): Promise<() => Promise<true>> => {
  const db = await openDatabase();
  ipcMain.handle(CHANNELS.ping, () => 'pong');
  console.info('backend: database connected');
  return db.close.bind(db);
};
