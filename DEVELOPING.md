# Developing the demo — the fast loop

**Don't redeploy to iterate.** Cloud Build + deploy is ~8 min; use it only to
ship or to test cloud-only behavior (egress, session affinity, cold start).
Day-to-day, use one of these:

## Frontend only (most changes) — instant HMR, no backend rebuild

Edit anything under `src/components/demo/` or `src/lib/demoClient.ts` and see
it live in milliseconds:

```bash
cd ~/repos/robium.org
npm run dev
# open: http://localhost:4321/demos/nav-trial?host=demo.robium.org
```

The `?host=` query param points the whole workspace at a backend of your
choice. `demo.robium.org` uses the already-deployed prod gateway — zero
backend work. (The prod gateway's CORS allows `http://localhost:*`, so
credentialed fetches from the dev server work.)

## Full local via the orchestrator (recommended) — Start spawns containers for you

Run the **demo-orchestrator** once; then the page's Start actually spawns a
sim container per session (no manual `make demo`), and Stop removes it —
mirroring how Cloud Run spins instances up/down in prod.

```bash
cd ~/repos/robium.org && npm run dev
# starts BOTH: the Astro site (:4321) and the orchestrator (:8080), labelled
# [site]/[orch]; Ctrl-C stops both. (Needs Docker up + nav-trial:latest built
# once via `make build` in apps/nav-trial.)
# open: http://localhost:4321/demos/nav-trial   (switcher = "orchestrator (spawns)")
```

Run just one side if needed: `npm run dev:site` or `npm run dev:orch`
(`make orchestrator` also still starts the orchestrator alone).

Start → a fresh container is created on an ephemeral port; Stop → it's
removed; Start again → a new one. The orchestrator enforces the per-demo
budget (`demo-orchestrator/src/demos.json`, nav-trial = 3) and reaps
sessions past 30 min. Registry, driver, and API tests: `cd demo-orchestrator
&& npm test`; full lifecycle: `bash demo-orchestrator/scripts/e2e.sh`.

## Direct-to-container bypass — gateway-only work, no orchestrator

Sometimes you're iterating on the *gateway itself* and want to talk to one
hand-started container directly. Switch the dev backend selector to
`direct localhost:8765` (or use `?host=localhost:8765`), and run the container
yourself:

```bash
# terminal 1 — local demo backend (bind-mounts scripts/, so gateway edits
# are a restart, not an image rebuild):
cd ~/repos/robium-applications/apps/nav-trial
make demo                     # first run builds the image once (~7 min)

# terminal 2 — frontend:
cd ~/repos/robium.org
npm run dev
# open: http://localhost:4321/demos/nav-trial?host=localhost:8765
```

Edit `apps/nav-trial/scripts/demo_gateway.py`, then in another terminal:

```bash
cd ~/repos/robium-applications/apps/nav-trial
docker compose -f docker/compose.yaml restart demo   # seconds
```

The gateway change is live — no image rebuild (the ROS image only needs
rebuilding when apt deps or the ROS package build change).

Note: locally the demo boots reliably (gz discovery race is a Cloud-Run
multicast quirk, not a local one), so `localhost:8765` is the quickest way
to iterate on backend + frontend together.

## When you DO need to deploy

- Backend/gateway change to ship: `make demo-image && make demo-deploy`
  (from `apps/nav-trial`).
- Frontend change to ship: `make image && make deploy` (from `robium.org`).
- Test cloud-only behavior (egress lockdown, affinity, cold start): deploy,
  then use `?host=demo.robium.org` against the real service.
