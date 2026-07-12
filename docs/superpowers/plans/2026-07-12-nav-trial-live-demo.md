# nav-trial Live Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship robium.org/demos/nav-trial — a page that hands each visitor a private, live nav-trial sim on Cloud Run, driven from Foxglove.

**Architecture:** nav-trial gains a `demo` scenario (nav stack + auto initial-pose + foxglove_bridge as the container's port-8765 service), deployed as Cloud Run service `demo-nav-trial` with concurrency=1 (per-visitor instances, scale-to-zero). robium.org gains a demo page whose "Open in Foxglove" deep link carries the wss URL; the WebSocket connection is the session.

**Tech Stack:** ROS 2 Jazzy / Nav2 / foxglove_bridge (existing nav-trial image), Cloud Build + Cloud Run (robium-prod), Astro (existing site).

## Global Constraints

- Two repos: tasks 1–3 in `/Users/jazarium/repos/robium-applications/apps/nav-trial` (capture learnings per that repo's CLAUDE.md — two-hats rule applies); task 4 in `/Users/jazarium/repos/robium.org`.
- Cloud Run service values (from spec, verbatim): `concurrency=1`, `min-instances=0`, `max-instances=5`, `timeout=1800`, `cpu=4`, `memory=4Gi`, `port=8765`, region `us-central1`, project `robium-prod`.
- Expected service URL (deterministic, project number 902570464351 — verify at deploy): `https://demo-nav-trial-902570464351.us-central1.run.app`.
- Real content only on the site page; the reproduction story quotes the trial brief from robium-applications' README verbatim.
- Map-frame convention (from send_goals.py): initial pose = map (0,0) yaw 0; map = world + (2.0, 0.5).
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `demo` scenario in nav-trial

**Files:**
- Create: `src/nav_trial_bringup/nav_trial_bringup/demo_init.py`, `src/nav_trial_bringup/launch/demo.launch.py`
- Modify: `src/nav_trial_bringup/setup.py` (entry_points), `docker/compose.yaml` (demo service), `Makefile` (demo target)

**Interfaces:**
- Produces: `ros2 launch nav_trial_bringup demo.launch.py` — full nav stack + bridge on :8765 + auto-initialization; logs `DEMO READY rtf=<x>` when drivable (Task 2's smoke greps this). Compose profile `demo`. Console script `demo_init`.
- Consumes: existing `nav.launch.py` (includes sim + bridge + Nav2 servers, lifecycle-managed, AMCL needs an initial pose).

- [ ] **Step 1: Write `demo_init.py`**

```python
"""Auto-initialize the demo session: set AMCL's initial pose, wait for Nav2,
measure RTF, then log the readiness line the demo smoke greps for.

Runs inside demo.launch.py. Exits 0 when ready (the launch keeps running);
without this node the stack sits unlocalized forever — the documented
interactive-bringup abort (learnings 2026-07-10).
"""
import time

import rclpy
from geometry_msgs.msg import PoseStamped
from nav2_simple_commander.robot_navigator import BasicNavigator

INITIAL_POSE = (0.0, 0.0)  # map frame == SLAM start == world (-2.0, -0.5)


def main():
    rclpy.init()
    nav = BasicNavigator()
    pose = PoseStamped()
    pose.header.frame_id = 'map'
    pose.header.stamp = nav.get_clock().now().to_msg()
    pose.pose.position.x, pose.pose.position.y = INITIAL_POSE
    pose.pose.orientation.w = 1.0
    nav.setInitialPose(pose)
    nav.waitUntilNav2Active()  # republishes initial pose until /amcl_pose

    # RTF over ~10 s wall: sim clock (use_sim_time) vs monotonic.
    sim0 = nav.get_clock().now().nanoseconds
    wall0 = time.monotonic()
    while time.monotonic() - wall0 < 10.0:
        rclpy.spin_once(nav, timeout_sec=0.5)
    rtf = (nav.get_clock().now().nanoseconds - sim0) / 1e9 / (time.monotonic() - wall0)

    print(f'DEMO READY rtf={rtf:.2f}', flush=True)
    nav.destroy_node()
    rclpy.shutdown()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
```

- [ ] **Step 2: Write `demo.launch.py`**

```python
"""Demo scenario: the nav stack (nav.launch.py: sim + bridge + Nav2 on the
saved map) plus demo_init, which auto-sets AMCL's initial pose so a Foxglove
visitor can click goals immediately. foxglove_bridge starts with the launch
(listens on :8765 within seconds) — Cloud Run's startup probe passes while
gz/Nav2 are still booting, and the visitor watches topics come alive.
"""
import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node


def generate_launch_description():
    pkg = get_package_share_directory('nav_trial_bringup')
    nav = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(pkg, 'launch', 'nav.launch.py')))
    init = Node(
        package='nav_trial_bringup', executable='demo_init', name='demo_init',
        output='screen', parameters=[{'use_sim_time': True}])
    return LaunchDescription([nav, init])
```

- [ ] **Step 3: Register the entry point in `setup.py`**

In the `console_scripts` list, add after the `send_goals` line:

```python
            'demo_init = nav_trial_bringup.demo_init:main',
```

- [ ] **Step 4: Add the compose service (after the `nav` service in `docker/compose.yaml`)**

```yaml
  demo:
    <<: *app
    profiles: [demo]
    ports: ["8765:8765"]
    command: ros2 launch nav_trial_bringup demo.launch.py
```

- [ ] **Step 5: Add the Makefile target (after `nav:`), and add `demo` to `.PHONY`**

```makefile
demo:
	$(COMPOSE) --profile demo up --abort-on-container-exit
```

- [ ] **Step 6: Build and verify the launch boots to readiness**

Run: `cd /Users/jazarium/repos/robium-applications/apps/nav-trial && make build && docker compose -f docker/compose.yaml --profile demo up -d demo && timeout 180 bash -c 'until docker compose -f docker/compose.yaml logs demo | grep -q "DEMO READY"; do sleep 5; done' && docker compose -f docker/compose.yaml logs demo | grep "DEMO READY"`
Expected: `DEMO READY rtf=0.9x` within ~2 minutes.

- [ ] **Step 7: Tear down and commit**

```bash
docker compose -f docker/compose.yaml --profile "*" down --remove-orphans
cd /Users/jazarium/repos/robium-applications
git add apps/nav-trial && git commit -m "feat(nav-trial): demo scenario — auto-initialized nav stack for live demo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: demo smoke (WebSocket handshake + drivability)

**Files:**
- Create: `apps/nav-trial/tests/check_ws.sh`
- Modify: `apps/nav-trial/Makefile` (demo-smoke target + .PHONY)

**Interfaces:**
- Produces: `bash tests/check_ws.sh <base-url>` — exits 0 iff the URL answers a `foxglove.websocket.v1` upgrade with HTTP 101 (works for `http://localhost:8765` and the `https://` Cloud Run URL; Task 3 reuses it). `make demo-smoke` — full local gate.
- Consumes: Task 1's `demo` profile and `DEMO READY` log line; existing `send_goals` console script.

- [ ] **Step 1: Write `tests/check_ws.sh`**

```bash
#!/usr/bin/env bash
# Foxglove WebSocket handshake probe: expect HTTP 101 with the foxglove
# subprotocol. Usage: check_ws.sh http://localhost:8765 (or https://...).
set -uo pipefail
BASE="${1:?usage: check_ws.sh <base-url>}"
RESP=$(curl -s -i -N --max-time 15 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  -H "Sec-WebSocket-Protocol: foxglove.websocket.v1" \
  "$BASE" | head -5)
echo "$RESP" | head -1
if echo "$RESP" | head -1 | grep -q " 101 "; then
  echo "WS HANDSHAKE OK"
else
  echo "WS HANDSHAKE FAIL"; exit 1
fi
```

- [ ] **Step 2: Add `demo-smoke` to the Makefile (and `.PHONY`)**

```makefile
# Demo gate: boot the demo scenario, assert the Foxglove WebSocket answers,
# the stack reaches DEMO READY, and one nav goal succeeds. Exit code gated.
demo-smoke:
	$(COMPOSE) --profile demo up --build -d demo
	timeout 60 bash -c 'until bash tests/check_ws.sh http://localhost:8765; do sleep 3; done'
	timeout 240 bash -c 'until $(COMPOSE) logs demo | grep -q "DEMO READY"; do sleep 5; done'
	$(COMPOSE) logs demo | grep "DEMO READY"
	$(COMPOSE) exec demo /entrypoint.sh ros2 run nav_trial_bringup send_goals --goals "0.3,0.5" --timeout 120
	$(COMPOSE) --profile "*" down --remove-orphans
	@echo "DEMO SMOKE PASS"
```

- [ ] **Step 3: Run it**

Run: `chmod +x tests/check_ws.sh && make demo-smoke`
Expected: `WS HANDSHAKE OK` → `DEMO READY rtf=…` → `goal 0 (0.3,0.5): TaskResult.SUCCEEDED` → `DEMO SMOKE PASS`, exit 0. (Note: `compose exec` bypasses the entrypoint — hence the explicit `/entrypoint.sh` prefix, the documented gotcha.)

- [ ] **Step 4: Commit**

```bash
cd /Users/jazarium/repos/robium-applications
git add apps/nav-trial && git commit -m "test(nav-trial): demo smoke — ws handshake + readiness + one goal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Cloud Build + Cloud Run deploy

**Files:**
- Create: `apps/nav-trial/cloudbuild.yaml`
- Modify: `apps/nav-trial/Makefile` (demo-image / demo-deploy + .PHONY), `apps/nav-trial/README.md` (demo section), `/Users/jazarium/repos/robium-applications/REGISTRY.md` (nav-trial card: demo line)

**Interfaces:**
- Consumes: Task 2's `tests/check_ws.sh` (run against the live URL).
- Produces: live service `demo-nav-trial` at `https://demo-nav-trial-902570464351.us-central1.run.app` — Task 4 embeds this URL (as `wss://`).

- [ ] **Step 1: Write `apps/nav-trial/cloudbuild.yaml`**

```yaml
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - docker/Dockerfile
      - -t
      - us-central1-docker.pkg.dev/robium-prod/robium/demo-nav-trial:latest
      - .

images:
  - us-central1-docker.pkg.dev/robium-prod/robium/demo-nav-trial:latest

options:
  machineType: E2_HIGHCPU_8
  logging: CLOUD_LOGGING_ONLY
```

- [ ] **Step 2: Add deploy targets to the Makefile (and `.PHONY`)**

```makefile
# --- live demo on Cloud Run (per-visitor instances; see robium.org spec) ---
DEMO_IMAGE = us-central1-docker.pkg.dev/robium-prod/robium/demo-nav-trial:latest

demo-image:
	gcloud builds submit --project=robium-prod --config=cloudbuild.yaml .

demo-deploy:
	gcloud run deploy demo-nav-trial --image=$(DEMO_IMAGE) \
	  --region=us-central1 --project=robium-prod --platform=managed \
	  --port=8765 --concurrency=1 --min-instances=0 --max-instances=5 \
	  --timeout=1800 --cpu=4 --memory=4Gi --cpu-boost \
	  --command=/entrypoint.sh --args="ros2,launch,nav_trial_bringup,demo.launch.py" \
	  --allow-unauthenticated --quiet
```

- [ ] **Step 3: Build and deploy**

Run: `cd /Users/jazarium/repos/robium-applications/apps/nav-trial && make demo-image && make demo-deploy`
Expected: Cloud Build SUCCESS (amd64 image, ~5–10 min), then `Service URL: https://demo-nav-trial-902570464351.us-central1.run.app`. If the URL differs, record the actual one — Task 4 must use it.

- [ ] **Step 4: Verify the live service (this is the spec's risk-1/3/4 measurement)**

Run: `bash tests/check_ws.sh https://demo-nav-trial-902570464351.us-central1.run.app`
Expected: `WS HANDSHAKE OK` (a cold instance boots to answer — allow one retry after ~60 s).

Run: `sleep 90 && gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=demo-nav-trial AND textPayload:"DEMO READY"' --project=robium-prod --limit=2 --format="value(textPayload)"`
Expected: `DEMO READY rtf=<x>`. **Record rtf.** If rtf < 0.5, redeploy with `--cpu=8 --memory=8Gi` and re-measure; if still < 0.5, STOP — spec says revisit, don't ship a bad demo.

- [ ] **Step 5: Update docs + registry, capture learnings, commit**

`apps/nav-trial/README.md` — add under the make-targets list:

```markdown
- `make demo` — the live-demo scenario (nav stack + auto initial pose +
  Foxglove bridge); `make demo-smoke` gates it. `make demo-image` +
  `make demo-deploy` push it to Cloud Run (`demo-nav-trial`, robium-prod)
  where robium.org/demos/nav-trial hands each visitor a private instance.
```

`REGISTRY.md` nav-trial card — add to the card's bullet list:

```markdown
- **Live demo:** Cloud Run `demo-nav-trial` (per-visitor instances,
  scale-to-zero) behind robium.org/demos/nav-trial — `make demo-deploy`.
```

Append any friction hit during Tasks 1–3 to `learnings/2026-07-12.md` per the capture taxonomy (e.g. Cloud Run + foxglove_bridge behavior — candidate content for the foxglove/integration skills).

```bash
cd /Users/jazarium/repos/robium-applications
git add apps/nav-trial REGISTRY.md learnings/ && git commit -m "feat(nav-trial): Cloud Run live-demo deploy (demo-nav-trial) + registry/docs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push
```

---

### Task 4: robium.org demo page

**Files:**
- Create: `src/pages/demos/nav-trial.astro`, `public/demos/nav-trial-layout.json` (copy)
- Modify: `src/components/Apps.astro` (Try-live button), `tests/smoke.sh` (demo checks)

**Interfaces:**
- Consumes: live wss URL from Task 3 (`wss://demo-nav-trial-902570464351.us-central1.run.app`), `Terminal.astro`, `Base.astro`, `Nav.astro`, `Footer.astro`, theme classes.
- Produces: `/demos/nav-trial` page; homepage link to it.

- [ ] **Step 1: Verify the Foxglove deep-link format against current docs**

WebFetch `https://docs.foxglove.dev/docs/connecting-to-data/frameworks/ros2#foxglove-websocket` (and/or search docs.foxglove.dev for "open in Foxglove URL parameters" / `ds=foxglove-websocket`). Confirm the app URL pattern `https://app.foxglove.dev/~/view?ds=foxglove-websocket&ds.url=<ws-url>`. If the documented parameter names differ, use the documented ones everywhere below.

- [ ] **Step 2: Copy the layout file**

Run: `mkdir -p public/demos && cp /Users/jazarium/repos/robium-applications/apps/nav-trial/foxglove/nav-trial-layout.json public/demos/nav-trial-layout.json`

- [ ] **Step 3: Write `src/pages/demos/nav-trial.astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import Nav from '../../components/Nav.astro';
import Footer from '../../components/Footer.astro';
import Terminal from '../../components/Terminal.astro';

const WS_URL = 'wss://demo-nav-trial-902570464351.us-central1.run.app';
const FOXGLOVE_URL =
  `https://app.foxglove.dev/~/view?ds=foxglove-websocket&ds.url=${encodeURIComponent(WS_URL)}`;
---
<Base title="nav-trial live demo — robium">
  <div class="glow-field"></div>
  <Nav />
  <main>
    <section class="demo-hero">
      <div class="container narrow">
        <span class="badge">Live demo</span>
        <h1>Drive a robot. <span class="gradient-text">Right now.</span></h1>
        <p class="sub">
          A TurtleBot 3 running SLAM-built-map navigation (ROS 2 Jazzy + Nav2 +
          Gazebo, fully headless) boots privately for you on Cloud Run. You
          drive it from Foxglove by clicking navigation goals on its map.
        </p>
      </div>
    </section>

    <section class="steps-sec">
      <div class="container narrow">
        <span class="label">Start your session</span>
        <ol class="steps">
          <li>
            <strong>Download the layout</strong> (one-time):
            <a href="/demos/nav-trial-layout.json" download class="btn btn-secondary">nav-trial-layout.json</a>
          </li>
          <li>
            <strong>Open your private robot in Foxglove</strong> (free account
            required — it's the standard robotics viewer):
            <a href={FOXGLOVE_URL} target="_blank" rel="noopener" class="btn btn-primary">Open in Foxglove →</a>
          </li>
          <li>
            <strong>Import the layout</strong> in Foxglove (Layout menu →
            Import from file…), wait for the map to appear, then use the
            <em>Publish</em> tool in the 3D panel to click a goal — the robot
            plans a path and drives there.
          </li>
        </ol>
        <div class="card expect">
          <span class="label">What to expect</span>
          <ul>
            <li><strong>~30–60 s boot</strong> — your simulator starts from cold (that's what keeps it free to offer); panels fill in as the stack comes up.</li>
            <li><strong>Your own robot</strong> — every session is a private instance; nobody else is steering it.</li>
            <li><strong>30-minute sessions</strong> — the sim shuts down when you disconnect or at the cap; reconnect for a fresh robot.</li>
            <li><strong>Busy?</strong> Max 5 simultaneous sessions — if the connection fails, try again in a few minutes.</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="repro-sec">
      <div class="container narrow">
        <span class="label">How this demo was built</span>
        <h2>One brief. One plugin. This repo.</h2>
        <p class="sub">
          Everything you're driving was built by Claude Code with the robium
          plugin, from this brief (verbatim from the
          <a href="https://github.com/jazarium/robium-applications">robium-applications</a>
          proving ground):
        </p>
        <Terminal title="the brief that produced nav-trial">
<span class="tp">Autonomous mobile-robot navigation in simulation</span>
(expected: ROS 2 + Nav2 + Gazebo, dockerized, live viz)

<span class="ta">pass bar:</span> robot navigates to goals in sim;
smoke test passes; skills visibly drove the stack decisions
</Terminal>
        <p class="sub">
          The agent chose the stack, wrote the architecture brief, built the
          Docker environment, ran SLAM to produce the very map you're clicking
          on, tuned Nav2 around real gotchas, and gated it all behind a smoke
          test. Reproduce it: install the plugin and hand your agent a brief.
        </p>
        <a href="/#get-started" class="btn btn-primary">Get the plugin →</a>
      </div>
    </section>
  </main>
  <Footer />
</Base>

<style>
  .narrow { max-width: 760px; }
  .demo-hero { padding: 90px 0 40px; }
  .badge {
    display: inline-block; padding: 6px 14px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--bg2);
    font-size: 13px; color: var(--text2); margin-bottom: 24px;
  }
  .sub { color: var(--text2); margin-top: 20px; }
  .sub a { color: var(--accent2); }
  .steps-sec { padding: 40px 0; }
  .steps { display: grid; gap: 20px; margin: 24px 0 32px; padding-left: 20px; }
  .steps li { color: var(--text2); }
  .steps .btn { margin-left: 12px; height: 38px; padding: 0 16px; font-size: 15px; }
  .expect ul { margin: 12px 0 0 18px; display: grid; gap: 8px; }
  .expect li { font-size: 15px; color: var(--text2); }
  .repro-sec h2 { margin: 12px 0 8px; }
  .repro-sec .btn { margin-top: 24px; }
</style>
```

- [ ] **Step 4: Homepage card link — in `src/components/Apps.astro`, inside the nav-trial `.card.app` div, add directly after the `</Terminal>` line:**

```astro
        <a href="/demos/nav-trial" class="btn btn-primary demo-btn">Try the live demo →</a>
```

And add to that component's `<style>` block:

```css
  .demo-btn { margin-top: 16px; }
```

- [ ] **Step 5: Extend `tests/smoke.sh` — add after the `check "Hugging Face" "marquee"` line:**

```bash
if [[ -z "$URL" ]]; then
  DEMO=$(cat dist/demos/nav-trial/index.html)
  grep -q "app.foxglove.dev" <<<"$DEMO" && echo "ok: demo deep link" || { echo "FAIL: demo deep link"; fail=1; }
  grep -q "demo-nav-trial-902570464351" <<<"$DEMO" && echo "ok: demo wss url" || { echo "FAIL: demo wss url"; fail=1; }
  [[ -f dist/demos/nav-trial-layout.json ]] && echo "ok: demo layout file" || { echo "FAIL: demo layout file"; fail=1; }
  grep -q "/demos/nav-trial" dist/index.html && echo "ok: homepage demo link" || { echo "FAIL: homepage demo link"; fail=1; }
fi
```

- [ ] **Step 6: Build, smoke, deploy, verify live**

Run: `cd /Users/jazarium/repos/robium.org && make smoke && make image && make deploy && bash tests/smoke.sh https://robium.org && curl -s https://robium.org/demos/nav-trial/ | grep -q "app.foxglove.dev" && echo LIVE-OK`
Expected: `SMOKE PASS` (local, with the 4 new checks), deploy succeeds, `SMOKE PASS` (live), `LIVE-OK`.

- [ ] **Step 7: End-to-end manual check + commit**

Open https://robium.org/demos/nav-trial → click "Open in Foxglove" → log in → confirm the sim boots, import layout, click a goal, robot drives. Leave the session connected but untouched for ~10 minutes and confirm it stays alive (spec risk 3: Cloud Run ws idle behavior — the bridge streams topics continuously, so this should hold). Report anything off.

```bash
git add -A && git commit -m "feat: /demos/nav-trial live demo page + homepage try-live link

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push
```
