import {terrainRayFromScreen} from './terrain-raycast.mjs';

// The presentation adapter supplies the conservative X/Z window covering
// the viewport at any supported terrain elevation. Voxel scheduling itself
// stays independent of canvas size, camera basis and depth reference.
export function terrainViewFootprint(view,{minY,maxY}){
  if(![minY,maxY].every(Number.isFinite)||minY>maxY)throw new RangeError('Invalid terrain height range');
  const xs=[],zs=[];
  for(const x of [0,view.width]){
    for(const y of [0,view.height]){
      const {origin,direction}=terrainRayFromScreen({...view,x,y});
      if(Math.abs(direction[1])<1e-6)throw new RangeError('Camera does not cross the terrain height range');
      for(const height of [minY,maxY]){
        const distance=(height-origin[1])/direction[1];
        xs.push(origin[0]+distance*direction[0]);
        zs.push(origin[2]+distance*direction[2]);
      }
    }
  }
  return {minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
}
