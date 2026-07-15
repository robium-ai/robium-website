// localhost/127.* dev backends are plaintext; everything else is TLS.
const isLocal = (h: string) => /^(localhost|127\.|\[::1\])/.test(h);
const HTTP = (h: string) => `${isLocal(h) ? 'http' : 'https'}://${h}`;
const WS = (h: string) => `${isLocal(h) ? 'ws' : 'wss'}://${h}`;

export interface Status {
  claimed: boolean;
  ready: boolean;
  rtf: number | null;
  nodes: number;
  uptime_s: number;
  remaining_s: number;
  fleet: { running: number | null; budget: number };
  log: string[];
}

export interface Entry { name: string; dir: boolean; }

const opts: RequestInit = { credentials: 'include' };

export const start = (h: string, s: string) =>
  fetch(`${HTTP(h)}/start?session=${s}`, { ...opts, method: 'POST' });

export const status = (h: string, s: string): Promise<Status | null> =>
  fetch(`${HTTP(h)}/status?session=${s}`, opts).then((r) =>
    r.status === 409 ? null : (r.json() as Promise<Status>),
  );

export const shutdown = (h: string, s: string) =>
  fetch(`${HTTP(h)}/shutdown?session=${s}`, { ...opts, method: 'POST' });

export const listDir = (h: string, s: string, path: string) =>
  fetch(`${HTTP(h)}/fs/list?session=${s}&path=${encodeURIComponent(path)}`, opts).then(
    (r) => r.json() as Promise<{ path: string; entries: Entry[] }>,
  );

export const readFile = (h: string, s: string, path: string) =>
  fetch(`${HTTP(h)}/fs/read?session=${s}&path=${encodeURIComponent(path)}`, opts).then(
    (r) => r.json() as Promise<{ path: string; content: string }>,
  );

export const writeFile = (h: string, s: string, path: string, content: string) =>
  fetch(`${HTTP(h)}/fs/write?session=${s}&path=${encodeURIComponent(path)}`, {
    ...opts,
    method: 'POST',
    body: content,
  });

// vla-trial's Robot pane: the in-container Gradio app (instruction + Rerun viewer).
export const uiUrl = (h: string) => `${HTTP(h)}/ui/`;
export const ptyUrl = (h: string, s: string) => `${WS(h)}/pty?session=${s}`;
export const logsUrl = (h: string, s: string) => `${WS(h)}/logs?session=${s}`;
export const foxgloveUrl = (h: string, s: string) =>
  `https://app.foxglove.dev/~/view?ds=foxglove-websocket&ds.url=${encodeURIComponent(
    `${WS(h)}/?session=${s}`,
  )}`;
export const wsShutdownUrl = (h: string, s: string) => `${HTTP(h)}/shutdown?session=${s}`;
export const layoutUrl = '/demos/nav-trial-layout.json';
