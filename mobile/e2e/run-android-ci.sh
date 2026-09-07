#!/usr/bin/env bash
set -euo pipefail

METRO_LOG="${RUNNER_TEMP:-/tmp}/nvet-metro.log"

cleanup() {
  if [[ -n "${METRO_PID:-}" ]]; then
    kill "$METRO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

npm start -- --reset-cache >"$METRO_LOG" 2>&1 &
METRO_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8081/status 2>/dev/null | grep -q 'packager-status:running'; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  cat "$METRO_LOG" || true
  echo '::error::Metro no quedó disponible en el puerto 8081'
  exit 1
fi

# The client search intentionally applies a 20 km radius when device location
# is available. Android emulators otherwise inherit a non-Cartagena/default
# coordinate, which can filter the certified Cartagena fixture out of results.
# `adb emu geo fix` expects longitude first, then latitude.
echo 'Pinning Android emulator location to Cartagena for geospatial discovery.'
adb emu geo fix -75.5594 10.4003

echo 'Metro ready; building Android Detox artifacts.'
npm run e2e:build:android

echo 'Android Detox artifacts built; running ordered 01 → 02 → 03 circuit.'
if ! npm run e2e:test:android -- --headless --record-logs all; then
  echo '::error::Android Detox circuit failed. Metro tail follows.'
  tail -n 120 "$METRO_LOG" || true
  exit 1
fi

echo '✅ Android Detox circuit 01 → 02 → 03 completed.'
