#!/usr/bin/env bash
# robium.org smoke: build output contains every load-bearing section.
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

check "robotics-ready" "hero headline"
check "39.51s" "hero real transcript"
check "Smoke test gates done" "how-it-works"
check "plugin marketplace add jazarium/robium-docs" "install command"
check "pusht-eval.mp4" "proof video"
check "Hugging Face" "marquee"

if [[ -z "$URL" ]]; then
  DEMO=$(cat dist/demos/nav-trial/index.html)
  grep -q "Start instance" <<<"$DEMO" && echo "ok: start button" || { echo "FAIL: start button"; fail=1; }
  grep -q "app.foxglove.dev" <<<"$DEMO" && echo "ok: foxglove deep link" || { echo "FAIL: foxglove deep link"; fail=1; }
  grep -q "demo.robium.org" <<<"$DEMO" && echo "ok: demo host" || { echo "FAIL: demo host"; fail=1; }
  grep -q "shutdown" <<<"$DEMO" && echo "ok: session controls" || { echo "FAIL: session controls"; fail=1; }
  grep -q "budget" <<<"$DEMO" && echo "ok: fleet budget" || { echo "FAIL: fleet budget"; fail=1; }
  [[ -f dist/demos/nav-trial-layout.json ]] && echo "ok: demo layout file" || { echo "FAIL: demo layout file"; fail=1; }
  grep -q "/demos/nav-trial" dist/index.html && echo "ok: homepage demo link" || { echo "FAIL: homepage demo link"; fail=1; }
fi

tiles=$(grep -o 'class="card skill"' <<<"$HTML" | wc -l | tr -d ' ')
if [[ "$tiles" -ge 20 ]]; then echo "ok: $tiles skill tiles"; else echo "FAIL: only $tiles skill tiles"; fail=1; fi

if [[ -z "$URL" ]]; then
  [[ -f dist/media/pusht-eval.mp4 ]] || { echo "FAIL: media missing from dist"; fail=1; }
else
  V=$(curl -fsSL "$URL/viewer/" || true)
  { grep -qi "lichtblick" <<<"$V" || grep -q "main\." <<<"$V"; } && echo "ok: viewer served" || { echo "FAIL: viewer"; fail=1; }
  curl -fsSL "$URL/viewer/default-layout.js" | grep -q "LICHTBLICK_SUITE_DEFAULT_LAYOUT" && echo "ok: viewer default layout" || { echo "FAIL: viewer default layout"; fail=1; }
fi

[[ "$fail" -eq 0 ]] && echo "SMOKE PASS" || { echo "SMOKE FAIL"; exit 1; }
