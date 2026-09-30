import { ipcMain } from 'electron';

import db from './database';
import { CHANNELS } from './ipc';
import { syncPatchAssets } from './patch-sync';
import { watchReadyCheck } from './ready-check';

/**
 * Backend entry running in the main process; services (database, engine) attach here.
 *
 * @returns {function(): Promise<void>} Closure releasing the database before process exit.
 */
export const startBackend = async (): Promise<() => Promise<true>> => {
  ipcMain.handle(CHANNELS.ping, () => 'pong');
  console.info('backend: database connected');
  const stopReadyCheck = watchReadyCheck();
  await syncPatchAssets().catch(console.error);
  return () => {
    stopReadyCheck();
    return db.close();
  };
};
