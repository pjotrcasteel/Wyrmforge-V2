# V1 complete first Hunt — behaviour inventory for new V2

This is a **product acceptance reference**, not permission to copy V1 code. Verify source and canon; do not implement a pixel-perfect port of V1's heightfield or actor position math.

## What exists in the V1 reference

- Wyrmforge.Domain and Wyrmforge.Application contain the C# run/encounter/combat domain.
- Wyrmforge.Presentation.Web is a Blazor WebAssembly frontend.
- RunSimulation.Tick advances combat and creates RunRenderSnapshot; the renderer is separate from C# gameplay.
- RunSimulation.Navigation chooses map nodes, starts encounters and applies seeded route/terrain rules.
- EncounterDirector supports pressure, escalation, breathing room, surge and climax, with pack variation.
- DragonHuntCatalog and RunSimulation.Dragons implement Ashfang signatures, telegraphs, entrance and multiple phases.
- RunSimulation.Progression supports experience, choice and permanent progression.
- Canon describes Fire Tier I as a selectable complete Hunt with a fork, Wyrm target, material rewards and extraction. Fire Tier II and Tier III also have additional authored rules; **do not scope them into the first V2 parity milestone**.
- A first-Hunt onboarding loop teaches movement, automatic attacks, first temporary upgrade and first permanent Arcane point.

Sources:
- https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Application/Runs/Simulation/RunSimulation.cs
- https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Application/Runs/Simulation/Navigation/RunSimulation.Navigation.cs
- https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Application/Runs/Simulation/Enemies/EncounterDirector.cs
- https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Application/Runs/Hunts/DragonHuntCatalog.cs
- https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Application/Runs/Simulation/Snapshots/RunRenderSnapshot.cs
- https://github.com/pjotrcasteel/Wyrmforge/blob/main/docs/canon/hunts-and-world.md
- https://github.com/pjotrcasteel/Wyrmforge/blob/main/docs/playtesting/first-hunt-tutorial-v1.md

## First V2 Hunt acceptance — independent new code

1. From start/refuge, choose Fire Tier I and launch an actual seeded expedition.
2. The hunter moves and auto-casts with clear readable input, damage and world collision.
3. Explore multiple **seamlessly connected** physically navigable regions; discover a meaningful optional branch or objective. Never reduce the final Hunt to a single lab ring.
4. Horde combat escalates, includes recovery windows, species-appropriate chase/pack/jump permissions, and visible health/XP/choice progression.
5. At least one committed route decision meaningfully changes the next encounters/landmarks without regenerating prior history.
6. Player and enemy spells interact with the same 3D voxel terrain; props and fluids follow their owning physics/solver contracts.
7. Reach a Wyrm encounter (Ashfang for Fire Tier I) with telegraph -> committed attack -> recovery and distinct phase transition.
8. On victory, secured extraction and reward claim are authoritative, idempotent and preserved across save/restart.
9. On defeat/abandonment, do not grant a victory or duplicate rewards. Intro progression is correct for first-time and returning characters.
10. Every frame of the browser placeholder world is made of **primitive shapes and literal HEX colors**; no visual-polish prerequisite.

## Differences deliberately required for V2

- Genuine 3D solid voxel/microvoxel terrain, not a painted heightfield or cosmetic crater.
- Streaming regions in one expedition, not repeated independent small stage pages.
- Physics/Nav/Fluids/World Objects consume actual committed solid geometry, not duplicate heightmaps.
- Stable core-independent frontend renderer; actual future iOS/Android hosts run the same C# source.
- Mobile performance, memory and replay correctness must be measured; browser success is not native success.

## Acceptance evidence

Automated deterministic tests (multiple seeds, route topology, damage/collision, phase, save/reward) plus named-phone browser playthrough and **separate native build proof**. A V1 document claiming a feature is not evidence that new V2 has implemented it.
