import { contextBridge, ipcRenderer } from 'electron';

import { CHANNELS, type IpcSurface } from './ipc';

const surface: IpcSurface = {
  async ping() {
    const reply = await ipcRenderer.invoke(CHANNELS.ping);
    if (typeof reply !== 'string') {
      throw new TypeError('ping returned a non-string reply');
    }
    return reply;
  },
};

contextBridge.exposeInMainWorld('hexvis', surface);
