// Voxel replay consumes only the terrain port and a published residency
// snapshot. The host owns routes, loading, and the rendering handshake.
import {replayDataDigest} from './replay-checkpoint.mjs';

const MAX_FALL_TICKS=240;

export function replayHuntTerrainEdit(port,residentIds,entry,{collapse,save}={}){
  const expected=entry.collapse;
  if(expected&&(!collapse||collapse.phase!=='ready'||!Array.isArray(expected.landed)||
      expected.landed.length===0||expected.landed.length>256||
      !Array.isArray(expected.removed)||expected.removed.length>512)){
    throw new Error('Replay requires a settled collapse and a ready Physics preview');
  }
  if(entry.residentIds.length!==residentIds.length||
      !entry.residentIds.every(id=>residentIds.includes(id))){
    throw new Error('Publish the recorded terrain neighborhood before replaying an edit');
  }
  // Streaming writes change world revision. The edit revision orders the
  // same commands independently of writes that brought the bands into view.
  const {expectedRevision,...command}=entry.command;
  const result=port.apply({...command,expectedEditRevision:entry.sequence-1},
    {captureRemovedCells:Boolean(expected||save)});
  if(!expected){
    save?.commit(result.removedCells);
    return result;
  }

  collapse.acceptImpact(result);
  for(let tick=0;tick<MAX_FALL_TICKS&&collapse.holdsFixture;tick++)collapse.tick([]);
  const actual=collapse.replay;
  if(!actual?.landed||actual.sequence!==entry.sequence||
      replayDataDigest(actual.removed)!==replayDataDigest(expected.removed)||
      replayDataDigest(actual.landed)!==replayDataDigest(expected.landed)){
    throw new Error('Replayed collapse differs from recorded settlement');
  }
  return result;
}

export function recordHuntTerrainEdit(residentIds,command,result){
  return {sequence:result.editRevision,residentIds:[...residentIds].sort(),command:{...command}};
}

// Tie the Physics result to its triggering edit and preserve older crater-only records.
export function exportHuntTerrainEdits(entries,collapse){
  if(!collapse)return entries;
  const {sequence,...outcome}=collapse;
  return entries.map(entry=>entry.sequence===sequence?{...entry,collapse:outcome}:entry);
}
