# Enemy AI & Encounter V2 — extensibility contract and V1 lessons

**Decision:** 2026-11-20, owner's direction. **Status:** architecture proposal / planning, not runtime implementation or phone acceptance.  
**Tracking:** [A11-ARCH #436](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/436) · [A11-02 navigation #435](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/435) · [AI roadmap](AI-ENCOUNTER-V2-ROADMAP.md).

## Player experience

Regular Hollowed, Ashlings and future species should feel different: most are melee, some ranged; some mindlessly chase, some flank with a pack, and others can lose courage and flee or regroup. A small, configurable chance may promote **any eligible regular species** into a visually identifiable rare with one meaningful gameplay twist and distinctive reward. Optional, unusually rare Reliquary-style events, guardian / Warden mini-bosses and Wyrm bosses are **separate encounters**, each potentially multi-stage. Even advanced Wyrms must telegraph and provide counterplay instead of reading player controls or spawning invisible hits.

Do **not** conflate:
- **Archetype:** what creature this is, its default role, attacks, movement capabilities and ecology.
- **AI sophistication / temperament:** how it decides using earned information, e.g. instinctive, reactive, tactical, adaptive, masterful; bold, cautious, panicked.
- **Rarity:** an independent per-instance modifier, e.g. normal vs one optional rare affix; not a new creature class or AI tier.
- **Encounter class:** wave, ambush, optional Reliquary, guardian Warden, Wyrm; determines composition, scripting, phases and rewards.
- **Context:** biome, corruption, journey/Wyrm tier and seed; modifies eligibility and pace, not ownership boundaries.

A "tier" in the world-map/Wyrm progression, intelligence capability, elite rarity, or boss phase is a different field. Never compress these into one `enemyTier` integer.

## Source-grounded Wyrmforge V1 audit

| V1 evidence | Retain in V2 | Explicitly avoid |
| --- | --- | --- |
| [Enemy catalog and roles](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Domain/Combat/Enemies/EnemyCatalog.cs), [pack recipes](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Application/Runs/Simulation/Enemies/EnemyPackRecipe.cs) and [director](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Application/Runs/Simulation/Enemies/EncounterDirector.cs) | Biome-aware compositions, pressure/support/artillery/ambusher roles, breathing room, role-sensitive waves | Creature-specific world generation, a single director that also owns creature movement |
| [V1 enemy AI inventory](https://github.com/pjotrcasteel/Wyrmforge/blob/main/docs/engineering/enemy-ai-inventory-2026-10-25.md) | Distinct Hollow chase, Hound feint/pounce, pack staggering and meaningful reaction | Omniscient player position every tick, Whitefang reading intended input, pretending ID parity is actual coordination |
| [V1 EnemyState](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Domain/Combat/Enemies/EnemyState.cs) and [RunSimulation.Enemies.cs](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Application/Runs/Simulation/Enemies/RunSimulation.Enemies.cs) | Stable actor identity, authoritative physical outcomes, animation commitments | One common actor class with a hard-coded state property for every new species, or ever-growing per-kind switches in host/simulation |
| [V1 elite affixes](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Domain/Combat/Enemies/EliteAffix.cs) and [elite roll](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Application/Runs/Simulation/Enemies/RunSimulation.Elites.cs) | Readable single-specialty power, rare independent seed, encounter caps, one reward on defeat | Copying an archetype for each elite, uncontrolled cumulative affixes, RNG that alters ordinary spawns |
| [Reliquary rites](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Domain/Combat/Enemies/Behaviors/ReliquaryBehaviorState.cs), [Warden phases](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Domain/Combat/Enemies/Behaviors/BellWardenBehaviorState.cs), [Ashfang action selector](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Domain/Combat/Dragons/AshfangBehaviorState.cs) | Telegraph → committed action → recovery; authored half-health phase transitions, target lock at warning, phase-constrained tactics | Boss AI changing phases unilaterally, re-aiming committed strikes, surprise damage during a transition |
| [AI0–AI6 plan](https://github.com/pjotrcasteel/Wyrmforge/blob/main/docs/design/unified-agent-ai-milestones.md) and [implementation evidence](https://github.com/pjotrcasteel/Wyrmforge/blob/main/docs/engineering/ai2-ai6-implementation.md) | Bounded observation/memory, seeded staggered decisions, fair global attack leases, replay/inspector, real-device profiling gate | Assuming an unsampled LOS tick means sight lost; measuring hit damage before it is resolved; calling browser tests a phone pass |

V1 had a 10% per-eligible-node elite chance and a distinct ~6% per-hunt-map Reliquary event; these are **historical reference values, not V2 balance defaults**. V1's Bell Warden and Reliquary both perform distinct mid-fight phase changes. Its AI0–AI6 artifacts document iterative opt-in migrations and still-open device evidence: this audit does not claim V1 reached complete design/runtime parity.

## V2 engine boundaries

```text
World Map / Journey   -> encounter context (biome, influence, tier, seed)
WorldGen              -> safe spawn anchors, walkable geography, optional encounter landmarks
Physics/Voxel/Objects -> observed movement/collision and revisioned spatial queries
                            |
Play Hunt composition -> Sensor snapshots -> AI Agent decision -> movement/ability intent
                            |                    ^
                            |                    |
Encounter Director --> spawn profiles / pack tactics / boss phase permissions
                            |
Combat / Abilities   -> validates and commits windup, attack, damage requests, recovery
                            |
Authoritative world / health -> results, deaths, terrain revisions, outcomes
                            |
Presentation         -> reads snapshots for sprites, telegraphs, light, sound, reward cues
```

Ownership invariants:

1. **AI Agent** has immutable sensed observations, short-lived target memory, decision budgets and serializable behavior state. It returns an **intent**, not a position mutation, hit, projectile, spell effect or render call.
2. **Navigation/sensing** samples versioned read-only Voxel/Physics/World Objects providers; AI receives only what sensors detected. It does not use raw player buttons, exact offscreen targets, a duplicate collision map, or its own raycast truth. A11-02 owns its limited local budget.
3. **Combat/ability executor** accepts an intent and authoritative validation, commits telegraph/target geometry, cooldown and attack timeline; returns events/outcomes to AI. Commitments tick every fixed simulation step even if policy evaluations are staggered. Damage and collision remain outside AI.
4. **Pack coordinator** has explicit pack IDs, role reservations (chaser/flanker/harasser/support), *observed* shared signals with expiry, limited simultaneous attack leases, morale/retreat/regroup, deterministic and fair lease rotation. Agents not in a pack work on the same AI runtime.
5. **Encounter Director** selects spawn groups within threat budgets and zone constraints, roll/cap policies, event boundaries, corruption pressure, and victory/withdrawal. No direct AI steering, terrain edits, art calls or damage resolution.
6. **Boss phase controller** owns a versioned, persisted state graph, transitions, permitted ability set, timeouts, interruption policy, adds/hazards and player objective. Boss AI chooses only among the currently permitted abilities. Event/ability handlers invoke other engine contracts instead of directly mutating them.
7. **Rarity selector** is stateless for a given context, with its own deterministic seeded stream/hash. Rolls must not consume ordinary spawn RNG, and eligibility/caps must exclude bosses, guardians, event wards/adds and summons unless explicitly authored. Rare status is an overlay with cosmetic descriptor, one readable affix, bounded stats/behavior alteration and reward request. Rarity should be configurable per habitat/threat tier and tested statistically, not hard-coded into each species.
8. **Rendering/Lighting/VFX** consume events and agent/encounter snapshots only. Render-specific animation frame choice never changes a combat decision. Sound/visual telegraphs must reflect the *committed* hit geometry.
9. **Save/replay** persists stable IDs, archetype + rarity overlay, RNG streams, blackboard/memory ages, pack roles/leases, phase + pending commitments, and epoch/revision; restore and unload/reset must not duplicate hits, rewards or boss transitions.

A new species registers a small archetype profile + optional ability and behavior policies; existing AI scheduler, pack coordinator, rarity roll, WorldGen, physics, lighting and encounter host need **no kind-specific edits**. A new multi-stage boss registers a phase graph and isolated special-event adapters, not branches in the generic enemy loop.

## Data-driven design example (illustrative, not yet implemented)

```json
{
  "schema": "wyrmforge.enemy-archetype.v1",
  "id": "ashling",
  "role": "skirmisher",
  "movement": "grounded",
  "sensing": "short-sight-hearing",
  "brain": "reactive",
  "temperament": "bold-until-morale-break",
  "abilities": ["claw", "dash", "recover"],
  "pack": { "allowed": true, "roles": ["chaser", "flanker"] },
  "rare": { "eligible": true, "affixPool": ["packblood"] }
}
```

The rare instance becomes `{archetypeId: "ashling", variantId: "packblood", instanceId: ...}`, not `PackbloodAshlingState`. The regular enemy still has its identity, melee kit and anatomy; the affix grants one distinguishable tactical modification. A future ranged enemy selects its ranged ability kit and range-control policy without being a separate AI engine.

For a Warden, the encounter phase graph could be `arrival -> bell_intact -> cracked_transition -> broken_bell -> defeated`. It may offer smash/toll/rally in the first phase and adjusted ability constraints after the crack. Crossing half health cancels the current windup safely, produces a readable stun/window and advances **once**. Similar authored phase graphs serve Reliquaries and Wyrms without imposing the same attacks on all bosses.

## Delivery sequence and acceptance

- **Now: A11-02 #435.** Finish terrain-aware LOS and local navigation inside its published scope, without changing the Wave schedule.
- **A11-03:** add registry + generic AI observation/intent + ability execution interfaces, demonstrate at least two clearly different ordinary species (melee versus ranged or fleeing), with tested action commitment and no host per-kind branch.
- **A11-04:** cooperative pack role reservations, morale/rout/regroup, global fair attack-pressure budget and corruption-driven encounter composition.
- **Proposed A11-05:** rarity overlay across eligible regular species, seeded/capped low-frequency roll, one trait/affix and unique reward signal, real Hunt visual feedback and deterministic statistics.
- **Proposed A11-06:** optional rare Reliquary, guardian Warden, and authored multi-stage Wyrm controllers, proof of phase interruption, adds, death/retreat, re-entry and no duplicate reward.
- **A11-99:** dependency/cycle checks, read-only engine contract audit, seed/save/reload and mobile endurance acceptance. Do not promise real phone evidence without testing real iPhone Safari and Android Chrome.

Representative regression scenarios: unseen/occluded player cannot be tracked precisely; destroyed voxel clears blocked LOS; three pack hunters do not all commit at once; attacker leases rotate without starvation; frightened actors flee/regroup and do not attack during rout; ranged actors retreat without ghosting through a cliff; rare roll distribution remains stable across thousands of seeds and doesn't perturb wave RNG; boss threshold skips/reaches phases correctly even with big damage and interrupt; no invisible hit on a phase shift; every defeat pays exactly once. Include scenario replay and bounded per-step query counts.

**Non-goal:** copying V1's C# agent runtime or boss code into V2. Transfer mechanics, tests, fairness decisions and documented mistakes only. Play Hunt remains the only integration owner.
