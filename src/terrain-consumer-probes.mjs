// Minimal V2.6-only adapter fakes. These prove each future gameplay, physics,
// lighting, VFX, audio and navigation engine can receive the SAME ordered,
// JSON-safe terrain changes without importing or owning the voxel world.
// Actual V2 gameplay, shaders, effects, pathfinding and audio live elsewhere.
import {
  TERRAIN_CHANGE_SCHEMA, TERRAIN_CONSUMERS
} from './terrain-integration-port.mjs';

export const TERRAIN_PROBE_SCHEMA = 'voxel-v2.consumer-proof.v1';

export function attachTerrainConsumerProbes(port) {
  if (!port || typeof port.subscribe!=='function' ||
      !Number.isSafeInteger(port.epoch) ||
      !Number.isSafeInteger(port.editRevision)) {
    throw new TypeError('Expected a V2 terrain change subscription port');
  }
  const startRevision=port.editRevision;
  const counters=new Map(TERRAIN_CONSUMERS.map(kind=>[kind,{
    events:0,geometryEvents:0,damageEvents:0,lastSequence:startRevision,
    lastWorldRevision:null,epoch:port.epoch
  }]));
  const unsubscribe=TERRAIN_CONSUMERS.map(kind=>port.subscribe(kind,change=>{
    if(!change || change.schema!==TERRAIN_CHANGE_SCHEMA ||
        change.epoch!==port.epoch || change.status!=='accepted') {
      throw new Error('Unsupported or stale V2 terrain change contract');
    }
    const row=counters.get(kind);
    if(change.sequence!==row.lastSequence+1 ||
       (row.lastWorldRevision!==null &&
        change.worldRevision<row.lastWorldRevision)) {
      throw new Error('V2 terrain change stream is unordered');
    }
    row.events++;
    if(change.geometryChanged) row.geometryEvents++;
    if(change.damageChanged) row.damageEvents++;
    row.lastSequence=change.sequence;
    row.lastWorldRevision=change.worldRevision;
  }));
  let disposed=false;
  return {
    report() {
      return {
        schema:TERRAIN_PROBE_SCHEMA,epoch:port.epoch,
        consumers:Object.fromEntries([...counters].map(([kind,row])=>
          [kind,{...row}]))
      };
    },
    dispose() {
      if(disposed) return;
      disposed=true;
      for(const unsubscribeOne of unsubscribe) unsubscribeOne();
    }
  };
}
