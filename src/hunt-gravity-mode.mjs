// Streamed Hunts share their normal save with the explicit gravity bypass.
// Guided scenarios and the older opt-in terrain route keep their own saves.
export function resolveHuntTerrainGravity(cellStreaming,mode){
  const defaultEnabled=cellStreaming&&mode===null;
  const terrain=defaultEnabled||(cellStreaming&&mode==='terrain');
  return {terrain,defaultEnabled};
}

export function huntTerrainSaveIdentity(identity,mode,{structuralGravity,defaultEnabled}){
  return structuralGravity&&!defaultEnabled?identity+':gravity-'+mode:identity;
}
