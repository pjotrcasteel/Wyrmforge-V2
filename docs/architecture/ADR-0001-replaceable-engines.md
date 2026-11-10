# ADR-0001: Replaceable Engines Through Stable Contracts

- **Status:** Accepted
- **Date:** 2026-11-10
- **Scope:** Wyrmforge V2 and future engine versions

## Context

Wyrmforge consists of several evolving systems: voxel terrain and destruction, physics and collision, lighting, VFX, audio, navigation, rendering, procedural world generation, and gameplay orchestration. We expect to replace or substantially rewrite individual engines as mobile performance, visuals, and gameplay requirements evolve.

Direct imports between engine implementations, shared mutable internals, and renderer-specific gameplay rules make replacement risky. At the same time, splitting every engine into an independently deployed service or package would add unnecessary complexity and runtime overhead, particularly on iOS and Android.

## Decision

**Every major engine must be replaceable behind a stable, explicitly versioned contract without rewriting gameplay or unrelated engines.**

We will build **modular engines within the same application runtime**, not independent network services. Each engine owns its implementation details and internal state. Gameplay and orchestration depend on public contracts, not concrete engine classes.

An integration/composition layer selects implementations, injects dependencies, manages lifecycle, and routes commands and events. Cross-engine communication occurs through narrowly scoped, versioned interfaces and immutable data transfer objects. Engines must not import another engine's private modules or mutate another engine's state.

The voxel engine owns authoritative terrain data and terrain edits. Physics owns movement and collision response; lighting owns light/shadow calculations; navigation owns pathfinding; VFX and audio own their presentation; rendering owns drawing; world generation produces terrain through a supported world-construction contract. Gameplay owns game rules, spell outcomes, and progression, not voxel storage or mesh implementation.

**Reuse the existing V2 terrain integration/event mechanisms where they meet these boundaries.** Do not create a second event bus or parallel terrain authority merely to implement this ADR.

## Example: Fireball Impact

1. Gameplay determines that a fireball has hit and submits a terrain-damage command through the terrain contract.
2. The voxel engine validates and applies the edit, then publishes a versioned terrain-change notification through the existing integration boundary.
3. Physics and navigation react to changed collision/obstacle data through their adapters.
4. Lighting, VFX, audio, and rendering react through their own adapters as appropriate.
5. None of these consumers reads the voxel engine's private chunk arrays, damage ledger, or meshing implementation.

## Contract Requirements

- Explicit interface/schema versioning and documented compatibility rules.
- Stable coordinates, units, ordering, ownership, and error semantics; no engine-specific objects in public payloads.
- Commands have a single authoritative owner; events describe committed facts, not instructions to mutate another engine's private state.
- Bounded work, deterministic ordering where required, and mobile-conscious allocation/performance budgets.
- Subscription disposal, engine startup/shutdown, and reset/reload semantics are explicit.
- Adapters translate between contracts and concrete engines; avoid bidirectional implementation dependencies.
- No silent coupling via global mutable singletons or direct DOM/WebGL access from gameplay logic.

## Verification / Acceptance Criteria

1. A mock or reference implementation can replace each major engine at the composition boundary.
2. Contract tests run against both the production adapter and its mock/reference implementation.
3. A terrain edit reaches registered consumers once, in the documented order, without consumer access to private voxel data.
4. One consumer may be disabled or replaced without breaking unrelated engines.
5. Engine reset, scene reload, and unsubscribe do not leak listeners or deliver stale events.
6. Existing collision, destruction, replay, and mobile performance acceptance tests remain green.

## Implementation Plan

- **V2.6:** Inventory current V2 integration points; define the minimal contracts and composition root; add replaceability and lifecycle tests. Adapt existing terrain event plumbing rather than duplicating it.
- **V2.7:** Validate mobile performance and lifecycle behavior with real and substitute adapters.
- **V2.8:** Build the first playable Hunt using the contracts; keep gameplay independent of concrete engine implementations.

## Consequences and Trade-offs

**Benefits:** Engines can evolve independently; tests can substitute lightweight implementations; integration failures become easier to isolate; gameplay survives engine rewrites.

**Costs:** Additional adapter code, version migration discipline, and contract tests. Contracts must remain deliberately small to avoid premature abstraction.

**Non-goals:** Microservices, separate deployment per engine, a generic plugin marketplace, a new event bus, or rewriting stable V2 foundations solely to satisfy a new abstraction.

## Enforcement

A change that requires gameplay to import a concrete voxel/physics/lighting/rendering implementation, or requires one engine to mutate another's private state, must be redesigned or explicitly recorded as an exception in a subsequent ADR.
