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
  grep -q "app.foxglove.dev" <<<"$DEMO" && echo "ok: demo deep link" || { echo "FAIL: demo deep link"; fail=1; }
  grep -q "demo-nav-trial-902570464351" <<<"$DEMO" && echo "ok: demo wss url" || { echo "FAIL: demo wss url"; fail=1; }
  [[ -f dist/demos/nav-trial-layout.json ]] && echo "ok: demo layout file" || { echo "FAIL: demo layout file"; fail=1; }
  grep -q "/demos/nav-trial" dist/index.html && echo "ok: homepage demo link" || { echo "FAIL: homepage demo link"; fail=1; }
fi

tiles=$(grep -o 'class="card skill"' <<<"$HTML" | wc -l | tr -d ' ')
if [[ "$tiles" -ge 20 ]]; then echo "ok: $tiles skill tiles"; else echo "FAIL: only $tiles skill tiles"; fail=1; fi

if [[ -z "$URL" ]]; then
  [[ -f dist/media/pusht-eval.mp4 ]] || { echo "FAIL: media missing from dist"; fail=1; }
fi

[[ "$fail" -eq 0 ]] && echo "SMOKE PASS" || { echo "SMOKE FAIL"; exit 1; }
