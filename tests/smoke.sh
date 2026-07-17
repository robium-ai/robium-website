#!/usr/bin/env bash
# robium-website smoke: build output contains every load-bearing section.
set -euo pipefail
cd "$(dirname "$0")/.."

URL="${1:-}"   # optional: check a served URL instead of dist/
if [[ -n "$URL" ]]; then
  HTML=$(curl -fsSL "$URL")
else
  [[ -f dist/index.html ]] || { echo "FAIL: dist/index.html missing — run npm run build"; exit 1; }
  HTML=$(cat dist/index.html)
fi

fail=0
check() {
  if grep -q "$1" <<<"$HTML"; then echo "ok: $2"; else echo "FAIL: $2"; fail=1; fi
}

check "The Physical AI skills" "hero headline"
check "Browse skills catalog" "skills section"
check "agent-cursor" "agent tabs"
check "plugin marketplace add jazarium/robium-plugin" "install command"
check "pusht-eval.mp4" "proof video"
check "Hugging Face" "marquee"

if [[ -z "$URL" ]]; then
  D=$(cat dist/demos/nav-trial/index.html)
  grep -q "Workspace" <<<"$D" && echo "ok: workspace island" || { echo "FAIL: workspace island"; fail=1; }
  grep -rq "demo.robium.ai" dist/demos/nav-trial/ dist/_astro/ 2>/dev/null && echo "ok: demo host wired" || { echo "FAIL: demo host"; fail=1; }
  [[ -f dist/demos/nav-trial-layout.json ]] && echo "ok: demo layout file" || { echo "FAIL: demo layout file"; fail=1; }
  grep -rq "api/instances" dist/_astro/ 2>/dev/null && echo "ok: orchestrator wired" || { echo "FAIL: orchestrator wired"; fail=1; }
  grep -q "/demos/nav-trial" dist/index.html && echo "ok: homepage demo link" || { echo "FAIL: homepage demo link"; fail=1; }
  # vla-trial demo page (v1, local-only)
  D2=$(cat dist/demos/vla-trial/index.html)
  grep -q "vla-trial live demo" <<<"$D2" && echo "ok: vla-trial demo page" || { echo "FAIL: vla-trial demo page"; fail=1; }
  grep -rq "VlaWorkspace" dist/demos/vla-trial/ dist/_astro/ 2>/dev/null && echo "ok: vla workspace island" || { echo "FAIL: vla workspace island"; fail=1; }
  grep -q "/demos/vla-trial" dist/index.html && echo "ok: homepage vla-trial link" || { echo "FAIL: homepage vla-trial link"; fail=1; }
  # manip-trial demo page (v1, local-only)
  D3=$(cat dist/demos/manip-trial/index.html)
  grep -q "manip-trial live demo" <<<"$D3" && echo "ok: manip-trial demo page" || { echo "FAIL: manip-trial demo page"; fail=1; }
  grep -rq "ManipWorkspace" dist/demos/manip-trial/ dist/_astro/ 2>/dev/null && echo "ok: manip workspace island" || { echo "FAIL: manip workspace island"; fail=1; }
  grep -q "/demos/manip-trial" dist/index.html && echo "ok: homepage manip-trial link" || { echo "FAIL: homepage manip-trial link"; fail=1; }
fi

# The stat counters must show the REAL counts, computed from the data files at
# build time — never a hand-typed number. The final value is server-rendered
# (JS only animates up to it), so assert the markup carries the true count.
sk=$(node -e "console.log(require('./src/data/skills.json').length)")
ig=$(node -e "console.log(require('./src/data/integrations.json').length)")
grep -q "data-count=\"$sk\"" <<<"$HTML" && echo "ok: skills counter ($sk, real)" || { echo "FAIL: skills counter != $sk"; fail=1; }
grep -q "data-count=\"$ig\"" <<<"$HTML" && echo "ok: integrations counter ($ig, real)" || { echo "FAIL: integrations counter != $ig"; fail=1; }

tiles=$(grep -o 'class="card skill"' <<<"$HTML" | wc -l | tr -d ' ')
if [[ "$tiles" -gt 0 ]]; then echo "ok: skill tiles render"; else echo "FAIL: no skill tiles"; fail=1; fi

for pillar in "Architecture &amp; proof" "Simulation" "Data" "Visualization" "Robotics integration"; do
  check "$pillar" "pillar: $pillar"
done

if [[ -z "$URL" ]]; then
  [[ -f dist/media/pusht-eval.mp4 ]] || { echo "FAIL: media missing from dist"; fail=1; }
else
  V=$(curl -fsSL "$URL/viewer/" || true)
  { grep -qi "lichtblick" <<<"$V" || grep -q "main\." <<<"$V"; } && echo "ok: viewer served" || { echo "FAIL: viewer"; fail=1; }
  curl -fsSL "$URL/viewer/default-layout.js" | grep -q "LICHTBLICK_SUITE_DEFAULT_LAYOUT" && echo "ok: viewer default layout" || { echo "FAIL: viewer default layout"; fail=1; }
fi

[[ "$fail" -eq 0 ]] && echo "SMOKE PASS" || { echo "SMOKE FAIL"; exit 1; }
