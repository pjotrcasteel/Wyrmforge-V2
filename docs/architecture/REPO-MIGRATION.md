# Migration ledger — browser prototype to new C# V2

Date: 2026-11-22. Migration implementation remains in a **review branch**, not the shared default branch.

## What moved

All 495 legacy Git blobs from the original V2 source snapshot (main at a2d7713f91d046d374734ce638c297db8be086ad) were relocated to old/ by reusing their **exact same blob SHA**, with 495 old-path deletions. This includes art, docs, Node tests, workflow configuration, scripts and browser entry points. Existing docs/NATIVE-MOBILE-ENGINE-MAP.md and docs/architecture/ADR-0003-csharp-core-swappable-frontends.md from the prior architecture PR are kept as new root documentation.

The move is a source archive, not a rewrite of the archived files. The old preview workflow moved too; no historical WebGL Pages deployment is initiated from this new branch.

## What is new

A fresh .NET 10 solution with one project per major engine owner, host-neutral contracts, an explicit presentation contract and development-test scaffolds. The early C# Voxel and WorldGen experiments are *new* implementations; none of old/ or V1 is compiled in.

## Risks and recovery

- Merge will retire the old JavaScript build/Pages workflow; previous Pages content may remain visible until replaced, but must not be presented as current new C# build evidence.
- Historical PRs that still alter root src/, tests/ or docs/ will conflict with this migration; merge/cutover must be coordinated.
- Recovery: main at the pre-migration commit remains unchanged; the archived blob SHAs also preserve exact historical content.
- A signed iOS app, Android APK and new .NET WASM Pages host are not yet implemented. Do not mark them complete.
- GitHub may show thousands of 'rename' changes; review critical SHA identity and new source separately.
