// Voxel replay consumes only the terrain port and a published residency
// snapshot. The host owns routes, loading, and the rendering handshake.
export function replayHuntTerrainEdit(port,residentIds,entry){
  if(entry.residentIds.length!==residentIds.length||
      !entry.residentIds.every(id=>residentIds.includes(id))){
    throw new Error('Publish the recorded terrain neighborhood before replaying an edit');
  }
  // Streaming writes change world revision. The edit revision orders the
  // same commands independently of writes that brought the bands into view.
  const {expectedRevision,...command}=entry.command;
  return port.apply({...command,expectedEditRevision:entry.sequence-1});
}

export function recordHuntTerrainEdit(residentIds,command,result){
  return {sequence:result.editRevision,residentIds:[...residentIds].sort(),command:{...command}};
}
