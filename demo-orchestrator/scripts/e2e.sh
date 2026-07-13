#!/usr/bin/env bash
# Orchestrator E2E: from zero containers, create an instance via the API,
# reach the spawned sim's gateway, then delete it. Requires the orchestrator
# running (make orchestrator), Docker up, and nav-trial:latest built.
set -euo pipefail
BASE=http://localhost:8080
S=e2e-$RANDOM
echo "create:"
RES=$(curl -s -X POST "$BASE/api/instances" -H 'content-type: application/json' -d "{\"demo\":\"nav-trial\",\"session\":\"$S\"}")
echo "$RES"
HOST=$(echo "$RES" | python3 -c "import json,sys;print(json.load(sys.stdin)['host'])")
ID=$(echo "$RES" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
echo "spawned $ID at $HOST — waiting for gateway ready…"
n=0; until curl -s "http://$HOST/status?session=$S" | grep -q '"ready": true'; do
  n=$((n+1)); [ $n -ge 40 ] && echo "READY TIMEOUT" && break; sleep 5
done
curl -s "http://$HOST/status?session=$S" | python3 -c "import json,sys;d=json.load(sys.stdin);print('ready:',d['ready'],'rtf:',d['rtf'])"
echo "in fleet list:"; curl -s "$BASE/api/instances" | grep -q "$ID" && echo YES || echo NO
echo "delete:"; curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/api/instances/$ID"
sleep 3
if docker ps --filter "label=robium.demo=1" --format '{{.ID}}' | grep -q "${ID:0:12}"; then
  echo "STILL RUNNING (bad)"
else
  echo "gone (good)"
fi
echo "E2E DONE"
