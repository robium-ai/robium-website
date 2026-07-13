# Demo Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An always-on Node/TS service that starts/stops/lists/limits demo sim containers on request, so the browser's Start actually spawns a container (no manual `make demo`) and Stop truly removes it.

**Architecture:** A standalone `demo-orchestrator/` Node package (Fastify HTTP API on :8080) with a demo registry and a `Driver` interface; `LocalDockerDriver` implements start/stop/list via dockerode against the existing nav-trial image. The frontend's Start calls the orchestrator to spawn an instance, gets back a `host`, then drives the unchanged per-sim gateway directly. Lifecycle-only: the orchestrator is never in the sim data path.

**Tech Stack:** Node 25, TypeScript, Fastify 5, dockerode 5, vitest 4, tsx 4.

## Global Constraints

- New package lives at `/Users/jazarium/repos/robium.org/demo-orchestrator/` (own package.json, tsconfig, tests). The site stays a separate Astro build.
- Naming (verbatim from spec): the service is the **demo-orchestrator**; it manages **demos** (registry entries) and **instances** (running containers); the browser then talks to each instance's **gateway** directly. Shared types live in `demo-orchestrator/src/types.ts` and are imported by the frontend.
- Orchestrator port: `8080` (dev). Base URL in the frontend: `http://localhost:8080` in dev.
- Lifecycle-only + direct-connect: orchestrator returns `{ id, host, session }`; the browser uses the existing `demoClient` against `host`. Orchestrator never proxies sim traffic.
- Budget enforced at start (`maxInstances` per demo → HTTP 429 when full).
- Scope is LOCAL (dockerode). The `Driver` interface is the seam a future `CloudRunDriver` implements — do not build the cloud driver.
- Registry seeds one demo: `nav-trial` → image `nav-trial:latest`, gateway port 8765, ready log `DEMO READY`, `maxInstances: 3`, `sessionSeconds: 1800`.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Orchestrator package scaffold + shared types

**Files:**
- Create: `demo-orchestrator/package.json`, `demo-orchestrator/tsconfig.json`, `demo-orchestrator/src/types.ts`, `demo-orchestrator/src/demos.json`, `demo-orchestrator/.gitignore`

**Interfaces:**
- Produces: `types.ts` exports `Demo`, `Instance`, `CreateInstanceReq`, `CreateInstanceRes` — the contract every later task and the frontend import.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "demo-orchestrator",
  "private": true,
  "type": "module",
  "version": "0.1.0",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "dockerode": "^5.0.1",
    "fastify": "^5.10.0"
  },
  "devDependencies": {
    "@types/dockerode": "^4.0.1",
    "@types/node": "^22",
    "tsx": "^4.23.1",
    "typescript": "^5.6",
    "vitest": "^4.1.10"
  }
}
```
(TypeScript pinned ^5.6 — 7.x is too new for the ecosystem; verify `npm i` resolves.)

- [ ] **Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: types.ts (the contract)**

```ts
export interface Demo {
  id: string;
  title: string;
  image: string;
  command: string[];
  gatewayPort: number;      // port the gateway listens on inside the container
  readyLog: string;         // substring in container logs meaning "booted"
  maxInstances: number;
  sessionSeconds: number;
  env?: Record<string, string>;
}

export interface Instance {
  id: string;               // orchestrator instance id (== container id short)
  demo: string;             // Demo.id
  session: string;          // visitor UUID
  host: string;             // where the browser reaches this sim's gateway, e.g. "localhost:32770"
  hostPort: number;
  createdAt: number;        // epoch ms
}

export interface CreateInstanceReq { demo: string; session: string; }
export interface CreateInstanceRes { id: string; host: string; session: string; }
```

- [ ] **Step 4: demos.json (registry, seeds nav-trial)**

```json
[
  {
    "id": "nav-trial",
    "title": "TurtleBot 3 autonomous navigation (ROS 2 + Nav2 + Gazebo)",
    "image": "nav-trial:latest",
    "command": ["/entrypoint.sh", "ros2", "launch", "nav_trial_bringup", "demo.launch.py"],
    "gatewayPort": 8765,
    "readyLog": "DEMO READY",
    "maxInstances": 3,
    "sessionSeconds": 1800,
    "env": { "GZ_RELAY": "127.0.0.1", "GZ_IP": "127.0.0.1", "FASTDDS_BUILTIN_TRANSPORTS": "UDPv4", "ROS_DOMAIN_ID": "42", "TURTLEBOT3_MODEL": "burger" }
  }
]
```

- [ ] **Step 5: .gitignore + install**

`.gitignore`: `node_modules/`. Run: `cd demo-orchestrator && npm install && npx tsc --noEmit`
Expected: install succeeds, typecheck clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/jazarium/repos/robium.org
git add demo-orchestrator && git commit -m "feat(orchestrator): package scaffold + shared types + registry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Registry loader (TDD)

**Files:**
- Create: `demo-orchestrator/src/registry.ts`, `demo-orchestrator/test/registry.test.ts`

**Interfaces:**
- Produces: `loadDemos(path?): Demo[]`, `getDemo(id): Demo | undefined`.

- [ ] **Step 1: Failing test**

`test/registry.test.ts`:
```ts
import { expect, test } from 'vitest';
import { loadDemos, getDemo } from '../src/registry.ts';

test('loads seeded nav-trial demo', () => {
  const demos = loadDemos();
  expect(demos.find((d) => d.id === 'nav-trial')).toBeTruthy();
});

test('getDemo returns undefined for unknown id', () => {
  expect(getDemo('nope')).toBeUndefined();
});

test('getDemo returns the nav-trial demo with its limit', () => {
  expect(getDemo('nav-trial')?.maxInstances).toBe(3);
});
```

- [ ] **Step 2: Run — fails (module missing)**

Run: `cd demo-orchestrator && npm test`
Expected: FAIL, cannot resolve `../src/registry.ts`.

- [ ] **Step 3: Implement registry.ts**

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Demo } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
let cache: Demo[] | null = null;

export function loadDemos(path = join(here, 'demos.json')): Demo[] {
  cache = JSON.parse(readFileSync(path, 'utf8')) as Demo[];
  return cache;
}

export function getDemo(id: string): Demo | undefined {
  return (cache ?? loadDemos()).find((d) => d.id === id);
}
```

- [ ] **Step 4: Run — passes**

Run: `npm test`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add demo-orchestrator && git commit -m "feat(orchestrator): registry loader

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Driver interface + LocalDockerDriver

**Files:**
- Create: `demo-orchestrator/src/driver.ts`, `demo-orchestrator/src/localDocker.ts`, `demo-orchestrator/test/localDocker.test.ts`

**Interfaces:**
- Consumes: `Demo`, `Instance` (types.ts).
- Produces: `interface Driver { start(demo, session): Promise<Instance>; stop(id): Promise<void>; list(): Promise<Instance[]>; }` and `class LocalDockerDriver implements Driver`. dockerode maps the container's `gatewayPort` to an ephemeral host port; `host` = `localhost:<hostPort>`.

- [ ] **Step 1: driver.ts (the interface)**

```ts
import type { Demo, Instance } from './types.ts';

export interface Driver {
  start(demo: Demo, session: string): Promise<Instance>;
  stop(id: string): Promise<void>;
  list(): Promise<Instance[]>;
}
```

- [ ] **Step 2: Failing integration test** (uses the real Docker + nav-trial image; skips if Docker absent)

`test/localDocker.test.ts`:
```ts
import { afterAll, expect, test } from 'vitest';
import Docker from 'dockerode';
import { LocalDockerDriver } from '../src/localDocker.ts';
import { getDemo } from '../src/registry.ts';

const docker = new Docker();
let available = false;
try { await docker.ping(); available = true; } catch { /* no docker */ }
const maybe = available ? test : test.skip;

const driver = new LocalDockerDriver();
let id = '';

maybe('start → list → stop round-trip', async () => {
  const demo = getDemo('nav-trial')!;
  const inst = await driver.start(demo, 'test-session');
  id = inst.id;
  expect(inst.host).toMatch(/^localhost:\d+$/);
  const running = await driver.list();
  expect(running.find((i) => i.id === id)).toBeTruthy();
  await driver.stop(id);
  const after = await driver.list();
  expect(after.find((i) => i.id === id)).toBeFalsy();
}, 60_000);

afterAll(async () => { if (id) await driver.stop(id).catch(() => {}); });
```

- [ ] **Step 3: Run — fails (module missing)**

Run: `npm test`
Expected: FAIL resolving `../src/localDocker.ts` (or the test skips if no Docker — then implement and run where Docker exists).

- [ ] **Step 4: Implement localDocker.ts**

```ts
import Docker from 'dockerode';
import type { Demo, Instance } from './types.ts';
import type { Driver } from './driver.ts';

const LABEL = 'robium.demo';           // marks our containers
const SESSION_LABEL = 'robium.session';
const DEMO_LABEL = 'robium.demoId';

export class LocalDockerDriver implements Driver {
  #docker = new Docker();

  async start(demo: Demo, session: string): Promise<Instance> {
    const container = await this.#docker.createContainer({
      Image: demo.image,
      Cmd: demo.command,
      Env: Object.entries(demo.env ?? {}).map(([k, v]) => `${k}=${v}`),
      Labels: { [LABEL]: '1', [DEMO_LABEL]: demo.id, [SESSION_LABEL]: session },
      ExposedPorts: { [`${demo.gatewayPort}/tcp`]: {} },
      HostConfig: {
        PublishAllPorts: false,
        PortBindings: { [`${demo.gatewayPort}/tcp`]: [{ HostPort: '' }] }, // '' = ephemeral
        AutoRemove: true,
      },
    });
    await container.start();
    const info = await container.inspect();
    const binding = info.NetworkSettings.Ports[`${demo.gatewayPort}/tcp`]?.[0];
    const hostPort = Number(binding?.HostPort);
    if (!hostPort) throw new Error('no host port allocated');
    return {
      id: info.Id.slice(0, 12),
      demo: demo.id,
      session,
      host: `localhost:${hostPort}`,
      hostPort,
      createdAt: Date.now(),
    };
  }

  async stop(id: string): Promise<void> {
    const c = this.#docker.getContainer(id);
    // SIGINT (not SIGTERM): PID 1 (ros2 launch) ignores SIGTERM (verified).
    await c.kill({ signal: 'SIGINT' }).catch(() => {});
    // AutoRemove cleans up; belt-and-suspenders:
    await c.remove({ force: true }).catch(() => {});
  }

  async list(): Promise<Instance[]> {
    const containers = await this.#docker.listContainers({
      filters: { label: [`${LABEL}=1`] },
    });
    return containers.map((c) => {
      const pub = c.Ports.find((p) => p.PublicPort)?.PublicPort ?? 0;
      return {
        id: c.Id.slice(0, 12),
        demo: c.Labels[DEMO_LABEL] ?? 'unknown',
        session: c.Labels[SESSION_LABEL] ?? '',
        host: `localhost:${pub}`,
        hostPort: pub,
        createdAt: c.Created * 1000,
      };
    });
  }
}
```
(`list()` derives the host port from `c.Ports`'s `PublicPort`.)

- [ ] **Step 5: Run — passes where Docker + nav-trial:latest exist**

Precondition: `nav-trial:latest` is built (`cd ~/repos/robium-applications/apps/nav-trial && make build` if needed).
Run: `cd demo-orchestrator && npm test`
Expected: round-trip test passes (starts a container, sees it in list, stops it). ~30–60 s.

- [ ] **Step 6: Commit**

```bash
git add demo-orchestrator && git commit -m "feat(orchestrator): Driver interface + LocalDockerDriver (dockerode)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Instance manager (budget + reaper)

**Files:**
- Create: `demo-orchestrator/src/manager.ts`, `demo-orchestrator/test/manager.test.ts`

**Interfaces:**
- Consumes: `Driver`, `getDemo`.
- Produces: `class Manager { constructor(driver: Driver); create(demoId, session): Promise<Instance>; remove(id): Promise<void>; list(): Promise<Instance[]>; }`. Enforces `maxInstances` (throws `BudgetError` when full); a periodic sweep stops instances older than `sessionSeconds`.

- [ ] **Step 1: Failing test with a fake driver**

`test/manager.test.ts`:
```ts
import { expect, test, vi } from 'vitest';
import { Manager, BudgetError } from '../src/manager.ts';
import type { Driver } from '../src/driver.ts';
import type { Demo, Instance } from '../src/types.ts';

function fakeDriver(): Driver {
  const store: Instance[] = [];
  let n = 0;
  return {
    async start(demo: Demo, session: string) {
      const inst = { id: `c${n++}`, demo: demo.id, session, host: `localhost:${9000 + n}`, hostPort: 9000 + n, createdAt: Date.now() };
      store.push(inst); return inst;
    },
    async stop(id: string) { const i = store.findIndex((x) => x.id === id); if (i >= 0) store.splice(i, 1); },
    async list() { return [...store]; },
  };
}

test('enforces maxInstances (nav-trial = 3)', async () => {
  const m = new Manager(fakeDriver());
  for (let i = 0; i < 3; i++) await m.create('nav-trial', `s${i}`);
  await expect(m.create('nav-trial', 's4')).rejects.toBeInstanceOf(BudgetError);
});

test('remove frees a slot', async () => {
  const m = new Manager(fakeDriver());
  const a = await m.create('nav-trial', 'a');
  await m.create('nav-trial', 'b');
  await m.create('nav-trial', 'c');
  await m.remove(a.id);
  await expect(m.create('nav-trial', 'd')).resolves.toBeTruthy();
});

test('unknown demo rejects', async () => {
  const m = new Manager(fakeDriver());
  await expect(m.create('nope', 's')).rejects.toThrow();
});
```

- [ ] **Step 2: Run — fails**

Run: `npm test`
Expected: FAIL resolving `../src/manager.ts`.

- [ ] **Step 3: Implement manager.ts**

```ts
import type { Driver } from './driver.ts';
import type { Instance } from './types.ts';
import { getDemo } from './registry.ts';

export class BudgetError extends Error {}

export class Manager {
  #driver: Driver;
  #sweeper?: ReturnType<typeof setInterval>;

  constructor(driver: Driver) {
    this.#driver = driver;
  }

  async create(demoId: string, session: string): Promise<Instance> {
    const demo = getDemo(demoId);
    if (!demo) throw new Error(`unknown demo: ${demoId}`);
    const running = (await this.#driver.list()).filter((i) => i.demo === demoId);
    if (running.length >= demo.maxInstances) {
      throw new BudgetError(`demo ${demoId} at capacity (${demo.maxInstances})`);
    }
    return this.#driver.start(demo, session);
  }

  remove(id: string): Promise<void> {
    return this.#driver.stop(id);
  }

  list(): Promise<Instance[]> {
    return this.#driver.list();
  }

  // Reap instances older than their demo's sessionSeconds.
  startReaper(intervalMs = 60_000): void {
    this.#sweeper = setInterval(async () => {
      const now = Date.now();
      for (const inst of await this.#driver.list()) {
        const demo = getDemo(inst.demo);
        if (demo && now - inst.createdAt > demo.sessionSeconds * 1000) {
          await this.#driver.stop(inst.id).catch(() => {});
        }
      }
    }, intervalMs);
  }

  stopReaper(): void { if (this.#sweeper) clearInterval(this.#sweeper); }
}
```

- [ ] **Step 4: Run — passes**

Run: `npm test`
Expected: manager tests pass (fake driver; no Docker needed).

- [ ] **Step 5: Commit**

```bash
git add demo-orchestrator && git commit -m "feat(orchestrator): instance manager — budget enforcement + reaper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Fastify HTTP API

**Files:**
- Create: `demo-orchestrator/src/server.ts`, `demo-orchestrator/test/api.test.ts`
- Modify: root `Makefile` (add `orchestrator` target) — create `/Users/jazarium/repos/robium.org/Makefile` if absent (the site has one).

**Interfaces:**
- Consumes: `Manager`, `LocalDockerDriver`, `loadDemos`.
- Produces: HTTP on :8080 — `GET /api/demos`, `GET /api/instances`, `POST /api/instances`, `DELETE /api/instances/:id`, `GET /health`. CORS allows localhost origins (dev) + `https://robium.org`.

- [ ] **Step 1: Failing API test (injects a fake driver via a factory)**

Refactor plan: `server.ts` exports `buildServer(manager)` (pure — testable with a fake) and a bottom `if (import.meta.main)` that wires the real `LocalDockerDriver`. Test uses Fastify's `.inject()`.

`test/api.test.ts`:
```ts
import { expect, test } from 'vitest';
import { buildServer } from '../src/server.ts';
import { Manager } from '../src/manager.ts';
import type { Driver } from '../src/driver.ts';

const fake: Driver = {
  async start(demo, session) { return { id: 'cX', demo: demo.id, session, host: 'localhost:9999', hostPort: 9999, createdAt: Date.now() }; },
  async stop() {},
  async list() { return []; },
};

test('GET /api/demos lists nav-trial', async () => {
  const app = buildServer(new Manager(fake));
  const r = await app.inject({ method: 'GET', url: '/api/demos' });
  expect(r.statusCode).toBe(200);
  expect(JSON.parse(r.body).some((d: any) => d.id === 'nav-trial')).toBe(true);
});

test('POST /api/instances creates and returns host', async () => {
  const app = buildServer(new Manager(fake));
  const r = await app.inject({ method: 'POST', url: '/api/instances', payload: { demo: 'nav-trial', session: 's1' } });
  expect(r.statusCode).toBe(201);
  expect(JSON.parse(r.body).host).toBe('localhost:9999');
});

test('POST unknown demo → 404', async () => {
  const app = buildServer(new Manager(fake));
  const r = await app.inject({ method: 'POST', url: '/api/instances', payload: { demo: 'nope', session: 's' } });
  expect(r.statusCode).toBe(404);
});
```

- [ ] **Step 2: Run — fails**

Run: `npm test`
Expected: FAIL resolving `../src/server.ts`.

- [ ] **Step 3: Implement server.ts**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { Manager, BudgetError } from './manager.ts';
import { LocalDockerDriver } from './localDocker.ts';
import { loadDemos } from './registry.ts';
import type { CreateInstanceReq } from './types.ts';

export function buildServer(manager: Manager): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin ?? '';
    if (origin === 'https://robium.org' || /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-credentials', 'true');
      reply.header('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
      reply.header('access-control-allow-headers', 'content-type');
    }
  });
  app.options('/*', async (_req, reply) => reply.code(204).send());

  app.get('/health', async () => ({ ok: true }));

  app.get('/api/demos', async () =>
    loadDemos().map((d) => ({ id: d.id, title: d.title, maxInstances: d.maxInstances })));

  app.get('/api/instances', async () => manager.list());

  app.post('/api/instances', async (req, reply) => {
    const { demo, session } = (req.body ?? {}) as CreateInstanceReq;
    if (!demo || !session) return reply.code(400).send({ error: 'demo and session required' });
    try {
      const inst = await manager.create(demo, session);
      return reply.code(201).send({ id: inst.id, host: inst.host, session: inst.session });
    } catch (e) {
      if (e instanceof BudgetError) return reply.code(429).send({ error: String(e.message) });
      if (String((e as Error).message).startsWith('unknown demo')) return reply.code(404).send({ error: String((e as Error).message) });
      return reply.code(500).send({ error: String((e as Error).message) });
    }
  });

  app.delete('/api/instances/:id', async (req, reply) => {
    await manager.remove((req.params as { id: string }).id);
    return reply.code(204).send();
  });

  return app;
}

if (import.meta.main) {
  const manager = new Manager(new LocalDockerDriver());
  manager.startReaper();
  const app = buildServer(manager);
  app.listen({ port: 8080, host: '0.0.0.0' })
    .then(() => console.log('demo-orchestrator on :8080'))
    .catch((e) => { console.error(e); process.exit(1); });
}
```
(If `import.meta.main` is unavailable on the Node version, use `if (process.argv[1] === fileURLToPath(import.meta.url))`.)

- [ ] **Step 4: Run — passes**

Run: `npm test`
Expected: all API tests pass.

- [ ] **Step 5: Makefile target + live check**

Add to `/Users/jazarium/repos/robium.org/Makefile`:
```makefile
orchestrator:
	cd demo-orchestrator && npm run start
```
Run (Docker up, nav-trial:latest built): `cd demo-orchestrator && (npm start &) ; sleep 3 ; curl -s localhost:8080/api/demos`
Expected: JSON listing nav-trial. Stop the bg process after.

- [ ] **Step 6: Commit**

```bash
git add demo-orchestrator Makefile && git commit -m "feat(orchestrator): Fastify API (demos, instances CRUD, CORS) + make target

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Full-stack live test (orchestrator spawns a real sim)

**Files:**
- Create: `demo-orchestrator/scripts/e2e.sh`

- [ ] **Step 1: Write e2e.sh**

```bash
#!/usr/bin/env bash
# Orchestrator E2E: from zero containers, create an instance via the API,
# reach the spawned sim's gateway, then delete it. Requires Docker + nav-trial:latest.
set -euo pipefail
BASE=http://localhost:8080
S=e2e-$RANDOM
echo "create:"
RES=$(curl -s -X POST "$BASE/api/instances" -H 'content-type: application/json' -d "{\"demo\":\"nav-trial\",\"session\":\"$S\"}")
echo "$RES"
HOST=$(echo "$RES" | python3 -c "import json,sys;print(json.load(sys.stdin)['host'])")
ID=$(echo "$RES" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
echo "spawned $ID at $HOST — waiting for gateway ready…"
n=0; until curl -s "http://$HOST/status?session=$S" | grep -q '"ready": true'; do n=$((n+1)); [ $n -ge 40 ] && echo "READY TIMEOUT" && break; sleep 5; done
curl -s "http://$HOST/status?session=$S" | python3 -c "import json,sys;d=json.load(sys.stdin);print('ready:',d['ready'],'rtf:',d['rtf'])"
echo "in fleet list:"; curl -s "$BASE/api/instances" | grep -q "$ID" && echo YES
echo "delete:"; curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/api/instances/$ID"
sleep 3; docker ps --filter "label=robium.demo=1" --format '{{.ID}}' | grep -q "${ID:0:12}" && echo "STILL RUNNING (bad)" || echo "gone (good)"
```

- [ ] **Step 2: Run it** (orchestrator running, Docker up, nav-trial:latest built)

Run: `chmod +x demo-orchestrator/scripts/e2e.sh && bash demo-orchestrator/scripts/e2e.sh`
Expected: create returns host, gateway reaches `ready: true rtf ~1`, appears in fleet, delete → 204 → container gone. This proves the whole lifecycle with no manual `make demo`.

- [ ] **Step 3: Commit**

```bash
git add demo-orchestrator/scripts/e2e.sh && git commit -m "test(orchestrator): full lifecycle E2E (spawn → ready → list → delete)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — Start/Stop via the orchestrator

**Files:**
- Create: `robium.org/src/lib/orchestrator.ts`
- Modify: `robium.org/src/components/demo/Workspace.tsx`, `robium.org/tests/smoke.sh`

**Interfaces:**
- Consumes: orchestrator API (:8080), existing `demoClient` (drives the sim `host`).
- Produces: Start now spawns a real container; Stop removes it.

- [ ] **Step 1: orchestrator.ts client**

```ts
const ORCH = 'http://localhost:8080';  // dev; cloud value set when that spec lands
const opts: RequestInit = { credentials: 'include' };

export interface CreatedInstance { id: string; host: string; session: string; }

export async function createInstance(demo: string, session: string): Promise<CreatedInstance> {
  const r = await fetch(`${ORCH}/api/instances`, {
    ...opts, method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ demo, session }),
  });
  if (r.status === 429) throw new Error('All demo robots are busy — try again in a few minutes.');
  if (!r.ok) throw new Error(`orchestrator ${r.status}`);
  return r.json();
}

export async function deleteInstance(id: string): Promise<void> {
  await fetch(`${ORCH}/api/instances/${id}`, { ...opts, method: 'DELETE' }).catch(() => {});
}
```

- [ ] **Step 2: Rewire Workspace start()/stop()**

In `Workspace.tsx`: keep the `host` state (now set from the orchestrator's response, not a switcher default). Add an `instanceId` ref.

```tsx
import { createInstance, deleteInstance } from '../../lib/orchestrator';
// …
const instanceRef = useRef<string | null>(null);

async function start() {
  const s = crypto.randomUUID();
  sessionRef.current = s; setSession(s); setSt(null); setTab('logs');
  try {
    const inst = await createInstance('nav-trial', s);   // spawns the container
    instanceRef.current = inst.id;
    setHostState(inst.host);                              // browser now targets this sim
  } catch (e) {
    setSt(null); setSession(null); sessionRef.current = null;
    alert((e as Error).message); return;
  }
  stopPolling();
  timer.current = window.setInterval(poll, 2000);
  poll();
}

async function stop() {
  stopPolling();
  const id = instanceRef.current;
  instanceRef.current = null;
  sessionRef.current = null;
  setSession(null); setSt(null); setFile(null); setTab('about');
  if (id) await deleteInstance(id);   // real teardown, local + cloud
}
```
Update `pagehide` to `deleteInstance(instanceRef.current)` via `sendBeacon` to `${ORCH}/api/instances/:id` (DELETE isn't beacon-able → use a `fetch(..., {keepalive:true, method:'DELETE'})`).
Remove the localhost special-casing in stop/pagehide (the orchestrator now owns teardown uniformly).

- [ ] **Step 3: Keep the dev switcher as a bypass**

The `?host=` override + switcher stay, but relabel the switcher: `orchestrator (spawns)` (default, host comes from the API) vs `direct localhost:8765` (talk to a hand-started container, bypassing the orchestrator). When "direct" is chosen, Start skips `createInstance` and just claims (current behavior).

- [ ] **Step 4: Build + smoke**

Run: `cd /Users/jazarium/repos/robium.org && npm run build && make smoke 2>&1 | tail -4`
Expected: build ok; smoke checks pass (island present, orchestrator client referenced). Update `tests/smoke.sh`'s demo block to also assert `grep -rq "api/instances" dist/_astro/` → "ok: orchestrator wired".

- [ ] **Step 5: Manual E2E** (orchestrator + Docker running, no pre-started container)

`make orchestrator` in one terminal; `npm run dev` in another; open `http://localhost:4322/demos/nav-trial`. Start → confirm a container is spawned (it wasn't running before), reaches ready, drive; Stop → container removed (`docker ps` empty); Start again → a fresh container. Report results.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: demo Start/Stop go through the orchestrator (real spawn/teardown, no manual make demo)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push
```

---

### Task 8: Docs + skill note

**Files:**
- Modify: `robium.org/DEVELOPING.md`, `robium.org/docs/BACKLOG.md`
- Create: `robium-applications/learnings/2026-07-13.md` (append if exists)

- [ ] **Step 1: DEVELOPING.md** — replace the "run make demo by hand" local instructions with the orchestrator flow: `make orchestrator` (once) + `npm run dev`; Start now spawns containers; the `direct localhost:8765` switcher option documented as the bypass for gateway-only work.

- [ ] **Step 2: BACKLOG.md** — add: "Cloud driver for the orchestrator (CloudRunDriver behind the same Driver interface) + the govern-vs-own decision (deferred spec 2026-07-13-demo-orchestrator, scope note)."

- [ ] **Step 3: learnings** — append a `[live-demo]` note: the gateway-in-container can't self-manage lifecycle; a host-level orchestrator (Node/TS, dockerode) is the missing control plane locally, mirroring Cloud Run's role in prod — candidate content for the live-demo skill's architecture reference.

- [ ] **Step 4: Commit both repos**

```bash
cd /Users/jazarium/repos/robium.org && git add DEVELOPING.md docs/BACKLOG.md && git commit -m "docs: orchestrator dev flow + backlog" && git push
cd /Users/jazarium/repos/robium-applications && git add learnings && git commit -m "learnings: orchestrator pattern for live-demo skill" && git push
```
