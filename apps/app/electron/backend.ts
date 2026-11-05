import { ipcMain } from 'electron';

import { watchChampSelect } from './champ-select';
import db from './database';
import { CHANNELS } from './ipc';
import { createItemAdvisor } from './item-advisor';
import { watchLiveTelemetry } from './live-telemetry';
import { watchMatchStats } from './match-stats';
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
  const stopChampSelect = watchChampSelect();
  const advise = createItemAdvisor();
  const stopLiveTelemetry = watchLiveTelemetry(snapshot => {
    advise(snapshot).catch(console.error);
  });
  await syncPatchAssets().catch(console.error);
  const stopMatchStats = watchMatchStats();
  return () => {
    stopReadyCheck();
    stopChampSelect();
    stopLiveTelemetry();
    stopMatchStats();
    return db.close();
  };
};
