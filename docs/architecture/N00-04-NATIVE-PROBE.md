# N00-04 — platform-native C# execution parity without choosing the final frontend

**Task:** N00-04 in draft PR #447. **Base:** N00-03 Blazor host PR #446. **Owner authorization:** N00 start + continue. **No release, merge, deployed app or production renderer selected.**

## Why these SDK probes

The engine/application code is **already shared .NET 10 C#**, verified in headless tests and a real WebAssembly browser session. We must catch OS runtime/AOT/workload portability failures *before* starting N01. This task creates disposable, platform-native OS SDK shell apps which reference the exact same `Wyrmforge.V2.Application` and `Wyrmforge.V2.Contracts` assemblies. The final gameplay renderer/UI framework is explicitly **undecided**; these shell apps do not decide it.

### Authority boundaries

- The pure `Wyrmforge.V2.NativeProbe.Core` library calls the real `FixedStepSimulationSession`, `HeadlessSessionRunner`, `PlayerCommand`, `Pcg32Random` and `FixedStepSimulationSession.Replay`.
- Android and iOS startup adapters call only `NativeSessionProof.Run()`, write a platform receipt and display a primitive text label. They cannot calculate physics, damage or other gameplay facts. No WebView, JavaScript game, MAUI/Godot/Unity selection or new engine.
- The expected digest is a stable independent check, not a synthetic UI flag. Same session GUID `bbaee9bb-c5bd-42f1-a5b0-62183cccf5f8`, seed `7`, one Move command (sequence `1`, X `1`, Y `0`), ticks `1` and `2`: `99088D266569F833DC8E2B37A78209099F8DCB7AC3BD81B6B243D875F789E78B`. The first PCG32 sample is `4063834449`.
- Desktop MSTest verifies the vector independently before platform builds. Android emulator test asserts on emitted `WyrmforgeN00Probe` logcat receipt; iOS simulator test checks the app's own Documents file after launching it via `simctl`.

## Evidence separation and hard limits

| Gate | What proves it | What does NOT prove it |
| --- | --- | --- |
| Portable .NET 10 | MSTest in isolated Linux runner | Actual iOS/Android execution |
| Android build | Native Android .NET SDK workload/build on Linux | Native Android runtime startup |
| Android runtime | Android x86_64 emulator boots app, executes C# and emits matching receipt | Physical Android phone or arm64 release viability |
| iOS build | Apple/Xcode/.NET-iOS compile for iOS simulator | Launch or physical iPhone |
| iOS runtime | Actual iOS simulator installs, launches and writes golden C# receipt | Signed iPhone distribution, physical hardware, arm64 performance |
| Native AOT/trimming | Separate optimized build/compatibility tests | Default Debug simulator builds |
| Real hardware | Exact versioned app installed on named iPhone and Android phone | CI VM or desktop browser |

The iOS .NET workload **must match Xcode**; environment versions/logs are retained in the GitHub Actions run. The iOS job deliberately uses a macOS-26 runner with a 10.0.3xx SDK series to test Xcode 26 compatibility. If the runner/workload mismatch breaks the build, record `BLOCKED` and investigate the smallest compatible version change; never quietly call it a pass.

No final native UI toolkit has been selected. Do not alter `main`, Pages, V1, `old/`, the architecture branch, N00 upstream PRs #444/#445/#446, Physics #440, legacy Lava #432 or demo art. N00 is not ACCEPTED until both OS native execution gates and required remaining contract/portability controls have evidence.
