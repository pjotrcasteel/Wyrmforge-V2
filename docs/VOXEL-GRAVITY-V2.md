# Voxel V2 — optional hybrid gravity and structural collapse

**Status:** approved design direction, **NOT IMPLEMENTED**.  
**Owner decision:** 2026-11-10; Wyrmforge must remain a fixed-camera **2.5D pixel-art** game with real 3D destructible terrain and mobile-first performance.  
**Scope:** entirely new V2 design. No V1 modules, physics, scene assets, or contracts may be reused.

## 1. Player-facing goal

Destroy a support under a cliff or stone arch; if the remaining structure no longer has a load path to an anchor, connected rock should visibly fall, collide, fracture into smaller pieces and settle as new terrain or bounded rubble. Loose sand/gravel falls separately. Nothing floats indefinitely simply because the renderer holds an old mesh.

**Important:** support-based collapse is an intentional game-physics model, **not** realistic engineering stress analysis. It does not imply that every cliff must collapse, nor that every voxel is individually simulated every frame.

## 2. Three optional behavior classes

| Class | Example | V2 rule |
| --- | --- | --- |
| Anchored | bedrock, protected world foundation | Immovable; can support other materials; protected against destruction by explicit policy |
| Cohesive | rock, consolidated soil, stone arch | Stable while grounded/connected to valid anchors; unsupported connected components activate as bounded rigid clusters |
| Granular | gravel, sand, loose rubble | Local cell movement under gravity in a fixed tick, optionally spreading to diagonally adjacent cells; no global per-voxel rigid bodies |

A material's **rendering ID is not its physics behavior**. A future versioned `MaterialPhysicsV2` schema owns `gravityMode`, `supportClass`, `density`, `cohesion`, `breakThreshold`, `impactResistance`, and `canSettleToTerrain` (specific numeric values are experimental and **not selected yet**).

Gravity must be configurable per scene, material and test profile; `off` is a valid default until the feature is accepted.

## 3. Ownership and integration boundary

```text
Authoritative VoxelWorld (committed sparse 3D solids)
    -> accepted, ordered edit with changed-cell bounds and chunk revisions
    -> optional StructuralIntegrityV2 scan around changed supports
    -> bounded list of unsupported components
    -> PhysicsV2 receives detached-cluster snapshots (immutable)
    -> PhysicsV2 moves transient rigid clusters in fixed ticks
    -> impact resolution / optional fracture
    -> ordered atomic voxel removal + landing additions
    -> changed-region notifications
    -> localized V2 meshing, renderer, Lighting V2, VFX V2, Audio V2
```

The voxel store is the **only authoritative static terrain store**. A detached cluster is temporarily represented by a physics-owned body and its retained voxel payload; it must never remain simultaneously as collidable static voxels and as a dynamic body. Renderer output is disposable and never determines support, collision or terrain truth.

**Candidate events/contracts** (future, not final APIs): `TerrainEditCommittedV2`, `SupportRegionInvalidatedV2`, `ClusterDetachedV2`, `ClusterSettledV2`, `TerrainRegionChangedV2`. All include version, world epoch, edit or cluster ID and voxel-space bounds. Future integrations must be V2-native.

## 4. Support detection

1. Begin only from a bounded neighborhood of committed changed cells, particularly deleted load-bearing cells.
2. Walk six-face-connected cohesive cells with iterative queue/flood fill. No recursive stack traversal.
3. A component is **supported** when connected through permitted materials to an explicit anchor (typically bedrock or a protected world boundary).
4. If unsupported and within configured cell/extent limits, detach it as one candidate body. If too large, defer or use a conservative no-collapse policy and report an overflow; **never** freeze the phone traversing unbounded terrain.
5. Mark affected chunk revisions and their face-neighbors before publishing derived work. Validate world epoch and revisions before accepting a delayed result.

The first implementation will use **connectivity**, not simulated mass, stress, or fracture mechanics. Structural load, arch compression and progressive weakening are later research decisions.

## 5. Gravity simulation and settlement

- Cohesive components move as **one body** with a local voxel payload and transform. Do not create a physics body for each rock voxel.
- Use a fixed-step simulation with capped substeps and bounded active-body counts; pause or degrade safely under load.
- Collision queries read the *committed* V2 terrain, plus a separate narrow-phase dynamic-body registry. Use swept or conservative collision checks to prevent tunneling.
- At impact, optionally fracture by seeded deterministic rules. Dust/shards/sparks that do not affect gameplay are cosmetic VFX with strict lifetime caps.
- At rest, choose an explicit policy: atomically convert eligible cluster cells into static terrain, leave an authored bounded debris field, or despawn purely cosmetic fragments.
- If there is no valid landing space or the target cells changed, resolve via a documented, deterministic conflict policy; never silently overwrite player structures.
- Sleep inactive bodies. Offscreen work must stay bounded and must not accumulate infinite simulations.

**Replay contract:** accepted cell edits, detach/settle decisions, seeds and canonical integer voxel snapshots are replayable. Cross-device bitwise identical floating-point trajectories are not promised; persist authoritative outcomes in integer voxel coordinates.

## 6. iOS and Android constraints

No global support scan per frame, no per-voxel rigid-body simulation, no unbounded BFS or worker backlog, no mandatory WebGPU, no dependency on shared memory/cross-origin isolation. Use bounded worker tasks where supported, chunk revisions, stale-result rejection and explicit GPU buffer disposal.

**Metrics to measure (never invent):** changed voxels, visited cells, scan duration, queue peak, active clusters, dynamic voxel count, physics substep time, settle latency, mesh rebuild/upload costs, GPU buffer bytes, p95/p99 frame intervals, >33/>50/>100 ms hitches, thermals and memory trend. Record overflow/throttling events explicitly. The final accepted limits must be based on physical iPhone Safari and Android Chrome sessions.

## 7. Integration phases (following the canonical V2 roadmap)

- **V2.1/V2.2 (current):** trustworthy voxel authority, chunk-local revisions/neighbor invalidation, disposable localized mesh caches, WebGL2 render budgeting.
- **V2.3:** ordered idempotent edit commands, material IDs/resistance policy, bounded multi-chunk changed-cell notifications; **no falling terrain yet**.
- **V2.4:** bounded worker scheduling, stale-result rejection and budgeted CPU/GPU updates, required before dynamic collapse bursts.
- **V2.5/V2.6:** committed-state collision/raycast and typed Physics V2 interfaces.
- **Post-foundation, optional gravity milestone:** granular sandbox → grounded/unsupported component detection → falling stone body → safe landing → impacts/fractures → sustained mobile acceptance.
- **V2.7 release gate:** V2 foundation must be accepted without relying on optional gravity. Gravity gets its *own* device/behavior acceptance gate and cannot silently expand release scope.

## 8. Test fixtures and acceptance

1. **Floating voxel island**: disconnected cohesive group is found; anchored neighbor stays.
2. **Arch pillar removed**: arch span becomes a supported/unsupported component according to explicit anchor rules; no invisible geometry or stale collider.
3. **Chunk seam and negative coordinate**: connectivity continues across x/y/z chunk boundaries, for both 16³ and 32³.
4. **Material separation**: bedrock never detaches; gravel may fall; static dirt/rock follows selected cohesion mode.
5. **Reset during scan / falling / landing**: old epoch cannot alter new world or resurrect removed terrain.
6. **Rapid repeated impacts**: bounded queue and memory; same command ID does not detach twice.
7. **Deterministic outcomes**: same accepted command log, seeds and snapshots yield matching canonical integer voxel hashes, including settling.
8. **Visual validation**: a real 2.5D pixel-art rock mass falls and settles without teleporting, clipping or freezing the iPhone.
9. **10-minute sustained phone runs**: compare enabled versus disabled gravity under measured destruction bursts, report p95/p99, allocations, memory and thermal degradation.

## 9. Decisions deliberately left open

Choose via experiments: what counts as ground support; anchor policy for floating worlds; collapse component size limit; cohesion/fracture model; granular update cadence; body collision proxy; dynamic-to-static settlement rules; offscreen simulation; acceptable quality tiers. No numeric guarantees or FPS targets are approved yet.

## 10. Current action

The immediate prerequisite is **localized remeshing and GPU resource replacement after edits**. Build and validate that foundation before any real gravity loop. Future collapse needs to emit accurate changed chunks without regenerating the entire terrain mesh after every impact.
