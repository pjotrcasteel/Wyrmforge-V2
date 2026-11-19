// Play Hunt's existing water/lava shader accepts a packed channel map.
// This presentation adapter converts Water V2's *read-only* surface snapshot
// to that contract without giving Materials or WebGL any simulation authority.
import {huntLavaSurface} from '../hunt-lava-surface.mjs';
import {FLUID_SURFACE_SCHEMA} from './column-fluid-engine.mjs';

export function huntFluidSurface(layout,world,surface){
  if(surface?.schema!==FLUID_SURFACE_SCHEMA||
      !['water','lava'].includes(surface.kind)||!Array.isArray(surface.cells)||
      !layout?.footprint||!world||typeof world.get!=='function'){
    throw new TypeError('Expected valid Water V2 surface, WorldGen site and Voxel terrain');
  }
  const channel=layout.riverChannels?.[0];
  if(!channel||channel.kind!==surface.kind||
      !channel.from||!channel.to||!surface.bounds){
    throw new TypeError('Fluid presentation must match the authored WorldGen river');
  }
  const {minX,maxX,minZ,maxZ}=layout.footprint;
  if(surface.bounds.minX!==minX||surface.bounds.maxX!==maxX||
      surface.bounds.minZ!==minZ||surface.bounds.maxZ!==maxZ){
    throw new RangeError('Fluid surface does not match this resident WorldGen footprint');
  }
  // No fake water outside the fluid model. Existing material shader only
  // shades exposed physical top faces; true raised volume geometry belongs
  // to the later Rendering V2 fluid-mesh handoff.
  const floor=surface.cells.map(({x,z,floorY,flowX,flowZ,depth})=>{
    if(![x,z,floorY,flowX,flowZ,depth].every(Number.isFinite)||
        !Number.isInteger(x)||!Number.isInteger(z)||!Number.isInteger(floorY)||
        depth<=0||x<minX||x>maxX||z<minZ||z>maxZ){
      throw new RangeError('Invalid published fluid column');
    }
    return Object.freeze({x,z,y:floorY,flowX,flowZ});
  });
  if(!floor.length)return null;
  return huntLavaSurface({...layout,riverChannels:[{
    floor,from:channel.from,to:channel.to,kind:channel.kind
  }]},world);
}

// Both native Water and native Lava use a SINGLE depth-tested geometry
// authority. The old solid-face channel material must never paint a second
// fake water or lava plane underneath the physical fluid. Keep the authored
// channel MAP separately for Lighting V2's genuine molten emission sources.
// Legacy WorldGen previews without an active solver retain their material.
export function terrainChannelLayer(fluidSurface,authoredChannelLayer){
  return fluidSurface?.schema===FLUID_SURFACE_SCHEMA &&
    ['water','lava'].includes(fluidSurface.kind)
    ?null:authoredChannelLayer;
}
