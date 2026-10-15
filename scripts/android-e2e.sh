#!/usr/bin/env bash
# Runs the Phase 2 end-to-end check on the CI emulator: install the APK, launch
# the app (which runs the engine e2e and prints CLOVER_E2E / writes a result
# file), then assert the result. Run inside reactivecircus/android-emulator-runner.
set -u

APK=android/app/build/outputs/apk/debug/app-debug.apk

adb wait-for-device
until [ "$(adb get-state 2>/dev/null)" = "device" ]; do sleep 2; done

adb install -r "$APK"
adb logcat -c
adb shell am start -n com.clovermail.app/.MainActivity
sleep 120

adb logcat -d > /tmp/logcat.txt
RESULT=$(grep -o 'CLOVER_E2E {.*}' /tmp/logcat.txt | tail -1 || true)
echo "E2E RESULT: ${RESULT:-<none>}"

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

echo "E2E failed — recent app/node logs:"
grep -iE 'clover|nodejs|capacitor|fatal|exception|CLOVER_E2E' /tmp/logcat.txt | tail -200 || true
exit 1
