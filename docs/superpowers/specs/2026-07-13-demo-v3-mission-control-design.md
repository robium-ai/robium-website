# nav-trial demo v3 — mission-control page — design

**Date:** 2026-07-13 · **Status:** approved (user-specified rework of v2)

## Decision record

v2's embedded Lichtblick iframe is retired (integration friction + didn't
match the desired experience — user decision). The self-hosted viewer stays
built and served at /viewer/ for future use, but the demo flow returns to
**app.foxglove.dev in a new tab** (login + one-time manual layout import
accepted). The demo page becomes a **mission-control panel**: explicit
lifecycle buttons and a terminal-dominant layout.

## Requirements (user-stated)

1. Explicit **Start instance** / **Stop instance** buttons; tab close
   auto-stops the instance; a visitor gets exactly one instance.
2. Show instances currently running + the budget (5).
3. After Start, boot status streams in a terminal window that dominates
   the page.
4. Once the sim is verified running, an **Open in Foxglove** button
   (enabled only when ready) opens app.foxglove.dev in a new tab,
   pre-connected to the visitor's wss URL; layout via the v1 flow
   (download `nav-trial-layout.json` + Layout→Import; import is manual —
   app.foxglove.dev cannot preload third-party layouts for anonymous
   visitors, verified).

## Changes

**Gateway (nav-trial):**
- `POST /start?session=U` — claims the instance for U (idle-claim takeover
  semantics as shipped; live-tunnel or actively-claimed-by-other → 503
  busy). Start of the session clock.
- `/status` gains `"fleet": {"running": N|null, "budget": 5}` — N from a
  Cloud Monitoring `run.googleapis.com/container/instance_count` query
  (metadata-server token; result cached 30 s; null on error/local runs).
  Requires `roles/monitoring.viewer` on the runtime service account.
- WebSocket claim path unchanged (viewer connects later with the same U).

**Cloud Run:** add `--no-cpu-throttling` — with start-before-view there is
no held browser connection during boot, and request-based billing would
freeze the sim between polls. Cost note (user-accepted): scale-to-zero
stays; idle-retention after a session ≈ $0.20–0.40.

**Page (robium.org/demos/nav-trial):** iframe removed. Layout: controls
row (pill · Start · Stop · Open in Foxglove · layout download) above a
terminal that dominates the viewport; fleet line "robots running N of 5"
live during a session, static "budget: 5" before. Poll loop runs only
between Start and Stop; auto re-claims (`/start` retry) if a watchdog
restart produces a fresh unclaimed instance; `pagehide` beacon retained.
No fleet fetch before Start (a page-load fetch would cold-boot a billable
instance per drive-by visit).

## Out of scope

Self-hosted viewer flow (deferred, assets retained), manip-trial demo,
warm pool.
