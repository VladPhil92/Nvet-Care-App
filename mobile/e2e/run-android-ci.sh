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

# The Gradle build below takes ~20 minutes after the emulator boots. Without
# this the display times out and the keyguard comes back, so the app launches
# behind the lockscreen and Espresso never sees its window take focus. Detox's
# own unlock heuristic does not detect the Android 13 keyguard reliably.
echo 'Keeping the emulator awake and unlocked for the Detox circuit.'
adb shell svc power stayon true
adb shell settings put system screen_off_timeout 2147483647
adb shell locksettings set-disabled true || echo '::warning::Could not disable the emulator lockscreen.'
# Crash/ANR dialogs from system apps on a software-rendered emulator also steal
# window focus; suppress them so a slow System UI cannot fail the circuit.
adb shell settings put global hide_error_dialogs 1 || echo '::warning::Could not suppress system error dialogs.'

echo 'Metro ready; building Android Detox artifacts.'
npm run e2e:build:android

adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard

echo 'Android Detox artifacts built; running ordered 01 → 02 → 03 circuit.'
if ! npm run e2e:test:android -- --headless --record-logs all; then
  echo '::error::Android Detox circuit failed. Device focus, Metro tail and diagnostics follow.'
  DIAG_DIR=.detox-artifacts/device-diagnostics
  mkdir -p "$DIAG_DIR"
  adb shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp|mDreamingLockscreen|mShowingLockscreen|isKeyguardShowing' || true
  adb shell dumpsys power | grep -E 'mWakefulness=|mHoldingDisplaySuspendBlocker=' || true
  adb exec-out screencap -p >"$DIAG_DIR/failure-screen.png" || true
  adb shell uiautomator dump /sdcard/nvet-window.xml >/dev/null 2>&1 \
    && adb pull /sdcard/nvet-window.xml "$DIAG_DIR/window.xml" >/dev/null 2>&1 || true
  # Only crash/ANR/JS error lines are kept; the full logcat can carry session data.
  adb logcat -d -v time 2>/dev/null \
    | grep -E ' (E|F)/(AndroidRuntime|ReactNative|ReactNativeJS|ActivityManager)' \
    | tail -n 80 | tee "$DIAG_DIR/logcat-errors.txt" || true
  tail -n 120 "$METRO_LOG" || true
  exit 1
fi

echo '✅ Android Detox circuit 01 → 02 → 03 completed.'
