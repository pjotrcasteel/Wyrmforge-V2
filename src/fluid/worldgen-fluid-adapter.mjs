// Water V2 ↔ WorldGen/Voxel contract adapter.
// No generator, material renderer, private Voxel data or browser dependencies.
// Create only after the terrain port has a fully resident site loaded.
import {ColumnFluidEngine,MAX_FLUID_COLUMNS} from './column-fluid-engine.mjs';

export const WORLDGEN_FLUID_SCHEMA='wyrmforge.fluid-worldgen-adapter.v1';
const MAX_VERTICAL_SCAN=128;
const MAX_CHANNEL_CELLS=4096;
const DEFAULT_SOURCE_RATE=3;

function assertBounds(footprint){
  const {minX,maxX,minZ,maxZ,minY,maxY}=footprint??{};
  if(![minX,maxX,minZ,maxZ,minY,maxY].every(Number.isSafeInteger)||
      minX>maxX||minZ>maxZ||minY>maxY||
      (maxX-minX+1)*(maxZ-minZ+1)>MAX_FLUID_COLUMNS||
      maxY-minY+1>MAX_VERTICAL_SCAN){
    throw new RangeError('Expected bounded, fully resident WorldGen footprint');
  }
  return Object.freeze({minX,maxX,minZ,maxZ,minY,maxY});
}

function assertCell(cell,footprint){
  if(!cell||![cell.x,cell.z,cell.y].every(Number.isSafeInteger)||
      cell.x<footprint.minX||cell.x>footprint.maxX||
      cell.z<footprint.minZ||cell.z>footprint.maxZ||
      cell.y<footprint.minY||cell.y>footprint.maxY+1){
    throw new RangeError('Invalid authored fluid channel floor');
  }
}

function signedKey(x,z){return x+','+z;}

// Reads only the public Voxel terrain port. Height is the upper face of the
// first solid voxel; transparent air and flowing water never become solids.
export function createFluidTerrainFloorQuery(footprint,terrain){
  const bounds=assertBounds(footprint);
  if(!terrain||typeof terrain.materialAt!=='function'){
    throw new TypeError('Fluid adapter requires a read-only terrain materialAt query');
  }
  return (x,z)=>{
    if(!Number.isSafeInteger(x)||!Number.isSafeInteger(z)||
        x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ){
      throw new RangeError('Fluid query outside resident WorldGen footprint');
    }
    for(let y=bounds.maxY;y>=bounds.minY;y--){
      if(terrain.materialAt(x,y,z)!==0)return y+1;
    }
    // Fully excavated shafts remain at the lower resident boundary.
    return bounds.minY;
  };
}

// The WorldGen endpoint closest to its first authored node is the upstream
// source. No source is synthesized for empty or unsupported channel recipes.
export function createWorldGenFluidEngine(layout,terrain,{
  sourceRate=DEFAULT_SOURCE_RATE,initialDepth=10
}={}){
  const footprint=assertBounds(layout?.footprint);
  const channels=layout?.riverChannels;
  if(!Array.isArray(channels)||channels.length!==1||
      !['water','lava'].includes(channels[0]?.kind)||
      !Array.isArray(channels[0].floor)||channels[0].floor.length<1||
      channels[0].floor.length>MAX_CHANNEL_CELLS){
    throw new TypeError('Expected one authored WorldGen water or lava channel');
  }
  if(!Number.isSafeInteger(initialDepth)||initialDepth<1||initialDepth>10||
      !Number.isSafeInteger(sourceRate)||sourceRate<1||sourceRate>10){
    throw new RangeError('Expected bounded water-seeding settings');
  }
  const [channel]=channels;
  const floorAt=createFluidTerrainFloorQuery(footprint,terrain);
  const floorCells=new Map();
  for(const cell of channel.floor){
    assertCell(cell,footprint);
    const id=signedKey(cell.x,cell.z);
    if(floorCells.has(id))throw new Error('Duplicate WorldGen fluid channel cell');
    floorCells.set(id,cell);
  }
  const source=channel.nodes?.[0]??floorCells.get(signedKey(channel.from?.x,channel.from?.z));
  assertCell(source,footprint);
  if(!floorCells.has(signedKey(source.x,source.z))){
    throw new Error('WorldGen upstream source must lie on an authored channel');
  }
  // All water/lava starts with a finite volume, seeded against actual solid
  // terrain instead of pretending the WorldGen channel descriptor is current.
  const initial=[...floorCells.values()].map(({x,z})=>({x,z,depth:initialDepth}));
  const fluid=new ColumnFluidEngine({
    bounds:{
      minX:footprint.minX,maxX:footprint.maxX,
      minZ:footprint.minZ,maxZ:footprint.maxZ
    },
    floorAt,kind:channel.kind,initial,
    sources:[{
      x:source.x,z:source.z,surfaceY:floorAt(source.x,source.z)+1,
      rate:sourceRate
    }]
  });
  return Object.freeze({
    schema:WORLDGEN_FLUID_SCHEMA,fluid,source:Object.freeze({
      x:source.x,z:source.z,kind:channel.kind
    }),
    channelCellCount:floorCells.size
  });
}

// The terrain integration port remains the only terrain-event publisher.
// Return one disposer so a streamed region never leaves a stale subscription.
export function attachWorldGenFluid(terrain,fluid){
  if(!terrain||typeof terrain.subscribe!=='function'||
      !fluid||typeof fluid.onTerrainChange!=='function'){
    throw new TypeError('Expected terrain port and Water V2 engine');
  }
  return terrain.subscribe('fluids',change=>fluid.onTerrainChange(change));
}
