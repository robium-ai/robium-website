# Demo orchestrator — design

**Date:** 2026-07-13 · **Status:** approved (brainstorming)
**Becomes part of:** the robium `live-demo` skill (new reference + example).

## Purpose

An always-on **web-tier backend service** for robium.org that owns simulator
instance *lifecycle* across all demos: start a demo's container on request,
stop it, list what's running, enforce a concurrency budget, and expose a
registry of available demos. It fills the role Cloud Run's orchestrator
plays in prod but which is missing locally — the browser can't start
containers, and we don't want every demo's container running idle.

This is robium.org's first backend tier. It is **not** the per-sim gateway
(that stays inside each container, unchanged) — the orchestrator manages
lifecycle and then steps out of the data path.

## Scope (this spec = LOCAL only)

Per the brainstorm: build the orchestrator for the **local (Docker)**
backend first, behind a clean API. The **cloud model is deferred** — a
later spec decides how much of Cloud Run's autoscaling the orchestrator
replaces vs governs. The API and registry designed here are the seam a
cloud backend implements later.

## Decisions (from brainstorming)

1. **Standalone service**, not an extension of the in-container gateway
   (that's the chicken-and-egg we're escaping).
2. **Node / TypeScript** — web-tier service consistent with the React/TS
   frontend (shared types) and the team's React+Node pattern. The Python
   gateway stays Python (different, container-scoped layer).
3. **Lifecycle-only + direct connect** — the orchestrator starts/stops/
   lists/limits and returns a connect address; the **browser talks to the
   spawned sim's gateway directly** (Foxglove tunnel, PTY, files, status all
   unchanged). The orchestrator is never in the data path. Budget is
   enforced at *start* time.

## Architecture

```
browser (robium.org/demos/<demo>)
   │  1. GET  /api/demos                → list available demos
   │  2. POST /api/instances {demo}     → orchestrator spawns container,
   │                                       returns { id, host, session }
   │  3. …talks DIRECTLY to that sim's gateway at `host` for
   │      status / logs / pty / fs / foxglove tunnel (unchanged) …
   │  4. DELETE /api/instances/:id      → orchestrator stops the container
   ▼
orchestrator (Node/TS, host process, port 8080)   ← the new tier
   ├── registry: demos.json (each demo → image/compose, ports, limits)
   ├── driver interface: LocalDockerDriver (this spec) | CloudRunDriver (later)
   └── LocalDockerDriver → dockerode → start/stop/inspect containers
         each instance: a container on an allocated host port (e.g. 8766+n)
         running the SAME demo image + gateway we already build
```

## Components

- **Registry** (`demo-orchestrator/demos.json`): declares each demo. Fields:
  `id`, `title`, `image` (or `composeFile`+`service`), `command`,
  `internalPort` (gateway port, 8765), `readyLog` (`"DEMO READY"`),
  `maxInstances`, `sessionSeconds`. nav-trial is the first entry.
- **Driver interface** (`Driver`): `start(demo) → {id, host, port}`,
  `stop(id)`, `list() → Instance[]`, `inspect(id)`. `LocalDockerDriver`
  implements it via dockerode; `CloudRunDriver` is a later stub.
- **HTTP API** (Node/TS, e.g. Fastify — small, fast, first-class TS):
  - `GET /api/demos` → registry (id, title, maxInstances).
  - `GET /api/instances` → running instances across demos (fleet view:
    id, demo, host, uptime, session).
  - `POST /api/instances` `{demo, session}` → enforce `maxInstances`
    (429 if full) → driver.start → 201 `{id, host, session}`.
  - `GET /api/instances/:id` → one instance's lifecycle status (up/booting;
    NOT the sim's ROS status — that's the gateway's `/status`).
  - `DELETE /api/instances/:id` → driver.stop → 204.
- **Shared types** (`demo-orchestrator/types.ts`, imported by the frontend):
  `Demo`, `Instance`, request/response shapes — one source of truth.

## Instance readiness

The orchestrator reports only *container* lifecycle (created/running/exited)
— it does NOT proxy or interpret ROS readiness. The browser, once it has the
`host`, polls the sim's gateway `/status` directly for `ready`/rtf/log (all
as today). Clean seam: orchestrator = "is the box up?", gateway = "is the
robot ready?".

## Frontend changes

- New client `src/lib/orchestrator.ts` (typed, shares `demo-orchestrator/types`):
  `listDemos()`, `createInstance(demo, session)`, `deleteInstance(id)`.
- `Workspace.tsx`: **Start** → `createInstance('nav-trial', session)` →
  receive `{host, session}` → then drive the existing `demoClient` against
  that `host` (all the pane logic is unchanged — it already takes a `host`).
  **Stop** → `deleteInstance(id)` (real stop, everywhere — no more
  local-special-casing; the container genuinely goes away and the orchestrator
  plane can spawn a fresh one on the next Start).
- The dev `?host=`/switcher stays as an escape hatch (talk to a hand-started
  container directly, bypassing the orchestrator) but the default path is
  the orchestrator.
- Orchestrator base URL: `http://localhost:8080` in dev; the deployed value
  is set when the cloud spec lands (env/build-time).

## Config / running

- `demo-orchestrator/` package (its own package.json, TS, `npm run dev` /
  `npm start`). A root `make demo-orchestrator` alias just runs it — the service
  is a long-lived process on port 8080, not a per-request thing.
- Needs Docker socket access (mounts `/var/run/docker.sock` conceptually —
  here it runs on the host with Docker available).

## Testing / done bar

- Unit: registry parse; `maxInstances` enforcement (Nth+1 → 429);
  LocalDockerDriver start→list→stop round-trip against the real nav-trial
  image (a smoke test that spins one up, asserts it appears in `/api/instances`
  and its gateway `/status` eventually reports ready, then stops it).
- E2E: from a fresh state (no containers), the browser Start spawns a
  container (no manual `make demo`), reaches ready, drives; Stop removes it;
  a second Start spawns a *new* one; the (N+1)th concurrent Start is refused
  with a "budget full" message.
- The existing per-sim `demo-smoke` (gateway) is unchanged and still gates
  the container itself.

## Open risks

1. **Port allocation & collisions** — the driver must pick a free host port
   per instance and map the gateway's 8765; track the mapping in the
   instance record. Bound by `maxInstances`.
2. **Orphan cleanup** — a session that never calls DELETE (tab crash) leaves
   a container; the orchestrator reaps instances past `sessionSeconds`
   (a periodic sweep), mirroring the 30-min cap.
3. **Docker socket = root-equivalent** — fine for a local dev service on
   your machine; the cloud driver will NOT use Docker (it'll use the Cloud
   Run API), so this risk doesn't propagate to prod.
4. **Same-origin/CORS** — the browser now calls two backends (orchestrator
   :8080 + the sim gateway). Both need the localhost-CORS treatment already
   established for the gateway.
5. **Frontend two-step Start** — Start is now create-instance → then
   poll-gateway; the UI must handle "instance created but sim still booting"
   (it already has a booting state).

## Out of scope (later specs)

Cloud driver (CloudRunDriver + the govern-vs-own decision), auth/rate-limit
for a public orchestrator, per-user quotas, a management dashboard UI,
multi-demo registry beyond nav-trial (the registry supports it; we seed one).
