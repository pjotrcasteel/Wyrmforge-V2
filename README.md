# Wyrmforge V2 — clean-room C# game engines

**Architecture migration in progress.** This branch establishes a new independent C# engine codebase. The complete previous JavaScript/WebGL V2 implementation is preserved under [old/](old/). It is not imported into the new runtime.

## Mandatory development rules and authorization

**Every new chat or contributor must start with [AGENTS.md](AGENTS.md), the [process index](docs/process/README.md) and the [handover standard](docs/process/HANDOVER-STANDARD.md).** The [single N00–N08 roadmap](docs/architecture/IMPLEMENTATION-ROADMAP.md) and [test/evidence requirements](docs/process/TEST-AND-EVIDENCE.md) are authoritative for new C# development.

Planning and documenting do **not** authorize implementing engines. An exact task scope must be explicitly approved before coding. PRs are not automatically merged. GitHub's current refs and CI, not an old chat summary, determine what is actually implemented.

**Assistant handles routine tests and CI whenever possible; the user is not the regression-test runner.** Keep presentation HEX-only until N08. Native iOS and Android are non-negotiable release targets.


## Release separation approved — 2026-11-22

The user explicitly approved a **deferred `main` / GitHub Pages cutover**: retain the current playable JavaScript site and existing legacy Lava PR #432 as-is, while future approved N00 C# work proceeds independently from the architecture branch. PR #439 remains unmerged to `main` until a genuinely playable/usable compiled Blazor WASM frontend exists and a separate release review authorizes the switch. The draft Physics PR #440 and DRILL PRs #442/#443 are not part of this integration. This does **not** grant N00 implementation approval.

## Locked direction

- The game backend means **authoritative C# simulation**, running locally in the host (Blazor WebAssembly on GitHub Pages during development; native C# host on iOS/Android at release). GitHub Pages does not run a C# server.
- Every engine is a separate C# assembly with a small public contract. Different engines can be replaced independently. Frontends send actions and render read-only snapshots; they never own gameplay state.
- Begin from a **complete Hunt behaviour checklist** based on V1: entry, travel, horde, upgrades, Wyrm, extraction and persistent rewards. Do not copy any V1 or legacy V2 runtime code.
- While building the new game, **all visible worlds use primitive geometric shapes and literal #RRGGBB HEX colors**. No approved art or complex visual features are necessary to prove a gameplay milestone.
- Native iOS and Android remain release targets. A web demo is not evidence of native delivery. Validate the same C# core in both hosts early.

## New source

- [Engine architecture](docs/architecture/ENGINE-OWNERSHIP.md)
- [V1 first-Hunt behaviour requirements](docs/architecture/V1-FIRST-HUNT-PARITY.md)
- [Frontend/backend contract](docs/architecture/FRONTEND-BOUNDARY.md)
- [HEX and primitive presentation rule](docs/architecture/PLACEHOLDER-WORLD.md)
- [Migration and build plan](docs/architecture/IMPLEMENTATION-ROADMAP.md)
- [Legacy archive mapping](docs/architecture/REPO-MIGRATION.md)
- C# projects and solution: [game/](game/); new web and mobile hosts: [frontends/](frontends/).

The first compiled slice consists of independent C# contracts, a minimal terrain occupancy authority and deterministic placeholder site generation. **All other C# engine projects are boundary scaffolds, not implemented engines.** No new playable Hunt or native app is claimed.

## Build (requires .NET SDK 10)

    dotnet restore Wyrmforge.V2.slnx
    dotnet build Wyrmforge.V2.slnx --no-restore
    dotnet test game/tests/Wyrmforge.V2.Foundation.Tests/Wyrmforge.V2.Foundation.Tests.csproj --no-restore

CI runs these commands on the migration branch. This does not publish to GitHub Pages until the new C# WASM frontend exists.

## Historical reference

V1: https://github.com/pjotrcasteel/Wyrmforge  
Archived V2 browser experiments: [old/ARCHIVE.md](old/ARCHIVE.md)  
New architecture ADR: [ADR-0003](docs/architecture/ADR-0003-csharp-core-swappable-frontends.md)
