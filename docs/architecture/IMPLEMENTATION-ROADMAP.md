# Wyrmforge V2 — one authoritative clean-room C# delivery roadmap

**Product:** native iOS + Android games, C# simulation authority, interchangeable browser/native presenters, 2.5D pixel-first look over real 3D destructible voxel geometry.  
**Current work authorization:** documentation/architecture only. Do NOT infer that this roadmap authorizes implementing N00 or any other engine.  
**Previous R0–R5 narrative:** superseded by N00–N08 for all new C# delivery tasks; keep old JS milestone histories under `old/` for reference only. Do not reuse old task IDs.

## At-a-glance order

| ID | Delivery track | Why it comes here | Exit criterion (not a mere file count) |
| --- | --- | --- | --- |
| N00 | **Contracts, fixed-step C# session and Test Harness** | If replay and portability fail, all later engines become harder to verify | Headless deterministic command/replay, fake ports/presenter, automated CI; same shared C# core executes in Blazor WASM and **early minimal native iOS/Android host probes** |
| N01 | **Voxel authority and destruction** | Physical world source of truth | Signed sparse 3D cells, 1m blocks/10cm microcells, chunk/revision/edit ledger, negative boundaries, replay/idempotency, physical solid queries |
| N02 | **Physics, movement, derived meshes and HEX frontend** | Makes the new world visible and traversable without browser gameplay authority | Real collision/jump/ground/step/canopy/headroom, valid dirty meshing, moving actor, spell-caused physically consistent crater rendered as HEX shapes on Pages |
| N03 | **WorldGen, streaming, objects and basic navigation** | Real expedition cannot be a single static laboratory ring | Seeded reachable wet-forest regions, landmarks and exits, seamless bounded streaming, physical trees/props, per-actor reachability validated across chunks |
| N04 | **Combat, spells, agent AI and encounter direction** | Hunt needs meaningful living threats before content polish | Fireball and damage, Hollowed/Ashling/Wolf behaviours, pack/flee/ranged variants, fair waves, rare eligibility, telegraphs and staged Ashfang |
| N05 | **Complete Fire Tier-I Hunt gameplay** | V1's complete Hunt is our essential product parity target | Launch -> travel -> wave/upgrade/fork -> Ashfang -> extract/defeat -> secured reward/save/Arcane Web, 100% authoritative C#, seed-based end-to-end journeys |
| N06 | **Interacting environmental simulation** | Add full physical consequences after baseline Hunt works | Support/gravity, water/lava channels and bank breaches, object/terrain destruction, corruption/biomes, navigation/fluid/renderer consistency without Hunt regressions |
| N07 | **Native apps, platform parity and performance** | Make both mobile releases genuinely shippable | iOS/Android native presenters running same C# simulation, offline save/resume, measured sustained device CPU/GPU p50/p95/p99, memory/thermal and 60 FPS tier target |
| N08 | **Only then final presentation** | Avoid spending weeks polishing features that are not functional | Replace HEX shapes with approved pixel art, textures, materials/lighting, animation/VFX/audio without changing authoritative simulation hashes |

**Early native-probe risk gate:** N00 must prove execution of the shared C# library in **both** native OS hosts. Building a full native game/presenter remains N07. Do not defer the runtime feasibility discovery until N07. If hardware/macOS/signing blocks real device proof, record the blocker explicitly and do not call N00 fully accepted.

**HEX lock:** primitive colors and shapes throughout N00–N07. Detailed art/texture work starts N08 only after functional and performance gates pass, unless the owner explicitly changes this policy.

## N00 details — the first task when implementation is authorized

Deliver:
1. Stable C# commands, 3D coordinate units, IDs, immutable scene/owner events and error semantics.
2. Fixed-step session and command queue, deterministic seed/RNG isolation, accepted-event journal and replay/state hash.
3. Test Harness capable of headless and fake-provider execution on CI; reproducible failures with seed, tick, command and engine version.
4. Blazor WebAssembly host showing **C# state**, not a static picture or JavaScript simulation; geometric HEX-only renderer.
5. Minimal native iOS/Android build/execution probes of the same C# game logic and early AOT/compatibility notes.
6. Mandatory architecture/static import checks and test/evidence status reporting.

N00 is not done because the current branch has C# projects or a static SVG preview. These are starting scaffolds only. The premature Physics code in PR #440 is not an accepted N00/N02 milestone and must be reviewed separately.

## Per-milestone task format

Each ID decomposes into small `Nxx-yy` tasks. Before any implementation, a task must declare:

- **Outcome:** one observable player or engine behaviour, with no hidden scope expansion.
- **Owner:** exactly one authoritative engine and file/module ownership.
- **Contracts:** ports, version/schema changes, other owners' approval or adapters.
- **Prerequisites:** only verified upstream tasks, not green badges/assumptions.
- **Forbidden work:** no unrelated engines, framework decisions, asset/art polish, branch merges or opportunistic refactor.
- **Tests:** unit/contract, fake replacement, real integration, deterministic replay, performance, browser/native where applicable.
- **Acceptance:** proof links, exact commit and one explicit review decision.

After completing a task, update its status and the verified checkpoint. One task may unblock more than one future task; prioritize the single next vertical slice.

## Dependencies and ordering exceptions

N00 -> N01 -> N02 -> N03 -> N04 -> N05 -> N06 -> N07 -> N08 is the default **acceptance sequence**. Small interface studies, pure tests, or native feasibility probes can overlap **only when explicitly authorized and assigned disjoint files**. Never start future features just because they are technically independent.

Individual engines may be refined after first acceptance if new measured failures appear; that becomes a separate scoped issue. We do not re-open an accepted milestone to endlessly polish. A failing requirement is recorded as regression/blocker with a bounded corrective task.

## Product outcome guardrails

- A **Hunt** means a substantial connected, seeded expedition with optional decisions, enemies, objective gates, a real Wyrm boss, extraction and meaningful progression—not a worldgen demo or horde ring.
- AI has independent archetype, intelligence, temperament, rarity, encounter role and Wyrm-tier axes. Actor capabilities (e.g., Ashling/Wolf 1m jumps vs Wizard/Hollowed restrictions) are enforced by Physics and used by Navigation.
- Fireball affects committed physical terrain/objects, not cosmetic crater geometry; all consumers see the same authoritative revisions.
- Web is our quick development presenter, not the shipping target. Native iOS and Android are the final apps, not a WebView wrapper.
- New C# code is clean-room. V1 tells us **what** behaviour to preserve; archived V2 teaches us relevant algorithms/problems, but is not copied into the new runtime.

## Related canonical documents

- [Operating rules](../process/OPERATING-RULES.md)
- [Test and evidence policy](../process/TEST-AND-EVIDENCE.md)
- [Engine authority](ENGINE-OWNERSHIP.md)
- [Presentation boundary](FRONTEND-BOUNDARY.md)
- [V1 first-Hunt acceptance](V1-FIRST-HUNT-PARITY.md)
- [HEX-only placeholders](PLACEHOLDER-WORLD.md)
- [Session and handover preflight](../process/SESSION-PROTOCOL.md)

**No further engine coding is authorized by the creation of this roadmap.**