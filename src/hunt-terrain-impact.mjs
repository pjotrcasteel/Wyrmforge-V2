// Independent V2 gameplay contract for terrain-affecting spell/projectile hits.
// A Hunt/arena adapter provides a ray or an already computed voxel hit; no V1
// gameplay components, assets or WebGL interfaces are required.
import { raycastTerrain } from './terrain-raycast.mjs';

export const TERRAIN_IMPACT_SCHEMA = 'voxel-v2.hunt-terrain-impact.v1';

export function applyTerrainSpellHit(world, ledger, {
  id, ray = null, hit = null, radius = 2.5, power = 1
} = {}) {
  if (!world || typeof world.get !== 'function' ||
      !Number.isSafeInteger(world.revision) ||
      !ledger || typeof ledger.apply !== 'function' ||
      !Number.isSafeInteger(ledger.editRevision)) {
    throw new TypeError('Expected V2 voxel world and authoritative edit ledger');
  }
  if ((ray === null) === (hit === null)) {
    throw new TypeError('Supply exactly one ray or already-resolved terrain hit');
  }
  const target = ray === null ? hit : raycastTerrain(world,ray);
  if (!target) {
    return {
      schema:TERRAIN_IMPACT_SCHEMA, status:'miss', hit:null,
      removedVoxels:0, damagedVoxels:0, dirtyChunks:[],
      worldRevision:world.revision, editRevision:ledger.editRevision
    };
  }
  const { x,y,z } = target.cell ?? {};
  if (![x,y,z].every(Number.isSafeInteger) ||
      !Number.isSafeInteger(target.material) || target.material < 1 ||
      target.material > 255 || target.worldRevision !== world.revision ||
      world.get(x,y,z) !== target.material) {
    throw new Error('Stale or invalid voxel impact: resolve a fresh authoritative hit');
  }
  // TerrainEditLedger remains the only writer and owns resistance, duplicate
  // IDs, partial damage revisions, chunk invalidation and material policy.
  const edit = ledger.apply({
    id, type:'damage-sphere', x,y,z,radius,power,
    expectedRevision:world.revision,
    expectedEditRevision:ledger.editRevision
  });
  return {
    schema:TERRAIN_IMPACT_SCHEMA, status:edit.status,
    hit:target, impactId:id, power, radius,
    removedVoxels:edit.removedVoxels,
    damagedVoxels:edit.damagedVoxels,
    dirtyChunks:edit.dirtyChunks,
    changedBounds:edit.changedBounds,
    pendingDamageCells:edit.pendingDamageCells,
    worldRevision:edit.worldRevision,
    editRevision:edit.editRevision
  };
}
