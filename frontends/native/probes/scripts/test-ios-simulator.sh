#!/usr/bin/env bash
set -euo pipefail
appdir="frontends/native/probes/Wyrmforge.V2.NativeProbe.iOS/bin/Debug/net10.0-ios"
app="$(find "$appdir" -type d -name '*.app' -print -quit)"
test -n "$app"
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
xcrun simctl boot "$device" || true
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$app"
xcrun simctl launch "$device" com.wyrmforge.v2.n00probe.ios
receipt=""
for attempt in $(seq 1 15); do
  container="$(xcrun simctl get_app_container "$device" com.wyrmforge.v2.n00probe.ios data)"
  if test -f "$container/Documents/wyrmforge-n00-probe.txt"; then
    receipt="$(cat "$container/Documents/wyrmforge-n00-probe.txt")"
    break
  fi
  sleep 2
done
printf '%s\n' "$receipt" | tee /tmp/n00-ios-simulator-receipt.txt
echo "$receipt" | grep -q 'status=PASS'
echo "$receipt" | grep -q 'hash=99088D266569F833DC8E2B37A78209099F8DCB7AC3BD81B6B243D875F789E78B'
echo "PASS: iOS simulator $device launched actual native C# SDK probe with matching hash"
