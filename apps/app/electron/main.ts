import { scheduleRetry } from '@hexvis/utils';
import { BrowserWindow, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { startBackend } from './backend';

const PRELOAD = path.join(app.getAppPath(), 'preload.cjs');
const RENDERER_INDEX = path.join(app.getAppPath(), '..', 'apps', 'app', 'browser', 'index.html');
const WATCH_ROOT = path.join(app.getAppPath(), '..');
const RELOAD_DELAY_MS = 300;
const RETRY_DELAY_MS = 500;

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  const loadRenderer = (): void => {
    if (window.isDestroyed()) {
      return;
    }
    if (!fs.existsSync(RENDERER_INDEX)) {
      scheduleRetry(loadRenderer, RETRY_DELAY_MS);
      return;
    }
    window.loadFile(RENDERER_INDEX).catch(() => scheduleRetry(loadRenderer, RETRY_DELAY_MS));
  };
  loadRenderer();

  let reloadToken = {};
  const watcher = fs.watch(WATCH_ROOT, { recursive: true }, (_event, filename) => {
    const [root] = filename?.split(/[\\/]/u) ?? [];
    if (root === 'data') {
      return;
    }
    const token = {};
    reloadToken = token;
    setTimeout(() => {
      if (reloadToken === token) {
        loadRenderer();
      }
    }, RELOAD_DELAY_MS);
  });
  window.on('closed', () => watcher.close());

  return window;
};

const stop = await startBackend();
const quit = (): void => app.quit();

// Before-quit fires on every app.quit() path (direct quits skip window-all-closed); preventDefault defers termination until the database lock is released.
app.once('before-quit', event => {
  event.preventDefault();
  stop().finally(quit).catch(console.error);
});
app.on('window-all-closed', quit);
app
  /**
   * Ready fires only after the entry module finishes evaluating, so awaiting it at top level would deadlock.
   * The window is therefore created from the resolved promise instead.
   */
  .whenReady()
  .then(() => createWindow())
  .catch(console.error);
