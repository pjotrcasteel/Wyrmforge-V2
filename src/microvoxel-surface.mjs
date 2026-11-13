// Voxel V2: sparse 10x10x10 microvoxels, compressed as ten-centimeter
// contiguous occupancy heights in each of 100 X/Z columns. A height of 7
// represents seven *solid* 10 cm cells, not a bent triangle mesh.
// Only top surface voxels opt in; ordinary 1m voxels remain unchanged.
export const MICRO_VOXEL_EDGE=10;
export const MICRO_VOXEL_COUNT=100;
export const MAX_MICRO_SURFACE_TILES=1024;
export const MICRO_VOXEL_SURFACE_SCHEMA='voxel-v2.micro-surface.v1';

export function validateMicroSurfaceTile(tile) {
  if(!tile || ![tile.x,tile.y,tile.z].every(Number.isSafeInteger) ||
      !Array.isArray(tile.levels) && !(tile.levels instanceof Uint8Array) ||
      tile.levels.length!==MICRO_VOXEL_COUNT) {
    throw new TypeError('Expected one signed top voxel and its 10x10 microcell heights');
  }
  if(!Array.from(tile.levels).every(value=>
    Number.isSafeInteger(value) && value>=1 && value<=10)) {
    throw new RangeError('Microvoxel heights must contain 1–10 solid tenths');
  }
  return Object.freeze({
    x:tile.x,y:tile.y,z:tile.z,
    levels:Object.freeze(Array.from(tile.levels))
  });
}

export function validateMicroSurfaceTiles(tiles) {
  if(!Array.isArray(tiles) || tiles.length>MAX_MICRO_SURFACE_TILES) {
    throw new RangeError('Micro surface tile budget exceeded');
  }
  const ids=new Set();
  const safe=tiles.map(item=>{
    const tile=validateMicroSurfaceTile(item);
    const id=tile.x+','+tile.y+','+tile.z;
    if(ids.has(id)) throw new Error('Duplicate micro surface tile: '+id);
    ids.add(id);
    return tile;
  });
  safe.sort((a,b)=>a.y-b.y || a.z-b.z || a.x-b.x);
  return Object.freeze(safe);
}
