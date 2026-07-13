// Client for the demo-orchestrator (lifecycle: spawn/stop sim instances).
// Dev default :8080; the deployed value is set when the cloud spec lands.
const ORCH = 'http://localhost:8080';
const opts: RequestInit = { credentials: 'include' };

export interface CreatedInstance {
  id: string;
  host: string;
  session: string;
}

export async function createInstance(demo: string, session: string): Promise<CreatedInstance> {
  const r = await fetch(`${ORCH}/api/instances`, {
    ...opts,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ demo, session }),
  });
  if (r.status === 429) throw new Error('All demo robots are busy — try again in a few minutes.');
  if (!r.ok) throw new Error(`orchestrator returned ${r.status}`);
  return r.json();
}

export async function deleteInstance(id: string): Promise<void> {
  await fetch(`${ORCH}/api/instances/${id}`, { ...opts, method: 'DELETE' }).catch(() => {});
}

// keepalive DELETE for tab-close (sendBeacon can't do DELETE).
export function deleteInstanceBeacon(id: string): void {
  fetch(`${ORCH}/api/instances/${id}`, { ...opts, method: 'DELETE', keepalive: true }).catch(() => {});
}
