# Demo v2 — Embedded Viewer + Session Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /demos/nav-trial becomes a single-page experience: embedded self-hosted Lichtblick on top, live session terminal below, End-session control that stops the visitor's Cloud Run instance.

**Architecture:** One python-stdlib **gateway** process inside the demo container owns port 8765: it tunnels WebSocket upgrades to foxglove_bridge (moved to :8766), enforces one-viewer-per-instance via a session UUID, and serves `/status` + `/shutdown`. A `demo_status` node (extension of demo_init) writes stack state to `/tmp/demo_status.json`. Cloud Run runs `concurrency=4 --session-affinity` so the page's polls reach the viewer's instance. Lichtblick (pinned v1.27.0) is built in the robium-site image and served at `/viewer/`; the page seeds its layout and embeds it with `?ds=foxglove-websocket&ds.url=wss://…/?session=UUID`.

**Design refinement vs spec (same intent, fewer parts):** the spec's "nginx + session server" pair is implemented as a single asyncio gateway — vanilla nginx cannot express the session-claim logic.

**Tech Stack:** python3 stdlib asyncio (gateway), rclpy (status node), Lichtblick v1.27.0 (yarn/webpack, corepack), existing Astro site + nginx, Cloud Run.

## Global Constraints

- Repos: Tasks 1, 4, 5 in `/Users/jazarium/repos/robium.org`; Tasks 2–3 in `/Users/jazarium/repos/robium-applications/apps/nav-trial` (capture learnings per that repo's rules).
- Cloud Run (spec): `concurrency=4`, `--session-affinity`, all other v1 values unchanged (`min=0,max=5,timeout=1800,cpu=4,mem=4Gi,port=8765,gen2,GZ_RELAY=127.0.0.1,GZ_IP=127.0.0.1`).
- Demo service URL: `https://demo-nav-trial-902570464351.us-central1.run.app` (verified live).
- Gateway HTTP contract (all tasks build against this, verbatim):
  - `GET /status?session=<uuid>` → 200 JSON `{"claimed":bool,"ready":bool,"rtf":number|null,"uptime_s":int,"remaining_s":int,"nodes":int,"log":[string]}` when unclaimed or claimed-by-you; **409** when claimed by another session.
  - `POST /shutdown?session=<uuid>` → 200 `bye` and the container exits; **403** on wrong/missing session.
  - WebSocket upgrade on any path → tunneled to the bridge; claims the instance for that request's `session` param; a second concurrent viewer ws → **503**.
- The site's zero-client-JS constraint gets a scoped exception: `/demos/nav-trial` carries inline JS (terminal poller, iframe wiring, controls). The rest of the site stays JS-free.
- Session length remains 30 min (Cloud Run timeout on the tunneled ws).
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Lichtblick build spike (recipe + layout mechanism decision)

**Files:**
- Create: `docs/superpowers/specs/2026-07-13-lichtblick-recipe.md` (the recorded recipe — later tasks follow it verbatim)
- Workdir: `/tmp/lichtblick-spike` (throwaway clone)

**Interfaces:**
- Produces: a verified, written recipe: exact build commands, output dir, the webpack `publicPath` change needed for `/viewer/` subpath serving, and the chosen layout-preload mechanism (spec's order: build hook → same-origin localStorage/IndexedDB seed → patched constant). Task 4's Dockerfile stage and Task 5's page JS follow this file.

- [ ] **Step 1: Clone pinned tag and build**

```bash
git clone --depth 1 --branch v1.27.0 https://github.com/lichtblick-suite/lichtblick /tmp/lichtblick-spike
cd /tmp/lichtblick-spike
corepack enable && yarn install --immutable
yarn web:build:prod
ls web/.webpack
```
Expected: build completes; note the actual output directory (`web/.webpack` or as printed by webpack config — record the real path in the recipe).

- [ ] **Step 2: Subpath check**

Inspect `web/webpack.config.ts` for `publicPath`. Serve the output under a subpath and load it:
```bash
mkdir -p /tmp/spike-www/viewer && cp -r <output-dir>/* /tmp/spike-www/viewer/
cd /tmp/spike-www && python3 -m http.server 8090
# browser (or curl for asset URLs): http://localhost:8090/viewer/
```
If assets 404 (absolute `/` paths), record the fix that works: `publicPath: 'auto'` or `'./'` patch in the webpack config (a `sed`-able one-liner), rebuild, re-verify. Record the exact patch line in the recipe.

- [ ] **Step 3: Connect check against the local demo container**

```bash
cd /Users/jazarium/repos/robium-applications/apps/nav-trial && docker compose -f docker/compose.yaml --profile demo up -d demo
# browser: http://localhost:8090/viewer/?ds=foxglove-websocket&ds.url=ws://localhost:8765/?session=spike
```
Expected: Lichtblick connects and lists topics (v1 container still has the bridge directly on 8765 — fine for this spike). Record the exact query-param format that worked.

- [ ] **Step 4: Layout mechanism decision**

In order, stop at the first that works, and record it with its exact code:
(a) grep the repo for a default-layout hook (`rg -i "defaultLayout|LICHTBLICK_.*LAYOUT" web/ packages/ --files-with-matches | head`) and if a build-time/env hook exists, use it with `nav-trial-layout.json`;
(b) same-origin seeding: with the viewer served from the same origin as a test parent page, inspect where layouts persist (DevTools → Application: IndexedDB/localStorage keys after manually importing `nav-trial-layout.json` once), and record the exact storage key + value shape a parent page must write before iframe load;
(c) patched build: hardcode the layout as the default in the source location found via (a)'s grep.

- [ ] **Step 5: Write the recipe file and commit**

`docs/superpowers/specs/2026-07-13-lichtblick-recipe.md` must contain: pinned tag, node/yarn versions used, build commands, real output dir, the publicPath patch (if needed), the working `ds`/`ds.url` format, the chosen layout mechanism with exact key/code, and any surprises. Commit:
```bash
cd /Users/jazarium/repos/robium.org && git add docs && git commit -m "spike: lichtblick v1.27.0 build + subpath + layout recipe

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: nav-trial gateway + status node

**Files:**
- Create: `scripts/demo_gateway.py`
- Modify: `src/nav_trial_bringup/nav_trial_bringup/demo_init.py` (becomes the status writer too), `src/nav_trial_bringup/launch/demo.launch.py` (bridge :8766 + gateway process), `src/nav_trial_bringup/launch/sim.launch.py:60-63` (bridge port becomes a launch argument), `Makefile` (demo-smoke additions), `tests/check_ws.sh` (session param)

**Interfaces:**
- Consumes: `/tmp/demo_status.json` schema `{"start":epoch,"ready":bool,"rtf":number|null,"nodes":int,"log":[string]}` (written by demo_init below).
- Produces: the Global-Constraints gateway HTTP contract on :8765; bridge on :8766.

- [ ] **Step 1: Make the bridge port a launch argument in `sim.launch.py`**

Replace the foxglove Node's parameters line (currently `parameters=[{'port': 8765, 'use_sim_time': True}]`):

```python
    foxglove = Node(
        package='foxglove_bridge', executable='foxglove_bridge',
        parameters=[{
            'port': LaunchConfiguration('bridge_port', default='8765'),
            'use_sim_time': True,
        }])
```
Add `from launch.substitutions import LaunchConfiguration` to the imports and `DeclareLaunchArgument('bridge_port', default_value='8765')` (import `DeclareLaunchArgument` from `launch.actions`) prepended to the returned LaunchDescription entries. Existing sim/slam/nav scenarios keep 8765 by default — no behavior change.

- [ ] **Step 2: Extend `demo_init.py` into the status writer**

Replace the file's `main()` tail (after the RTF computation) so the node stays alive writing status; full replacement file:

```python
"""Auto-initialize the demo session, then keep writing stack status.

Sets AMCL's initial pose (the documented interactive-bringup abort otherwise),
waits for Nav2, measures RTF, then loops forever: subscribes /rosout and
writes /tmp/demo_status.json every 2 s for the gateway's /status endpoint.
"""
import json
import time

import rclpy
from geometry_msgs.msg import PoseStamped
from nav2_simple_commander.robot_navigator import BasicNavigator
from rcl_interfaces.msg import Log

INITIAL_POSE = (0.0, 0.0)  # map frame == SLAM start == world (-2.0, -0.5)
STATUS_PATH = '/tmp/demo_status.json'
LOG_KEEP = 40
START = time.time()


def write_status(nav, ready, rtf, log_ring):
    status = {
        'start': START,
        'ready': ready,
        'rtf': rtf,
        'nodes': len(nav.get_node_names()),
        'log': list(log_ring),
    }
    with open(STATUS_PATH + '.tmp', 'w') as f:
        json.dump(status, f)
    import os
    os.replace(STATUS_PATH + '.tmp', STATUS_PATH)


def main():
    rclpy.init()
    nav = BasicNavigator()
    log_ring = []

    def on_log(msg: Log):
        line = f'[{msg.name}] {msg.msg}'
        log_ring.append(line[:160])
        del log_ring[:-LOG_KEEP]

    nav.create_subscription(Log, '/rosout', on_log, 10)

    write_status(nav, False, None, log_ring)
    pose = PoseStamped()
    pose.header.frame_id = 'map'
    pose.header.stamp = nav.get_clock().now().to_msg()
    pose.pose.position.x, pose.pose.position.y = INITIAL_POSE
    pose.pose.orientation.w = 1.0
    nav.setInitialPose(pose)
    nav.waitUntilNav2Active()

    sim0 = nav.get_clock().now().nanoseconds
    wall0 = time.monotonic()
    while time.monotonic() - wall0 < 10.0:
        rclpy.spin_once(nav, timeout_sec=0.5)
    rtf = (nav.get_clock().now().nanoseconds - sim0) / 1e9 / (time.monotonic() - wall0)
    print(f'DEMO READY rtf={rtf:.2f}', flush=True)

    last = 0.0
    while rclpy.ok():
        rclpy.spin_once(nav, timeout_sec=0.5)
        if time.monotonic() - last >= 2.0:
            write_status(nav, True, round(rtf, 2), log_ring)
            last = time.monotonic()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
```

- [ ] **Step 3: Write `scripts/demo_gateway.py` (full file)**

```python
#!/usr/bin/env python3
"""Demo session gateway — single process on $PORT (8765).

Routes:
  * WebSocket upgrade (any path)  -> raw byte tunnel to the bridge :8766.
      First tunnel claims the instance for the request's ?session=UUID;
      a second concurrent viewer gets 503 (Cloud Run routes their retry to
      a fresh instance because this one is busy).
  * GET  /status?session=UUID     -> 200 JSON (contract in the plan header);
      409 if the instance is claimed by a different session.
  * POST /shutdown?session=UUID   -> 200 + SIGTERM PID 1 (container exits);
      403 on session mismatch.

stdlib only; runs alongside ros2 launch inside the demo container.
"""
import asyncio
import json
import os
import signal
import time
from urllib.parse import parse_qs, urlsplit

PORT = int(os.environ.get('PORT', '8765'))
BRIDGE = ('127.0.0.1', 8766)
STATUS_PATH = '/tmp/demo_status.json'
SESSION_SECONDS = 1800

state = {'session': None, 'tunnel_open': False, 'claimed_at': None}


def http_response(status, body, extra=''):
    return (f'HTTP/1.1 {status}\r\nContent-Type: application/json\r\n'
            f'Content-Length: {len(body)}\r\nAccess-Control-Allow-Origin: *\r\n'
            f'{extra}\r\n{body}').encode()


def read_status_file():
    try:
        with open(STATUS_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {'start': time.time(), 'ready': False, 'rtf': None,
                'nodes': 0, 'log': ['stack booting…']}


async def pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def handle(reader, writer):
    try:
        raw = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), timeout=30)
    except (asyncio.TimeoutError, asyncio.IncompleteReadError, ConnectionError):
        writer.close(); return
    head = raw.decode('latin1')
    request_line = head.split('\r\n', 1)[0]
    parts = request_line.split(' ')
    if len(parts) < 2:
        writer.close(); return
    method, target = parts[0], parts[1]
    url = urlsplit(target)
    session = parse_qs(url.query).get('session', [None])[0]
    is_upgrade = 'upgrade: websocket' in head.lower()

    if is_upgrade:
        if state['tunnel_open']:
            writer.write(http_response('503 Busy', json.dumps({'error': 'busy'})))
            await writer.drain(); writer.close(); return
        state['session'] = session or state['session'] or 'anonymous'
        state['tunnel_open'] = True
        state['claimed_at'] = state['claimed_at'] or time.time()
        try:
            br, bw = await asyncio.open_connection(*BRIDGE)
        except OSError:
            state['tunnel_open'] = False
            writer.write(http_response('502 Bad Gateway', json.dumps({'error': 'bridge not up'})))
            await writer.drain(); writer.close(); return
        bw.write(raw)
        await bw.drain()
        try:
            await asyncio.gather(pipe(reader, bw), pipe(br, writer))
        finally:
            state['tunnel_open'] = False
        return

    if url.path == '/status':
        if state['session'] and session != state['session']:
            writer.write(http_response('409 Conflict', json.dumps({'error': 'not your instance'})))
        else:
            s = read_status_file()
            up = int(time.time() - (state['claimed_at'] or s['start']))
            body = json.dumps({
                'claimed': state['session'] is not None,
                'ready': s['ready'], 'rtf': s['rtf'], 'nodes': s['nodes'],
                'uptime_s': up, 'remaining_s': max(0, SESSION_SECONDS - up),
                'log': s['log'],
            })
            writer.write(http_response('200 OK', body))
        await writer.drain(); writer.close(); return

    if url.path == '/shutdown' and method == 'POST':
        if state['session'] is None or session != state['session']:
            writer.write(http_response('403 Forbidden', json.dumps({'error': 'forbidden'})))
            await writer.drain(); writer.close(); return
        writer.write(http_response('200 OK', json.dumps({'bye': True})))
        await writer.drain(); writer.close()
        await asyncio.sleep(0.2)
        os.kill(1, signal.SIGTERM)
        return

    writer.write(http_response('200 OK', json.dumps({'service': 'robium demo gateway'})))
    await writer.drain(); writer.close()


async def main():
    server = await asyncio.start_server(handle, '0.0.0.0', PORT)
    print(f'demo_gateway listening on :{PORT}', flush=True)
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    asyncio.run(main())
```

- [ ] **Step 4: Wire into `demo.launch.py`** (full replacement of the returned description)

```python
import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import ExecuteProcess, IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node


def generate_launch_description():
    pkg = get_package_share_directory('nav_trial_bringup')
    nav = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(pkg, 'launch', 'nav.launch.py')),
        launch_arguments={'bridge_port': '8766'}.items())
    init = Node(
        package='nav_trial_bringup', executable='demo_init', name='demo_init',
        output='screen', parameters=[{'use_sim_time': True}])
    gateway = ExecuteProcess(
        cmd=['python3', '/ws/scripts/demo_gateway.py'], output='screen')
    return LaunchDescription([nav, init, gateway])
```
Note: `nav.launch.py` must forward `bridge_port` to its `sim.launch.py` include — add `launch_arguments={'bridge_port': LaunchConfiguration('bridge_port', default='8765')}.items()` there with the same `DeclareLaunchArgument` import pattern as Step 1.

- [ ] **Step 5: Update `tests/check_ws.sh`** — append `?session=smoke` to the request: change the final curl argument from `"$BASE"` to `"$BASE/?session=${2:-smoke}"`.

- [ ] **Step 6: Extend `make demo-smoke`** — replace the target's body with:

```makefile
demo-smoke:
	$(COMPOSE) --profile demo up --build -d demo
	n=0; until bash tests/check_ws.sh http://localhost:8765; do \
	  n=$$((n+1)); [ $$n -ge 20 ] && echo "WS TIMEOUT" && exit 1; sleep 3; done
	n=0; until curl -sf "http://localhost:8765/status?session=smoke" | grep -q '"ready": *true'; do \
	  n=$$((n+1)); [ $$n -ge 48 ] && echo "READY TIMEOUT" && exit 1; sleep 5; done
	curl -sf "http://localhost:8765/status?session=smoke"
	test "$$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8765/status?session=intruder")" = "409"
	test "$$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:8765/shutdown?session=intruder")" = "403"
	$(COMPOSE) exec demo /entrypoint.sh ros2 run nav_trial_bringup send_goals --goals "0.3,0.5" --timeout 120
	curl -s -X POST "http://localhost:8765/shutdown?session=smoke" | grep -q bye
	n=0; until [ -z "$$($(COMPOSE) ps -q demo)" ] || [ "$$(docker inspect -f '{{.State.Running}}' $$($(COMPOSE) ps -q demo) 2>/dev/null)" != "true" ]; do \
	  n=$$((n+1)); [ $$n -ge 10 ] && echo "SHUTDOWN TIMEOUT" && exit 1; sleep 2; done
	$(COMPOSE) --profile "*" down --remove-orphans
	@echo "DEMO SMOKE PASS"
```
(The ws claim happens via check_ws.sh's `session=smoke`; note the first ws closes when curl exits, freeing the tunnel but keeping the claim — status/shutdown then validate against `smoke`.)

- [ ] **Step 7: Run `make demo-smoke`**

Expected: handshake OK → status JSON `"ready": true` → 409/403 for the intruder → goal SUCCEEDED → shutdown → container exits → `DEMO SMOKE PASS`.

- [ ] **Step 8: Commit**

```bash
cd /Users/jazarium/repos/robium-applications
git add apps/nav-trial && git commit -m "feat(nav-trial): session gateway (ws tunnel + status + shutdown) and live status node

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Cloud Run redeploy + cloud verification

**Files:**
- Modify: `apps/nav-trial/Makefile` (demo-deploy: add `--concurrency=4 --session-affinity`, replacing `--concurrency=1`)

- [ ] **Step 1: Edit demo-deploy** — change `--port=8765 --concurrency=1` to `--port=8765 --concurrency=4 --session-affinity` in the Makefile.

- [ ] **Step 2: Build + deploy + verify**

```bash
cd /Users/jazarium/repos/robium-applications/apps/nav-trial
make demo-image && make demo-deploy
bash tests/check_ws.sh https://demo-nav-trial-902570464351.us-central1.run.app cloudsmoke
n=0; until curl -sf "https://demo-nav-trial-902570464351.us-central1.run.app/status?session=cloudsmoke" | grep -q '"ready": *true'; do n=$((n+1)); [ $n -ge 40 ] && break; sleep 10; done
curl -s "https://demo-nav-trial-902570464351.us-central1.run.app/status?session=cloudsmoke"
```
Expected: 101 handshake, then status JSON with `"ready": true` and an rtf value. (Affinity caveat: the status curl may land on a different instance → `claimed:false` booting JSON or 409; retry a few times — the browser flow carries the affinity cookie that curl doesn't. Record what happened.)

- [ ] **Step 3: Commit + push**

```bash
cd /Users/jazarium/repos/robium-applications
git add apps/nav-trial && git commit -m "feat(nav-trial): demo Cloud Run concurrency=4 + session affinity for gateway endpoints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push
```

---

### Task 4: Lichtblick into the robium-site image at /viewer/

**Files:**
- Modify: `Dockerfile` (build stage per the Task 1 recipe), `nginx.conf` (/viewer/ location), `tests/smoke.sh` (viewer check)

- [ ] **Step 1: Add the Lichtblick build stage to `Dockerfile`** (exact commands from the Task 1 recipe; shape below, adjust ONLY per the recipe file):

```dockerfile
FROM node:22-slim AS lichtblick
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch v1.27.0 https://github.com/lichtblick-suite/lichtblick /lb
WORKDIR /lb
# publicPath patch from the recipe (only if the recipe says it's needed):
# RUN sed -i "s|publicPath: .*|publicPath: 'auto',|" web/webpack.config.ts
RUN corepack enable && yarn install --immutable && yarn web:build:prod
```
And in the nginx stage add: `COPY --from=lichtblick /lb/<output-dir-from-recipe> /usr/share/nginx/html/viewer`

- [ ] **Step 2: nginx location** — add to `nginx.conf` above `location /`:

```nginx
    location /viewer/ { add_header Cache-Control "public, max-age=3600"; try_files $uri $uri/ /viewer/index.html; }
```

- [ ] **Step 3: smoke check** — add to `tests/smoke.sh`'s URL-independent section a served-file check, and to `make docker-smoke` flow it comes free; local check:

```bash
if [[ -n "$URL" ]]; then
  curl -sf "$URL/viewer/" | grep -qi "lichtblick\|<div id=" && echo "ok: viewer served" || { echo "FAIL: viewer"; fail=1; }
fi
```

- [ ] **Step 4: Build the container and verify**

Run: `cd /Users/jazarium/repos/robium.org && make docker-smoke`
Expected: existing checks + `ok: viewer served` … `SMOKE PASS`. (First build is slow — the Lichtblick stage compiles a large webpack app, ~5–15 min.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: self-hosted Lichtblick v1.27.0 served at /viewer/

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: page v2 — iframe + session terminal + controls

**Files:**
- Modify: `src/pages/demos/nav-trial.astro` (major rework), `tests/smoke.sh` (v2 checks)

**Interfaces:**
- Consumes: gateway contract (Global Constraints), `/viewer/` (Task 4), layout mechanism (Task 1 recipe — the seeding snippet below adjusts to the recipe's exact storage key).

- [ ] **Step 1: Rework the page.** Keep the repro-story section; replace the steps section with the live surface. Structure (inline `<script>` allowed on this page per Global Constraints):

```astro
---
import Base from '../../layouts/Base.astro';
import Nav from '../../components/Nav.astro';
import Footer from '../../components/Footer.astro';
import Terminal from '../../components/Terminal.astro';
const DEMO_HOST = 'demo-nav-trial-902570464351.us-central1.run.app';
---
<Base title="nav-trial live demo — robium">
  <div class="glow-field"></div>
  <Nav />
  <main>
    <section class="demo-top">
      <div class="container wide">
        <div class="bar">
          <div>
            <span class="badge">Live demo</span>
            <h1 class="small">Drive a robot. <span class="gradient-text">Right here.</span></h1>
          </div>
          <div class="controls">
            <span id="pill" class="pill">starting…</span>
            <button id="restart" class="btn btn-secondary">Restart</button>
            <button id="stop" class="btn btn-secondary">End session</button>
          </div>
        </div>
        <iframe id="viewer" title="Robot viewer" allow="fullscreen"></iframe>
        <div class="term card">
          <div class="term-head">
            <span id="stat" class="statline">connecting to your robot…</span>
          </div>
          <pre id="log" class="term-log">→ requesting a private simulator instance
→ first boot can take 60–90 s (container pull + Gazebo + Nav2)…</pre>
        </div>
      </div>
    </section>
    <!-- repro-story section: unchanged from v1 -->
  </main>
  <Footer />
  <script define:vars={{ DEMO_HOST }}>
    const wsBase = `wss://${DEMO_HOST}`;
    const httpBase = `https://${DEMO_HOST}`;
    let session, timer;
    const $ = (id) => document.getElementById(id);

    function boot() {
      session = crypto.randomUUID();
      // Layout seeding per the Task 1 recipe (exact key/value from the
      // recipe file replaces this call):
      seedViewerLayout();
      const ds = encodeURIComponent(`${wsBase}/?session=${session}`);
      $('viewer').src = `/viewer/?ds=foxglove-websocket&ds.url=${ds}`;
      $('pill').textContent = 'starting…';
      clearInterval(timer);
      timer = setInterval(poll, 2000);
    }

    async function poll() {
      try {
        const r = await fetch(`${httpBase}/status?session=${session}`);
        if (r.status === 409) { $('stat').textContent = 'status unavailable (another session is polling this instance) — your viewer is unaffected'; return; }
        const s = await r.json();
        $('pill').textContent = s.ready ? `ready · rtf ${s.rtf}` : 'booting…';
        const mm = String(Math.floor(s.remaining_s / 60)).padStart(2, '0');
        const ss = String(s.remaining_s % 60).padStart(2, '0');
        $('stat').textContent = `uptime ${s.uptime_s}s · ${s.nodes} nodes · session ends in ${mm}:${ss}`;
        if (s.log?.length) { $('log').textContent = s.log.join('\n'); $('log').scrollTop = $('log').scrollHeight; }
      } catch { $('pill').textContent = 'starting…'; }
    }

    async function stop() {
      clearInterval(timer);
      try { await fetch(`${httpBase}/shutdown?session=${session}`, { method: 'POST' }); } catch {}
      $('pill').textContent = 'ended';
      $('stat').textContent = 'session ended — instance stopped';
      $('log').textContent += '\n→ instance stopped. Restart for a fresh robot.';
      $('viewer').src = 'about:blank';
    }

    $('stop').addEventListener('click', stop);
    $('restart').addEventListener('click', boot);
    addEventListener('pagehide', () => {
      navigator.sendBeacon(`${httpBase}/shutdown?session=${session}`);
    });
    boot();
  </script>
</Base>

<style>
  .wide { max-width: 1280px; }
  .demo-top { padding: 40px 0 80px; }
  .bar { display: flex; justify-content: space-between; align-items: end; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
  h1.small { font-size: 40px; margin-top: 12px; }
  .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg2); font-size: 13px; color: var(--text2); }
  .controls { display: flex; gap: 12px; align-items: center; }
  .pill { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg2); font-size: 13px; color: var(--success); font-family: ui-monospace, Menlo, monospace; }
  .controls .btn { height: 38px; padding: 0 16px; font-size: 14px; }
  iframe { width: 100%; height: 62vh; border: 1px solid var(--border); border-radius: 16px; background: var(--bg2); display: block; }
  .term { margin-top: 16px; padding: 0; }
  .term-head { padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--bg2); }
  .statline { font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: var(--text2); }
  .term-log { margin: 0; padding: 14px 16px; height: 22vh; overflow-y: auto; font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; line-height: 1.6; color: var(--text2); }
</style>
```
`seedViewerLayout()` is written per the Task 1 recipe (localStorage/IndexedDB key + the committed layout JSON inlined at build time via `import layout from '../../../public/demos/nav-trial-layout.json'`); if the recipe chose mechanism (a) or (c), the function body is a no-op and is removed along with its call.

- [ ] **Step 2: smoke checks** — in `tests/smoke.sh`, replace the v1 demo checks (`app.foxglove.dev` deep link check) with:

```bash
if [[ -z "$URL" ]]; then
  DEMO=$(cat dist/demos/nav-trial/index.html)
  grep -q "/viewer/?ds=foxglove-websocket" <<<"$DEMO" || grep -q "viewer" <<<"$DEMO" && echo "ok: embedded viewer wiring" || { echo "FAIL: embedded viewer wiring"; fail=1; }
  grep -q "demo-nav-trial-902570464351" <<<"$DEMO" && echo "ok: demo host" || { echo "FAIL: demo host"; fail=1; }
  grep -q "shutdown" <<<"$DEMO" && echo "ok: session controls" || { echo "FAIL: session controls"; fail=1; }
  [[ -f dist/demos/nav-trial-layout.json ]] && echo "ok: demo layout file" || { echo "FAIL: demo layout file"; fail=1; }
  grep -q "/demos/nav-trial" dist/index.html && echo "ok: homepage demo link" || { echo "FAIL: homepage demo link"; fail=1; }
fi
```

- [ ] **Step 3: Local E2E against the local demo container**

```bash
cd /Users/jazarium/repos/robium-applications/apps/nav-trial && docker compose -f docker/compose.yaml --profile demo up -d demo
cd /Users/jazarium/repos/robium.org && make smoke && npm run dev
# browser http://localhost:4321/demos/nav-trial — expect: viewer loads from /viewer/… 
# NOTE: local dev serves the page but /viewer/ only exists in the container build;
# for full local E2E use `make docker-smoke` + http://localhost:8080/demos/nav-trial
# with DEMO_HOST temporarily pointing at localhost:8765 — do the real E2E on prod instead.
```

- [ ] **Step 4: Deploy + prod E2E + commit**

```bash
make image && make deploy && bash tests/smoke.sh https://robium.org
git add -A && git commit -m "feat: demo v2 — embedded Lichtblick + live session terminal + stop control

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push
```
Manual prod pass (report results): open https://robium.org/demos/nav-trial/ → viewer boots in-page, layout preloaded, terminal streams boot log then `ready · rtf …` + countdown, click a nav goal in the embedded viewer → robot drives, End session → pill `ended` + instance actually stops (confirm: next status poll fails / `gcloud run` shows no active instance), Restart → fresh robot. Note affinity behavior in the terminal (409s or clean).
