#!/usr/bin/env bash
set -euo pipefail

# APK was already built by the preceding workflow step; do not rebuild it inside the emulator.
apk="$(find frontends/native/probes/Wyrmforge.V2.NativeProbe.Android/bin/Debug -type f -name '*.apk' -print -quit)"
test -n "$apk" || { echo "No compiled native Android APK"; exit 1; }

adb wait-for-device
adb install -r "$apk"
adb logcat -c
adb shell monkey -p com.wyrmforge.v2.n00probe 1
receipt=""
for attempt in $(seq 1 15); do
  receipt="$(adb logcat -d -s WyrmforgeN00Probe:I '*:S' || true)"
  if echo "$receipt" | grep -q 'status=PASS'; then
    break
  fi
  sleep 2
done
printf '%s\n' "$receipt" | tee /tmp/n00-android-emulator-receipt.txt
grep -q 'status=PASS' /tmp/n00-android-emulator-receipt.txt
grep -q 'hash=99088D266569F833DC8E2B37A78209099F8DCB7AC3BD81B6B243D875F789E78B' /tmp/n00-android-emulator-receipt.txt
grep -q 'random=4063834449' /tmp/n00-android-emulator-receipt.txt
echo 'PASS: Android emulator launched real SDK app and executed shared C# replay vector'
