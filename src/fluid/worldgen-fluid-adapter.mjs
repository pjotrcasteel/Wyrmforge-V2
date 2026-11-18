// Water V2 ↔ WorldGen/Voxel contract adapter.
// No generator, material renderer, private Voxel data or browser dependencies.
// Create only after the terrain port has a fully resident site loaded.
import {
  ColumnFluidEngine,MAX_FLUID_COLUMNS,MAX_FLUID_SOURCES
} from './column-fluid-engine.mjs';

export const WORLDGEN_FLUID_SCHEMA='wyrmforge.fluid-worldgen-adapter.v1';
const MAX_VERTICAL_SCAN=128;
const MAX_CHANNEL_CELLS=4096;
const DEFAULT_SOURCE_RATE=3;
export const DEFAULT_CHANNEL_DEPTH_UNITS=4; // 40cm: water sits well below the grass bank

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
  sourceRate=DEFAULT_SOURCE_RATE,initialDepth=DEFAULT_CHANNEL_DEPTH_UNITS
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
  // Keep the authored river's real upstream mouth wetted, rather than a
  // single sparse cell in a potentially four-metre-wide stream. These bounded
  // inlets are drawn only from the upstream cross-section of actual WorldGen
  // river-bed cells: no groundwater, downstream teleport or invented terrain.
  const next=channel.nodes?.[1]??source;
  const alongX=Math.sign(next.x-source.x),alongZ=Math.sign(next.z-source.z);
  const mouth=[...floorCells.values()]
    .filter(cell=>{
      const dx=cell.x-source.x,dz=cell.z-source.z;
      const projection=dx*alongX+dz*alongZ;
      return dx*dx+dz*dz<=4&&projection<=0;
    })
    .sort((a,b)=>{
      const ax=a.x-source.x,az=a.z-source.z;
      const bx=b.x-source.x,bz=b.z-source.z;
      return ax*ax+az*az-(bx*bx+bz*bz)||a.z-b.z||a.x-b.x;
    })
    .slice(0,MAX_FLUID_SOURCES);
  // The last authored river mouth is an OPEN boundary. Water can continue
  // downstream at its published pool depth instead of collecting forever in
  // a closed finite bathtub and gradually drowning the upper waterfall.
  const sink=channel.nodes?.at(-1)??
    floorCells.get(signedKey(channel.to?.x,channel.to?.z));
  const beforeSink=channel.nodes?.at(-2)??source;
  const sinkX=Math.sign((sink?.x??source.x)-beforeSink.x);
  const sinkZ=Math.sign((sink?.z??source.z)-beforeSink.z);
  const inletKeys=new Set(mouth.map(({x,z})=>signedKey(x,z)));
  const exits=[...floorCells.values()]
    .filter(cell=>{
      if(!sink||inletKeys.has(signedKey(cell.x,cell.z)))return false;
      const dx=cell.x-sink.x,dz=cell.z-sink.z;
      return dx*dx+dz*dz<=4&&dx*sinkX+dz*sinkZ>=-1;
    })
    .sort((a,b)=>{
      const ax=a.x-sink.x,az=a.z-sink.z;
      const bx=b.x-sink.x,bz=b.z-sink.z;
      return ax*ax+az*az-(bx*bx+bz*bz)||a.z-b.z||a.x-b.x;
    })
    .slice(0,MAX_FLUID_SOURCES);
  // The river grammar already publishes the physical downstream heading on
  // each authored bed cell. Keep one bounded, cardinal current per cell,
  // constrained to a real neighboring river cell at equal/lower solid height.
  // Unauthored crater water remains governed by ordinary pressure exchange.
  const currents=[];
  const fallbackX=(sink?.x??source.x)-source.x;
  const fallbackZ=(sink?.z??source.z)-source.z;
  for(const cell of floorCells.values()){
    const flowX=cell.flowX||fallbackX;
    const flowZ=cell.flowZ||fallbackZ;
    const currentFloor=floorAt(cell.x,cell.z);
    const candidates=[[0,-1],[1,0],[0,1],[-1,0]]
      .map(([dx,dz])=>{
        const next=floorCells.get(signedKey(cell.x+dx,cell.z+dz));
        if(!next||floorAt(next.x,next.z)>currentFloor)return null;
        const alignment=dx*flowX+dz*flowZ;
        return alignment>0?{dx,dz,alignment}:null;
      })
      .filter(Boolean)
      .sort((a,b)=>b.alignment-a.alignment||a.dz-b.dz||a.dx-b.dx);
    if(candidates.length)currents.push({
      x:cell.x,z:cell.z,dx:candidates[0].dx,dz:candidates[0].dz
    });
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
    sources:mouth.map(({x,z})=>({
      x,z,surfaceY:floorAt(x,z)+initialDepth/10,rate:sourceRate
    })),
    outlets:exits.map(({x,z})=>({
      x,z,surfaceY:floorAt(x,z)+initialDepth/10,
      rate:Math.min(10,Math.max(sourceRate,
        Math.ceil(mouth.length*sourceRate/Math.max(1,exits.length))))
    })),
    currents
  });
  return Object.freeze({
    schema:WORLDGEN_FLUID_SCHEMA,fluid,source:Object.freeze({
      x:source.x,z:source.z,kind:channel.kind
    }),
    channelCellCount:floorCells.size,
    inletCellCount:mouth.length,
    outletCellCount:exits.length,
    currentCellCount:currents.length,
    channelDepthUnits:initialDepth
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
