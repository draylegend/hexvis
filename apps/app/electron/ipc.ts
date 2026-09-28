/** Renderer-facing contract: the only surface the preload script exposes. */
export interface IpcSurface {
  ping: () => Promise<string>;
}

export const CHANNELS = {
  ping: 'ping',
} as const;
