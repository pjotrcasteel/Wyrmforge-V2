# N00 Physics — actual implemented reference slice, not a completed movement engine

**Scope:** minimal new C# physics engine with zero dependency on any other concrete engine.

- Physics references only `Wyrmforge.V2.Contracts` and accepts read-only `IWorldGeometry`.
- All coordinates are signed 100 mm microvoxels; Y is vertical. A feet coordinate must be supported by a solid cell directly below.
- Player/enemy species are unknown to Physics. The caller supplies `MovementCapabilities` for height, step-up and drop.
- Wizard/Hollowed may be configured with sub-1m max step, Wolf/Ashling with 1m jump capability. These are gameplay policy values, not hard-coded creature switches.
- One adjacent X/Z step resolves by checking actual support and full-height headroom. No output transform is committed if blocked.
- N00 fixtures include a full 1m solid ledge, false-floor rejection, negative coordinates, mock geometry and invalid requests.

**Not yet implemented:** continuous collision/swept volumes, multi-axis velocity, jumping arcs, gravity/falling and moving terrain. These are future acceptance gates. Do not describe a one-step resolver as a production physics engine.

**Frontend:** No renderer dependency. World visualization remains HEX color/shape-only until all systems work.