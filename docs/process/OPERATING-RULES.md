# Wyrmforge V2 — binding development agreement

**Status:** owner-approved workflow direction, documented 2026-11-22.  
**Applies to:** every subsequent chat, contributor, branch, issue, PR and engine module.  
**Scope of this documentation PR:** operating rules and planning only. **It does not authorize engine implementation.**

## 1. Source of truth and authority

1. Latest explicit owner instruction governs the task and can change a requirement; reconcile the documentation before proceeding with a conflicting implementation.
2. This document, the single [new C# roadmap](../architecture/IMPLEMENTATION-ROADMAP.md), [verification contract](TEST-AND-EVIDENCE.md), [session protocol](SESSION-PROTOCOL.md) and architecture ADRs govern execution.
3. Live GitHub refs, changed files, commits, PR state and CI runs govern **what has actually been done**. Never infer completion from a prior chat or copied summary.
4. `old/` and Wyrmforge V1 supply **read-only references**, not writable authorities and not a production engine dependency.
5. The checkpoint ledger `WORK-STATE.md` helps locate work but may be stale. Reconcile it against actual GitHub before reporting status.

**The roadmap defines planned intent; only evidence establishes implementation or acceptance.**

## 2. Authorization and protection against scope drift

**One-word `continue` is an explicit instruction to advance the uniquely identified already-authorized task/milestone.** Within that scope, implement, fix, self-test, commit and checkpoint independently without requesting permission for each ordinary next step. Move to the next subtask only if included in the previously authorized milestone; never start a new unauthorized milestone or merge/deploy. See [CONTINUE-POLICY.md](CONTINUE-POLICY.md).

**No implicit "go".** A user asking to map architecture, create folders, review, discuss, or document does NOT authorize coding, tests that mutate production data, migrations beyond the requested scope, merging PRs or deployment. Explicitly scoped instructions are required for those actions. When authorization is unclear, remain read-only or documentation-only and say exactly which action is not authorized.

For an authorized task, write a task contract before editing:

- `Task ID`, measurable player-facing or foundation outcome, permitted modules/files, forbidden modules/files, interfaces touched, prerequisites, and expected evidence.
- One task, one owner, one reviewable PR. Separate follow-up bugs and feature requests rather than silently broadening a task.
- A high-severity blocker may justify a separately proposed fix, **not** an unapproved rewrite.
- Before touching shared files, inspect open PRs and parallel chat work; avoid concurrent ownership of a file/engine. Never force-push or overwrite unrelated branches. Rebase/merge only with explicit authorization and conflict audit.
- Never merge, deploy, delete old source, restructure projects or select a native frontend framework without authorization specific to that action.
- If work pauses, capture the current factual state; do not silently continue later.

A successful CI run is a signal to **review acceptance**, not a license for the assistant to expand scope.

## 3. Locked Wyrmforge architecture

- New **C# domain and simulation engines**, authored clean-room from behaviour and requirements. Do not copy/port V1 or archived V2 implementation into new C# modules.
- Modular single-process runtime; engine libraries depend on `Contracts` only, never other engine implementations. An explicit Composition root injects concrete ports.
- One source of truth for each state: Terrain solids/edit log; Physics actor/contact; WorldGen initial recipe; Fluids flow; AI agent intentions; Encounters spawns/phases; Combat damage; Hunt route/outcome; Progression rewards; Save snapshots.
- Commands are intentions; owner engines commit changes; immutable revisioned events and render snapshots describe facts. Enforce stable IDs, world epoch, command ordering/idempotency, deterministic seeds, unsubscribe/reset and bounded allocations.
- **Backend means C# game authority, not a hosted server.** Pages hosts Blazor WASM assets; C# runs in the browser. The native iOS/Android hosts must execute the same game rules with their own frontend adapters. A wrapped website does not satisfy the native requirement.
- Never allow rendering, browser JS or GPU code to decide damage, collision, enemy AI, spawns, loot, terrain or water. Visual interpolation is allowed only without changing game state.
- Genuine destructible 3D terrain with 1m blocks and 10x10x10 microvoxels; Physics and Navigation must respect actor capabilities. The Wizard/Hollowed cannot casually climb a 1m voxel; suitable Wolf/Ashling abilities may.
- A complete **Fire Tier-I Hunt** (start, connected expedition, waves, decisions, Ashfang, extraction, permanent progression and restart) is the priority gameplay deliverable.
- **Until N00–N07 are accepted, render with solid HEX #RRGGBB and primitive geometry.** No textured materials, elaborate sprite pipeline, lighting polishing or art work. Rendering must remain replaceable by swapping the presenter.

## 4. Development discipline

- Use pure .NET projects, explicit interfaces, small classes, nullable enabled, strong types for units and stable IDs, clear error semantics and XML summaries for public APIs.
- Keep C# readable and focused: braces, no nested ternaries, minimal global state, no engine-specific static singletons, no long-lived duplicate authorities.
- Never introduce browser, native GPU or presentation dependencies into game engine assemblies. Avoid assuming `.NET 10` APIs work on a native AOT backend without cross-host proofs.
- Test determinism and replay with fixed seeds and ordered commands; sort unordered canonical data before hashing; capture version and known acceptable numeric tolerances.
- **Build a vertical slice, not a polished isolated lab.** Every milestone must demonstrably advance the Hunt and preserve established flows.
- Optimize only from named-device measurements; account for CPU frame, GPU frame, allocation, memory, thermals, battery, background/foreground and sustained sessions. Target 60 FPS on supported devices; a 16.67ms frame budget is not proof that it is met.
- Protect older code and parallel work; never silently "clean up" code unrelated to the task.

## 5. Assistant-owned 99% testing workflow

"99%" is a **goal for minimizing the owner's manual work**, not a measured coverage guarantee. The assistant must create/run local and CI unit, contract, integration, deterministic replay, stress, browser E2E and native build/real-device checks whenever the environment permits.

Do not ask the owner to run repetitive scripts that CI or the assistant can run. Ask for human work only when it inherently needs credentials/hardware, a real-device action unavailable to automated tooling, subjective gameplay feel or final artistic acceptance. If any required environment is inaccessible, mark that proof **BLOCKED**, do not claim it passed.

See [test and evidence gates](TEST-AND-EVIDENCE.md) for the mandatory matrix.

## 6. Completion vocabulary

| Status | Meaning |
| --- | --- |
| PLANNED | Architecture/task exists; work is not authorized or not started |
| AUTHORIZED | Owner explicitly approved a specified task/scope |
| IN PROGRESS | Code/docs changed on named branch; still incomplete |
| IMPLEMENTED | Relevant code merged and automated checks actually passed |
| NEEDS PLAYER REVIEW | Runnable evidence is prepared for subjective acceptance |
| ACCEPTED | All scoped functional, contract and platform gates have trustworthy evidence |
| BLOCKED | An explicit failing/unavailable dependency prevents the next step |
| SUPERSEDED | Replaced by linked approved task, with rationale |

Never claim a scaffold, static picture, CI green badge or merged code is **ACCEPTED**. A Pages test cannot satisfy a native device gate.

## 7. Required change checklist

Every PR/task report answers: `What changed?`, `Who owns this state?`, `What other engine contract changed?`, `What did we not change?`, `What tests were actually executed?`, `What failed or remains unverified?`, `What is the next authorized task?`

This agreement must be explicitly reviewed in any future architectural change. A different chat cannot quietly supersede it.