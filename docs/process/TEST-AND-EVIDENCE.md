# Wyrmforge V2 — verification contract and 99% self-testing plan

**Every engine owner must implement and verify its own behaviour.** CI, headless simulation and reproducible journeys are the default; the owner is not the primary test runner.

## What 99% means

This is a workflow goal: the assistant should perform **nearly all routine implementation, automated testing, debugging, evidence gathering and CI repair** without asking the owner to execute scripts or diagnose failures. It is **not** a measured test-coverage promise, an assurance that 99% of failures are detectable, or a reason to invent real-device evidence.

Human input is reserved for inaccessible Apple signing/device setup, platform permissions that only the owner can grant, and subjective game-feel or visual acceptance. State explicitly when this remains outstanding. If an automated check cannot be run, it is **NOT RUN / BLOCKED**, never PASS.

## Test pyramid and expected triggers

| Test suite | Mandatory checks | When |
| --- | --- | --- |
| C# unit / invariants | Signed microcells, 1m/100mm scale, boundaries, no-op/duplicate commands, invalid state, actor abilities and all owner state transitions | Every affected-engine PR |
| Engine contracts | Fake/stub ports, independent assembly compile, versioned DTO compatibility, errors, epoch/revision, cancellation/unsubscribe/reset | Every contract change |
| Architecture import audit | No engine->other-engine implementation references; only composition root wires concrete types; no frontend import in core; no runtime imports from `old/` | Every PR |
| Deterministic replay | Same seed, commands and content versions -> equal canonical result; mismatches include seed/tick/owner; no hidden frame-rate dependency | Every PR touching simulation |
| Cross-engine integration | At least one real next-neighbour plus at least one replaceable fake; committed change reaches dependent consumers once, no stale callbacks | Every relevant PR |
| Headless Hunt journey | Start, travel, horde, upgrade, branch, Ashfang phases, victory/extraction or defeat, save and permanent progression | Every PR after N05 fixtures exist |
| Adversarial/stress suites | Worldgen varied seeds, chunk eviction, repeated explosions, water breaches, object support, duplicate events, inaccessible paths, interrupted save | Milestone CI + scheduled CI once authorized |
| Browser E2E | Browser loads real compiled Blazor WASM C# simulation, accepts input, displays scene snapshots in HEX shapes, presents view-model changes | Every presenter/host PR |
| Native smoke/build | Same C# assembly executes in installed iOS and Android hosts; AOT/trimming/signing/startup and command result matching | N00 feasibility, then host changes |
| Physical device performance | Named phone, build SHA, 10+ minute realistic Hunt, CPU/GPU p50/p95/p99 frames, hitches, memory, power/thermal, suspend/resume | Native milestone and release; not replaced by desktop or browser CI |

**Ordering:** unit -> contract -> integration -> replay -> web E2E -> native as applicable. Failures at lower levels must be corrected before expanding the game. Tests must use real contracts and observable outcomes rather than fragile internal implementation mirrors.

## Critical golden journeys

### PHYS-001: Capability-aware movement

A full 1m ledge blocks Wizard/Hollowed given their movement rules but allows capable Ashling/Wolf jump movement when explicitly configured. Negative coordinates, ceilings, drops, support removal and streaming updates must not create pass-through. Physics and Navigation consult the same published capabilities.

### VOX-001: Physical Fireball crater

C# Combat requests legitimate impact -> C# Terrain commits changed microcells once -> Physics collider queries reflect actual hole -> Mesh/Navigation/Fluids invalidate by revision -> browser/native presenters draw corresponding HEX geometry, never a cosmetic fake. Duplicate/late edits do not reapply.

### HUNT-001: Complete Fire Tier-I

Select Fire Tier I -> seeded region -> progression waves and recoveries -> XP/temporary choice -> meaningful route decision -> Ashfang entrance/telegraphs/phase transition -> victory -> legitimate extraction -> secured materials/Arcane Web eligibility -> reload proves same progress and no duplication.

### HUNT-002: Failure and lifecycle

Kill Wizard, abandon, restart mid-load, replay duplicate kill rewards, load stale world revision and try bypassing a locked route. Verify no false victory, impossible reward or unreachable mandatory objective.

### HOST-001: Renderer substitution

Replay the identical command stream with a null presenter, Pages presenter and mobile adapter. Authoritative state hashes match (or documented platform numeric tolerances). Disabling visual updates does not stop the simulation.

## Every PR must provide this evidence object

```yaml
task_id: Nxx-yy
branch: <exact branch>
commit_sha: <full SHA>
authorized_scope: <explicit user-approved outcome>
changed_modules: [<owners and paths>]
contract_versions: [<ports and changes>]
unit_contract_integration: {status: PASS|FAIL|NOT_RUN|BLOCKED, details: <command, counts, link>}
replay_stress: {status: PASS|FAIL|NOT_RUN|BLOCKED, details: <seed and link>}
web_e2e: {status: PASS|FAIL|NOT_RUN|BLOCKED, details: <real compiled WASM build URL>}
native_ios: {status: PASS|FAIL|NOT_RUN|BLOCKED, details: <device, app build, evidence>}
native_android: {status: PASS|FAIL|NOT_RUN|BLOCKED, details: <device, app build, evidence>}
performance: {status: PASS|FAIL|NOT_RUN|BLOCKED, details: <p50 p95 p99 memory thermal>}
open_failures: [<specific and reproducible>]
next_task: <exact one ID or STOP>
```

This is a documentation format, **not a claim** that current tests passed. A PR with open acceptance issues can be IMPLEMENTED but cannot be ACCEPTED.

## Test quality and automation policy

- Prefer assertions on published owner contracts and state hashes, not screenshots or log-string presence.
- Include at least one negative/failure case for every new authority and command.
- Use bounded seeded test catalogs for PRs and wider reproducible stress runs for milestone CI; print failing seeds so they can be replayed.
- Do not cherry-pick fast hardware or hide low-percentile framerate failures. A 60 FPS target is approximately 16.67ms per frame across **all** work.
- Never report "CI green" without checking the actual run associated with the **exact current PR SHA**.
- CI results, browser screenshots, native build receipts and physical device performance are separate evidence categories.
- No demanding routine manual tests from the owner when automation can reproduce the scenario.

## Gating visual polish

Before N08: no detailed sprites, texture atlas, normal maps, fancy particles or lighting polish. Primitive HEX colors are a presentation policy and should be guarded by automated asset/dependency checks when authorized. A test proving renderer boundaries must not require decorative assets.