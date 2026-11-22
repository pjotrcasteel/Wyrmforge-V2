#!/usr/bin/env bash
set -euo pipefail
project="frontends/native/probes/Wyrmforge.V2.NativeProbe.Android/Wyrmforge.V2.NativeProbe.Android.csproj"
dotnet build "$project" --configuration Debug --framework net10.0-android -p:RuntimeIdentifier=android-x64
apk="$(find frontends/native/probes/Wyrmforge.V2.NativeProbe.Android/bin/Debug -type f -name '*.apk' | head -n 1)"
test -n "$apk"
adb install -r "$apk"
adb logcat -c
adb shell monkey -p com.wyrmforge.v2.n00probe 1
sleep 8
adb logcat -d -s WyrmforgeN00Probe:I '*:S' | tee /tmp/n00-android-emulator-receipt.txt
grep -q 'status=PASS' /tmp/n00-android-emulator-receipt.txt
grep -q 'hash=99088D266569F833DC8E2B37A78209099F8DCB7AC3BD81B6B243D875F789E78B' /tmp/n00-android-emulator-receipt.txt
echo 'PASS: Android emulator launched real SDK app and executed shared C# replay vector'
