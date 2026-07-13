# nav-trial demo v4 — full-bleed IDE workspace — design

**Date:** 2026-07-13 · **Status:** approved (brainstorming)
**Supersedes:** v3 mission-control page (its lifecycle/gateway carry forward)

## Purpose

Give visitors a hands-on "look under the hood" of a running robium app with
minimum friction: a full-viewport IDE workspace (thin robium top bar + three
panes) where they start/stop a private simulator, watch it boot, browse and
edit the actual source files, run real shell commands, and open the robot in
Foxglove. Reusable as the `live-demo` skill's advanced pattern for future
demos.

## Decisions (from brainstorming)

1. **Real sandboxed shell** — interactive console is a genuine PTY into the
   sim container. Safe because Cloud Run gen2 = microVM isolation PLUS the
   hardening below; NOT because "it's just a container."
2. **Full-bleed IDE app** — whole viewport is the workspace, no page scroll.
   Pitch content (repro story, plugin CTA) becomes a middle-pane tab
   ("How this was built").
3. **Layout: Controls L · Work M · Files R**, thin robium top bar above.
   Middle is a tab strip: **Logs · Console · Editor · Viewer · About**.
   Right file tree opens files into the Editor tab.
4. **Frontend: React island** — one `client:only` React component on
   `/demos/nav-trial`; rest of the site stays static/JS-free. Libraries:
   `react-resizable-panels` (splitters), `@xterm/xterm` (Logs + Console),
   `@monaco-editor/react` (Editor).
5. **Editor: ephemeral real edits** — Monaco saves write the container's
   real filesystem (the shell sees them); no stack auto-reload; all gone
   when the session ends. Honest live-sandbox semantics.

## Security hardening (REQUIRED — ships with the shell, not after)

A public root shell is only acceptable with all of:

- **Dedicated zero-permission service account** for `demo-nav-trial` (a
  stolen metadata token then grants nothing). The fleet-count query
  (`roles/monitoring.viewer`) moves OUT of the demo container into a
  separate tiny endpoint on the already-permissioned robium-site backend,
  or a standalone function; the demo SA holds no roles.
- **Egress lockdown** — Direct VPC egress + a deny-all egress firewall so
  the container cannot dial out (no crypto-mining, no DDoS relay, no
  payload pull). Inbound visitor WebSocket is unaffected. Verify: `curl
  https://example.com` from the shell times out; the demo itself still
  works (all its traffic is inbound).
- Carried from v3: 30-min session cap, `max-instances` budget, ephemeral
  FS, no secrets mounted, one-visitor-one-instance claim, tab-close
  shutdown.
- A GCP budget alert on robium-prod as backstop.

## Backend (gateway additions)

The demo_gateway gains, all session-UUID-guarded and same-site-CORS'd:

- `WS /pty?session=U` — spawns `bash` in a PTY (`pty.openpty` + `bash`),
  bridges bytes over WebSocket ↔ xterm.js. One PTY per session; killed on
  disconnect/shutdown. This is the Console tab.
- `WS /logs?session=U` — read-only stream of the stack log (tail of the
  status log ring, or `ros2`/journal follow). The Logs tab. No stdin.
- `GET /fs/list?path=…` — JSON dir listing (rooted at the app workspace,
  path-traversal guarded).
- `GET /fs/read?path=…` / `POST /fs/write?path=…` — file get/put within the
  workspace root. Editor tab.
- Existing `/start`, `/status`, `/shutdown`, ws bridge → Foxglove: unchanged.

PTY/logs use the same one-live-tunnel + affinity model as the viewer ws.

## Frontend (React island)

`src/components/demo/Workspace.tsx` (+ children), mounted `client:only="react"`
in `src/pages/demos/nav-trial.astro`. Panes:

- **Left — Controls:** Start / Stop / Open in Foxglove (gated on ready),
  status pill, uptime + session countdown, fleet "N of 5", the Foxglove
  layout-file link. Dark/Aurora styled.
- **Middle — tabbed work area:** Logs (xterm, read-only) · Console (xterm +
  PTY) · Editor (Monaco, opens files from the tree) · Viewer (placeholder
  now: "Open in Foxglove ↗"; the future embedded-viewer slot, no rework) ·
  About (the repro story + "Get the plugin" CTA that v3 had as page
  sections).
- **Right — Files:** lazy file tree from `/fs/list`; click → Editor tab
  loads via `/fs/read`; Cmd/Ctrl-S → `/fs/write`.

Panes resizable (`react-resizable-panels`), sensible min widths, graceful
mobile fallback (stacked, viewer/console de-emphasized).

## Testing / done bar

- `demo-smoke` (nav-trial) extends: PTY ws echoes a command result;
  `/fs/list` returns the package dir; `/fs/read` then `/fs/write` round-trips
  a temp file; **egress test: `curl` from the PTY fails closed.**
- Site smoke: the island mounts (assert a known workspace DOM id in a
  browser-rendered check, or presence of the bundle + mount node in built
  HTML), controls/tabs present.
- Manual prod pass: start → logs stream → console runs `ros2 topic list` →
  edit nav2.yaml + save + re-read shows change → Foxglove opens → egress
  blocked → stop kills instance.

## Open risks

1. **Egress lockdown vs the demo's own needs** — confirm the sim pulls
   nothing at runtime (Gazebo Fuel asset fetch? it ran offline before —
   verify). If something needs egress, allow-list that host only.
2. **PTY over WebSocket through Cloud Run** — long-lived, bidirectional;
   should behave like the viewer ws (verified working) but confirm stdin
   latency is usable.
3. **Monaco/xterm bundle size** on an otherwise-tiny site — code-split to
   the demo route only; measure. Acceptable since it's one route.
4. **Concurrency=4 + multiple ws per session** (viewer + pty + logs) — all
   must land on the visitor's instance; same affinity-cookie mechanism,
   but 3 sockets not 1. Verify no cross-routing.
5. **Fleet endpoint relocation** — moving monitoring.viewer off the demo SA
   must not break the counter; the new home (site backend/function) needs
   the role instead.

## Out of scope (later)

Embedded viewer in the Viewer tab (slot reserved), live-reload on file
save, multi-file editor tabs, persistent user workspaces, manip-trial IDE
demo (this pattern generalizes to it).
