# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The public face of the **robium** Claude Code plugin: an Astro 6 static landing
site plus the **live demo infrastructure** that lets a visitor drive a real
robot sim in the browser.

## Brand & domain (canonical: robium.ai)

**robium.ai is the canonical domain and the name to advertise everywhere.** We
own all three of robium.ai, robium.org, and robium.dev — but .org and .dev exist
only to protect the name and 301-redirect to robium.ai. Never advertise, brand,
or link to .org/.dev as the primary; always use robium.ai. The site serves
robium.ai (nginx `default_server`); .org/.dev + all `www.` variants redirect to
it. The live-demo gateway is same-site at **demo.robium.ai** (it MUST share
robium.ai's registrable domain, or the `SameSite=Lax` affinity cookie breaks).
This repo is **robium-website** (GitHub `jazarium/robium-website`, local
`~/repos/robium-website`), renamed from robium.org; old URLs redirect. The
domain it serves is robium.ai — repo name and domain are intentionally
different. Two products in one repo — the site (`src/`) and the demo stack
(`demo-orchestrator/` + the per-demo backends, which live in the
`robium-applications` repo).

**The content rule (load-bearing):** everything on the site is real. The hero
terminal is a condensed transcript from an actual build, the skill grid is
generated from the robium-plugin repo at build time, and the proof section shows a
real policy-evaluation rollout. Never invent a metric, a transcript line, or a
skill count to fill space — pull it from an actual run or leave it out.

## Sibling repos — anchor the session in the repo that owns the output

Three repos are worked on together under `~/repos/`: **robium-plugin** (the
plugin's skills), **robium-applications** (apps + the demo *backends*), and
**robium-website** (this one; serves robium.ai, renamed from robium.org).
`.claude/settings.json` puts the other two on `additionalDirectories`,
so they are readable/writable from here — but **launch Claude in the repo whose
output you are producing**: the launch directory selects which CLAUDE.md rules load
and which repo git status tracks.

Anchor here for the site and the orchestrator. Anchor in `robium-applications` for
anything inside a demo container (`apps/nav-trial/scripts/demo_gateway.py`, its
compose file, its image). Anchor in `robium-plugin` to edit skills — writes to
`robium-plugin/skills/**` from here are gated behind an `ask` rule on purpose.

## Commands

```bash
npm run dev      # site (:4321) + orchestrator (:8080) together, via concurrently
npm run dev:site # Astro only
npm run dev:orch # orchestrator only

make smoke       # THE DONE BAR: build + tests/smoke.sh content assertions
make docker-smoke # same, against the container on :8080

make image       # Cloud Build → Artifact Registry
make deploy      # → Cloud Run service robium-site (project robium-prod)
```

`tests/smoke.sh` greps the built HTML for every load-bearing section (hero
headline, real transcript, install command, proof video, demo workspace island,
layout file). It asserts on **literal strings from real runs** — if you change
a number on the page, the smoke test is where it's pinned.

Orchestrator tests: `cd demo-orchestrator && npm test`; full lifecycle:
`bash demo-orchestrator/scripts/e2e.sh`.

## Architecture

- `src/` — Astro 6, Dark/Aurora theme. The landing page ships **no framework**
  and only a sliver of vanilla JS (the stat counters' IntersectionObserver in
  `SkillsGrid.astro`); the old "zero client-side JS" rule was dropped in favour
  of the scroll-triggered count-up. Keep it that way: plain `<script>` in the
  component that needs it, never a framework import. React islands exist only
  for the demo workspace (`src/components/demo/`).
- `scripts/fetch-skills.mjs` — regenerates the skill catalog at build time from
  `~/repos/robium-plugin` (override with `ROBIUM_DIR=`), falling back to the GitHub API,
  then to the committed `src/data/skills.json`. The site never hand-maintains
  the skill list.
- `demo-orchestrator/` — Node/TS + Fastify + dockerode. The **lifecycle** service:
  owns start/stop/list/budget across demos and hands the browser a per-instance
  connect host. A `Driver` interface separates `LocalDockerDriver` (today) from a
  future `CloudRunDriver`; `src/demos.json` holds per-demo instance budgets
  (nav-trial = 3), and a reaper kills sessions past 30 min.
- **The gateway-vs-orchestrator split is the core design fact.** The orchestrator
  is lifecycle-only and never sits in the data path; once started, the browser
  talks *directly* to that instance's in-container gateway (Foxglove bridge ws,
  PTY-over-ws shell, logs, fs API). The gateway cannot manage its own lifecycle —
  it dies with the container it would need to restart — which is exactly why the
  orchestrator exists.
- Demo **backends** live in the sibling `robium-applications` repo
  (`apps/<name>/scripts/demo_gateway.py`, its compose file, its `make demo-*`
  targets). This repo owns the frontend and the lifecycle; that repo owns what
  runs inside the container.

## Working on the demo — don't redeploy to iterate

Cloud Build + deploy is ~8 minutes. Reach for it only to ship, or to test
cloud-only behavior (egress lockdown, session affinity, cold start). `DEVELOPING.md`
is the authority here; the three loops in short:

1. **Frontend only** — `npm run dev`, then `?host=demo.robium.ai` points the
   workspace at the already-deployed prod gateway. Instant HMR, zero backend work.
2. **Full local** (recommended) — `npm run dev` runs the orchestrator too, so the
   page's Start really spawns a container and Stop really removes it. Needs Docker
   up and `nav-trial:latest` built once.
3. **Gateway iteration** — run one container by hand (`make demo` in
   `apps/nav-trial`), point at `?host=localhost:8765`. The compose file bind-mounts
   `scripts/`, so a gateway edit is a `docker compose restart demo` (seconds), not
   an image rebuild.

Locally the sim boots reliably; the gz-discovery boot race is a Cloud Run
multicast quirk, not a local one.

## Cloud Run facts that bite (all learned the hard way)

- **gz-transport discovery uses UDP multicast**, which Cloud Run doesn't have.
  `GZ_RELAY=127.0.0.1` + `GZ_IP=127.0.0.1` (unicast relay) is what makes the sim
  boot at all — and it's a sticky per-boot race (~50% loss rate), which the
  in-container watchdog papers over by restarting the instance.
- **CPU is allocated only while a request is open.** A health probe that connects
  and drops leaves the container throttled mid-boot, which looks exactly like a
  hang. Probes must hold the socket.
- **The demo shell is a public interactive shell.** It is defensible only because
  of two deployed protections: a zero-IAM-role service account (`demo-nav-trial-sa`)
  and deny-all VPC egress. See `docs/BACKLOG.md` — the egress lockdown is deployed
  but **not yet verified end-to-end**. Treat it as "protections deployed, unproven,"
  and do not widen the demo's audience until `PTY OK + EGRESS BLOCKED` passes.

## Backlog

`docs/BACKLOG.md` is the tracker for deferred work (cloud driver, orchestrator
hosting, the egress verification, the gz boot race). Keep it current — an item
that gets deferred goes there rather than into a code comment.
