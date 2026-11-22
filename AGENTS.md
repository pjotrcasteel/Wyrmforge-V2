# Wyrmforge V2 — mandatory agent entrypoint

**Read this file first on EVERY new chat, work session, PR, and task continuation.** Then open the files listed below from the CURRENT branch/commit, not from memory, old conversations, a downloaded handover or a stale PR. Do not claim to have read a document you did not fetch.

Read in this order:
1. `docs/process/OPERATING-RULES.md` — authorization, immutable product constraints, scope and the definition of done.
2. `docs/architecture/IMPLEMENTATION-ROADMAP.md` — the ONLY current new-C# development sequence (N00–N08).
3. `docs/process/TEST-AND-EVIDENCE.md` — tests the assistant must run before user review.
4. `docs/process/SESSION-PROTOCOL.md` — mandatory preflight, parallel-work check and evidence-based handover.
5. `docs/process/HANDOVER-STANDARD.md` and `docs/process/CONTEXT-LOSS-RECOVERY.md` — GitHub-first handovers, rolling checkpoints and recovery when the prior chat cannot reply.
6. `docs/process/WORK-STATE.md` — navigation index only; reconcile it with GitHub's real branch/PR/CI state.
7. Task-owned architecture, contracts and V1 Hunt acceptance documents identified by the selected milestone.

## STOP: authorization gate

- **Architecture discussion and planning are NOT authorization to implement.** The user must explicitly instruct implementation of a named task/milestone or authorize a clearly scoped development action.
- Without that instruction, make ONLY the requested documentation/review changes. No engine code, migration execution, deployment, PR merge, branch cleanup, asset generation or speculative refactor.
- PR creation is not a merge authorization. Never auto-merge, even when checks pass.
- A task is limited to its allowed files and acceptance criteria. Discoveries outside scope become separately described blockers/issues, not unsanctioned work.
- Never rewrite work from another active chat. Inspect PR/branch ownership before touching files.

## Locked product rules

- **Brand-new clean-room C# engine implementations.** V1 and archived V2 are read-only behavioural/engineering references, NOT code to copy or translate.
- Exactly one authoritative state owner per domain. Engine implementations depend on shared contracts, never other engine implementations. Only composition/bootstrap knows concrete classes.
- Frontends are replaceable: Blazor WebAssembly/Pages for development and actual native iOS/Android applications at release. They only submit player intentions and present read-only C# snapshots. No browser-owned simulation, no WebView-only native release.
- Real 3D destructible terrain; one-metre blocks with ten 100mm microcells per axis where fine geometry is required; fixed 2.5D readable camera.
- **HEX-only primitive geometry until N00–N07 acceptance.** No textures, final sprites, shader/lighting polish or decorative VFX prior to N08.
- Preserve the **complete V1 Fire Tier-I Hunt** as the product-behaviour acceptance target, not as reused implementation.
- The archive under `old/` is immutable and excluded from production builds.
- Performance target is 60 FPS on declared supported real phones, verified separately on iOS and Android, not assumed from desktop/Pages.

## Required work output

Start every authorized task with an evidence-based **preflight**: current SHA/branch, active ID, explicit user authorization, allowed/forbidden files, neighbours/contracts, existing PRs, acceptance tests and known blockers.

On handover, use [the single-file checkpoint template](docs/process/HANDOVER-TEMPLATE.md) and [handover protocol](docs/process/HANDOVER-STANDARD.md). An old chat summary or ZIP never overrides the live repository and does not transfer authorization to a new task.

Finish with an **evidence report**: changes/commit/PR, tests actually run and outcomes, CI link/status, real-device evidence or explicit absence, remaining failures, and ONE next recommended task. Update WORK-STATE only for a verified meaningful checkpoint. If a tool cannot access necessary evidence, state BLOCKED/UNKNOWN and do not guess.

**These instructions guide future agent work; they are not a replacement for code-level CI enforcement.** Introduce stronger automated policy gates in an explicitly authorized implementation task.