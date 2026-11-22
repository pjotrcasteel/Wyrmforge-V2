#!/usr/bin/env bash
set -euo pipefail

appdir="frontends/native/probes/Wyrmforge.V2.NativeProbe.iOS/bin/Debug/net10.0-ios"
app="$(find "$appdir" -type d -name '*.app' -print -quit)"
test -n "$app" || { echo "No compiled native .app bundle in $appdir"; exit 1; }

xcrun simctl list devices available -j > /tmp/n00-ios-devices.json
device="$(python3 - <<'PY'
import json
data=json.load(open('/tmp/n00-ios-devices.json',encoding='utf-8'))
for runtime,devices in data.get('devices',{}).items():
    if 'iOS' in runtime:
        for device in devices:
            if device.get('isAvailable'):
                print(device['udid'])
                raise SystemExit(0)
raise SystemExit('No available iOS simulator')
PY
)"

diagnostics() {
  echo "N00 iOS simulator diagnostics for $device" > /tmp/n00-ios-simulator-diagnostics.txt
  xcrun simctl list devices booted >> /tmp/n00-ios-simulator-diagnostics.txt 2>&1 || true
  xcrun simctl spawn "$device" log show --last 4m --style compact \
    --predicate 'eventMessage CONTAINS "Wyrmforge" OR process CONTAINS "NativeProbe"' \
    >> /tmp/n00-ios-simulator-diagnostics.txt 2>&1 || true
  xcrun simctl io "$device" screenshot /tmp/n00-ios-simulator-screenshot.png >> /tmp/n00-ios-simulator-diagnostics.txt 2>&1 || true
}
trap 'result=$?; if [ "$result" -ne 0 ]; then diagnostics; fi' EXIT

xcrun simctl boot "$device" || true
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$app"
xcrun simctl launch "$device" com.wyrmforge.v2.n00probe.ios

container="$(xcrun simctl get_app_container "$device" com.wyrmforge.v2.n00probe.ios data)"
receipt=""
for attempt in $(seq 1 25); do
  if test -f "$container/Documents/wyrmforge-n00-probe.txt"; then
    receipt="$(cat "$container/Documents/wyrmforge-n00-probe.txt")"
    break
  fi
  sleep 2
done

printf '%s\n' "$receipt" | tee /tmp/n00-ios-simulator-receipt.txt
if ! echo "$receipt" | grep -q 'status=PASS'; then
  echo "Native iOS launch gave no PASS receipt in $container/Documents; see uploaded diagnostics"
  exit 1
fi
echo "$receipt" | grep -q 'tick=2 accepted=1'
echo "$receipt" | grep -q 'hash=99088D266569F833DC8E2B37A78209099F8DCB7AC3BD81B6B243D875F789E78B'
echo "$receipt" | grep -q 'random=4063834449'
echo "PASS: iOS simulator $device launched actual native C# SDK probe with matching hash"
