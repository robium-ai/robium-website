# robium-website backlog

Deferred-but-tracked items. Newest on top.

## vla-trial demo (shipped local-only 2026-07-15)

- **[feature] Cloud hosting for /demos/vla-trial** — v1 is deliberately
  local-only (the page shows a "run it locally" notice off-localhost). Needs:
  the cloud driver below, a registry/deploy for `vla-trial:latest` (5.2 GB,
  CPU inference ~9 s/forward-pass — decide instance size and whether that UX
  is acceptable, or wait for the 20k-step checkpoint + GPU story), and
  liveness-based claims in the gateway (locally /start always takes over and
  aborts the in-flight run — fine for one visitor, stealable in public; see
  apps/vla-trial `demo/gateway.py` in robium-applications).
- **[feature] "Watch it learn" checkpoint switcher** — the third `base`
  controller and checkpoint comparison land once `make train-full` (~$20-40)
  produces a checkpoint that actually succeeds; the demo currently states
  honestly that the trained policy flails.
- **[ux] Run history in the viewer** — per-run Rerun recording ids fixed the
  frozen-viewer bug but replace the previous run; a recording picker would
  let visitors flip between episodes.

## Demo orchestrator

- **[feature] Cloud driver** — `CloudRunDriver` behind the same `Driver`
  interface (start/stop/list via the Cloud Run Admin API), plus the deferred
  govern-vs-own decision from `docs/superpowers/specs/2026-07-13-demo-orchestrator-design.md`.
  The local orchestrator + registry + frontend are done and driver-agnostic;
  this is the remaining half.
- **[ops] Orchestrator hosting** — the local orchestrator runs on the dev
  machine; the deployed robium.ai needs a hosted orchestrator (or the cloud
  path bypasses it and talks to a per-demo Cloud Run service). Decide with the
  cloud driver.

## Demo v4 (IDE workspace)

- **[security] Verify the demo egress lockdown end-to-end.** The protections
  ARE deployed (demo-nav-trial runs as zero-IAM-role SA `demo-nav-trial-sa`,
  and `--network=demo-net --vpc-egress=all-traffic` with a deny-all egress
  firewall). What's NOT yet proven is that a shell inside the container
  genuinely cannot reach the internet. Gate: `tests/pty_probe.py
  demo.robium.ai <session> --expect-egress-blocked` must print
  `PTY OK + EGRESS BLOCKED`. Blocked on the gz-discovery boot race making a
  clean ready-state slow to reach for the probe. **Do before publicizing the
  demo widely** — a public interactive shell WITH internet egress is abusable
  (crypto-mining, DDoS relay). Until verified, treat the shell as
  "protections deployed, unproven."
- **[reliability] gz-transport discovery boot race on Cloud Run** — ~50% of
  boots lose the unicast-relay race; the watchdog restarts the instance, but
  it adds visible boot latency (up to a few minutes with retries). Warm-pool
  or a deterministic-discovery fix would make demos snappy. See
  learnings/2026-07-12.md.
- **[feature] Live fleet count** — disabled in v4 (zero-perm SA can't query
  Monitoring). Restore via a small separately-permissioned endpoint; the
  frontend contract (`fleet.running`) already tolerates the live number.
- **[feature] Embedded viewer in the Viewer tab** — slot reserved; self-hosted
  Lichtblick (built, at /viewer/) can fill it later for a no-new-tab flow.
