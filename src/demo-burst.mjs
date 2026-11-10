// Deterministic, V2-native three-impact fixture.
// All edits go through the authoritative TerrainEditLedger. One batch leads to
// exactly one renderer invalidation; there is no new renderer or physics path.
import { MAX_RECORDED_EDITS } from './terrain-edit-ledger.mjs';

const TARGETS = Object.freeze({
  flat: Object.freeze([
    Object.freeze({ x:-6, y:1, z:-4, radius:3 }),
    Object.freeze({ x:0, y:1, z:0, radius:3 }),
    Object.freeze({ x:6, y:1, z:4, radius:3 })
  ]),
  hill: Object.freeze([
    Object.freeze({ x:-6, y:3, z:-4, radius:3 }),
    Object.freeze({ x:0, y:3, z:0, radius:3 }),
    Object.freeze({ x:6, y:3, z:4, radius:3 })
  ]),
  cliff: Object.freeze([
    Object.freeze({ x:-6, y:1, z:-4, radius:3 }),
    Object.freeze({ x:0, y:3, z:0, radius:3 }),
    Object.freeze({ x:6, y:8, z:4, radius:3 })
  ]),
  arch: Object.freeze([
    Object.freeze({ x:-5, y:5, z:2, radius:2.5 }),
    Object.freeze({ x:0, y:8, z:2, radius:2.5 }),
    Object.freeze({ x:5, y:5, z:2, radius:2.5 })
  ])
});

export function demoBurstTargets(scene) {
  if (typeof scene !== 'string' || !Object.hasOwn(TARGETS,scene)) {
    throw new RangeError('Unknown V2 burst scene');
  }
  return TARGETS[scene];
}

export function applyDemoBurst(world, ledger, { scene, runId } = {}) {
  if (!world || !Number.isSafeInteger(world.revision) ||
      !ledger || typeof ledger.apply !== 'function' ||
      !Number.isSafeInteger(ledger.recordedEdits)) {
    throw new TypeError('Expected V2 world and authoritative edit ledger');
  }
  if (!Number.isSafeInteger(runId) || runId < 1 || runId > 1000000) {
    throw new RangeError('Expected bounded positive burst run ID');
  }

  const targets = demoBurstTargets(scene);
  // Fail before editing if this batch would exceed the journal's explicit cap.
  // A fully atomic transaction is a separate V2.3 milestone.
  if (ledger.recordedEdits + targets.length > MAX_RECORDED_EDITS) {
    throw new RangeError('Insufficient edit history capacity for burst');
  }

  const dirty = new Set();
  const edits = [];
  let removedVoxels = 0;
  let min = null, max = null;
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const result = ledger.apply({
      id: `lab-burst-${runId}-hit-${i+1}`,
      type: 'carve-sphere',
      ...target,
      expectedRevision: world.revision
    });
    edits.push(Object.freeze({ target, ...result }));
    removedVoxels += result.removedVoxels;
    for (const id of result.dirtyChunks) dirty.add(id);
    if (result.changedBounds) {
      const { min:lo, max:hi } = result.changedBounds;
      if (!min) {
        min = [lo.x,lo.y,lo.z];
        max = [hi.x,hi.y,hi.z];
      } else {
        min[0]=Math.min(min[0],lo.x); min[1]=Math.min(min[1],lo.y);
        min[2]=Math.min(min[2],lo.z); max[0]=Math.max(max[0],hi.x);
        max[1]=Math.max(max[1],hi.y); max[2]=Math.max(max[2],hi.z);
      }
    }
  }
  return Object.freeze({
    schema:'voxel-v2.demo-burst.v1',
    scene, runId,
    impactCount:edits.length,
    removedVoxels,
    dirtyChunks:Object.freeze([...dirty].sort()),
    changedBounds:min ? Object.freeze({
      min:Object.freeze({x:min[0],y:min[1],z:min[2]}),
      max:Object.freeze({x:max[0],y:max[1],z:max[2]})
    }) : null,
    worldRevision:world.revision,
    edits:Object.freeze(edits)
  });
}
