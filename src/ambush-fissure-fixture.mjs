// V2-only acceptance fixture: 18 independently oriented fissures, three synchronized stages.
// The terrain ledger owns all mutations. No gravity, V1 imports, enemies or VFX.
export const FISSURE_STAGE_TIMES_MS = Object.freeze([0, 245, 490]);
export const FISSURE_COUNT = 18;
export function fissureSites(count = FISSURE_COUNT) {
  if (!Number.isInteger(count) || count < 15 || count > 20) throw new RangeError('Expected 15–20 fissures');
  return Array.from({length:count}, (_,index) => {
    const angle = 2 * Math.PI * index / count + Math.sin(index * 19.17) * 0.11;
    const distance = 25 + (index * 13 % 11);
    const x = Math.round(Math.cos(angle) * distance);
    const z = Math.round(Math.sin(angle) * distance);
    const direction = angle + Math.PI / 2 + Math.sin(index * 7.1) * 0.75;
    return {x,z,dx:Math.cos(direction),dz:Math.sin(direction),index};
  });
}
export function applyFissureStage(world, ledger, stage, sites = fissureSites()) {
  if (!Number.isInteger(stage) || stage < 0 || stage > 2) throw new RangeError('Invalid fissure stage');
  const lengths = [5,10,15], radii = [1.2,2.1,3.1];
  const dirty = new Set();
  let removedVoxels = 0, accepted = 0;
  for (const site of sites) {
    const half = lengths[stage] / 2;
    const startX = Math.round(site.x - site.dx * half);
    const startZ = Math.round(site.z - site.dz * half);
    let endX = Math.round(site.x + site.dx * half);
    let endZ = Math.round(site.z + site.dz * half);
    if (startX === endX && startZ === endZ) endX++;
    const edit = ledger.apply({
      id:`fissure-${site.index}-stage-${stage}`,type:'carve-tunnel',
      x:startX,y:3,z:startZ,toX:endX,toY:2,toZ:endZ,radius:radii[stage],
      expectedRevision:world.revision,expectedEditRevision:ledger.editRevision
    });
    if (edit.status === 'accepted') accepted++;
    removedVoxels += edit.removedVoxels;
    for (const id of edit.dirtyChunks) dirty.add(id);
  }
  return {stage,sites:sites.length,accepted,removedVoxels,dirtyChunks:[...dirty].sort()};
}
