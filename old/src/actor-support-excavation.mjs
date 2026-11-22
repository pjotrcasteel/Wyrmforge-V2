// V2.5 deterministic gameplay acceptance fixture. This is not a new
// destruction engine: the authoritative TerrainEditLedger remains the only
// terrain writer. Useful for underfoot spell hits before the GPU upload.
import { ACTOR_HALF_WIDTH } from './terrain-actor.mjs';

export const ACTOR_SUPPORT_TEST_SCHEMA = 'voxel-v2.actor-support-test.v1';
export const ACTOR_SUPPORT_TEST_RADIUS = 2.5;
const SKIN = 1e-3;

function inspectSupport(world, actor) {
  const y = Math.floor(actor.y - SKIN);
  const x0 = Math.floor(actor.x - ACTOR_HALF_WIDTH + SKIN);
  const x1 = Math.floor(actor.x + ACTOR_HALF_WIDTH - SKIN);
  const z0 = Math.floor(actor.z - ACTOR_HALF_WIDTH + SKIN);
  const z1 = Math.floor(actor.z + ACTOR_HALF_WIDTH - SKIN);
  const cells = [];
  for (let z=z0;z<=z1;z++) {
    for (let x=x0;x<=x1;x++) {
      const material = world.get(x,y,z);
      if (material!==0) cells.push({x,y,z,material});
    }
  }
  return cells;
}

export function excavateActorSupport(world, ledger, actor, id) {
  if (!world || typeof world.get !== 'function' ||
      !Number.isSafeInteger(world.revision) ||
      !ledger || typeof ledger.apply !== 'function' ||
      !Number.isSafeInteger(ledger.editRevision) ||
      !actor || ![actor.x,actor.y,actor.z].every(Number.isFinite)) {
    throw new TypeError('Expected a V2 world, ledger and valid actor');
  }
  if (actor.grounded !== true) {
    throw new Error('Actor must be grounded before excavating supporting terrain');
  }
  const before = inspectSupport(world, actor);
  if (!before.length) {
    return {
      schema:ACTOR_SUPPORT_TEST_SCHEMA,status:'no-support',
      removedVoxels:0,dirtyChunks:[],
      supportBefore:0,supportAfter:0,
      worldRevision:world.revision,actorPosition:{x:actor.x,y:actor.y,z:actor.z}
    };
  }
  // A small *integer-centered* sphere is enough to remove the actor's
  // footprint while preserving more distant terrain; the ledger handles
  // signed chunk seams and exact changed-region notifications.
  const center = {
    x:Math.floor(actor.x),y:Math.floor(actor.y-SKIN),
    z:Math.floor(actor.z),radius:ACTOR_SUPPORT_TEST_RADIUS
  };
  const result=ledger.apply({
    id,type:'carve-sphere',...center,
    expectedRevision:world.revision,
    expectedEditRevision:ledger.editRevision
  });
  const after=inspectSupport(world,actor);
  return {
    schema:ACTOR_SUPPORT_TEST_SCHEMA,
    status:result.status,editId:result.editId,
    target:center,removedVoxels:result.removedVoxels,
    dirtyChunks:result.dirtyChunks,changedBounds:result.changedBounds,
    supportBefore:before.length,supportAfter:after.length,
    actorPosition:{x:actor.x,y:actor.y,z:actor.z},
    worldRevision:result.worldRevision,editRevision:result.editRevision
  };
}
