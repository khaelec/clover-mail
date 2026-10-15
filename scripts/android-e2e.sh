#!/usr/bin/env bash
# Runs the Phase 2 end-to-end check on the CI emulator: install the APK, launch
# the app (which starts the on-device engine and runs the e2e, printing
# CLOVER_E2E / writing a result file), then assert the result. Run inside
# reactivecircus/android-emulator-runner. The full logcat is uploaded by the
# workflow as an artifact.
set -u

APK=android/app/build/outputs/apk/debug/app-debug.apk

adb wait-for-device
until [ "$(adb get-state 2>/dev/null)" = "device" ]; do sleep 2; done

adb install -r "$APK"
adb logcat -c
adb shell am start -n com.clovermail.app/.MainActivity
sleep 90

adb exec-out screencap -p > /tmp/screen.png || true

adb logcat -d > /tmp/logcat.txt

RESULT=$(grep -o 'CLOVER_E2E {.*}' /tmp/logcat.txt | tail -1 || true)
echo "E2E RESULT: ${RESULT:-<none>}"

echo "--- CLOVER markers ---"
grep -oE 'CLOVER_[A-Z_]+( [^ ]*)?' /tmp/logcat.txt | tail -30 || true

echo "--- engine-ish logcat ---"
grep -iE 'libnode|nodejs|node:|clovermail|Console' /tmp/logcat.txt | tail -60 || true

echo "--- app files ---"
adb shell run-as com.clovermail.app find . -name 'e2e-result.json' 2>/dev/null || true
adb shell run-as com.clovermail.app ls files 2>/dev/null | head -40 || true

if echo "$RESULT" | grep -q '"ok":true'; then
  echo "E2E OK"
  exit 0
fi

FILE=$(adb shell run-as com.clovermail.app cat files/e2e-result.json 2>/dev/null || true)
echo "E2E FILE: ${FILE:-<none>}"
if echo "$FILE" | grep -q '"ok":true'; then
  echo "E2E OK"
  exit 0
fi

echo "E2E failed"
exit 1
