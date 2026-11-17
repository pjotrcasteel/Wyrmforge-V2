// Render-only geometry derived from Water V2's immutable surface state.
// The floor and liquid connectivity remain the simulation's authority.
// Faces use the SAME orthographic V2 world coordinates as Voxel terrain.
import {FLUID_SURFACE_SCHEMA,MAX_FLUID_COLUMNS} from './column-fluid-engine.mjs';

const SIDES=Object.freeze([
  {dx:1,dz:0,normal:[1,0,0],quad:(x,z,low,high)=>[
    [x+1,low,z],[x+1,high,z],[x+1,high,z+1],[x+1,low,z+1]]},
  {dx:-1,dz:0,normal:[-1,0,0],quad:(x,z,low,high)=>[
    [x,low,z],[x,low,z+1],[x,high,z+1],[x,high,z]]},
  {dx:0,dz:1,normal:[0,0,1],quad:(x,z,low,high)=>[
    [x,low,z+1],[x+1,low,z+1],[x+1,high,z+1],[x,high,z+1]]},
  {dx:0,dz:-1,normal:[0,0,-1],quad:(x,z,low,high)=>[
    [x,low,z],[x,high,z],[x+1,high,z],[x+1,low,z]]}
]);
const CELL_EPSILON=.006;

// Source includes only wet columns. Dry neighboring terrain floors are read
// via the engine's public sampleAt, never guessed from a world heightmap.
export function buildFluidSurfaceMesh(surface,{sampleAt}={}){
  if(surface?.schema!==FLUID_SURFACE_SCHEMA||
      !['water','lava'].includes(surface.kind)||!Array.isArray(surface.cells)||
      surface.cells.length>MAX_FLUID_COLUMNS||typeof sampleAt!=='function'){
    throw new TypeError('Expected bounded Water V2 surface and read-only column sampler');
  }
  const {minX,maxX,minZ,maxZ}=surface.bounds??{};
  if(![minX,maxX,minZ,maxZ].every(Number.isSafeInteger)||
      minX>maxX||minZ>maxZ||surface.cells.length>(maxX-minX+1)*(maxZ-minZ+1)){
    throw new RangeError('Invalid fluid resident bounds');
  }

  const positions=[],normals=[],flows=[],indices=[];
  let faceCount=0,topFaces=0,sideFaces=0;
  const seen=new Set();
  const pushFace=(quad,normal,flow)=>{
    const vertex=positions.length/3;
    for(const point of quad){
      positions.push(...point);
      normals.push(...normal);
      flows.push(flow[0],flow[1]);
    }
    indices.push(vertex,vertex+1,vertex+2,vertex,vertex+2,vertex+3);
    faceCount++;
  };
  for(const c of surface.cells){
    if(!c||![c.x,c.z,c.floorY,c.surfaceY,c.depth].every(Number.isFinite)||
        !Number.isInteger(c.x)||!Number.isInteger(c.z)||!Number.isInteger(c.floorY)||
        c.x<minX||c.x>maxX||c.z<minZ||c.z>maxZ||
        c.depth<1||c.depth>160||
        Math.abs(c.surfaceY-(c.floorY+c.depth/10))>1e-6){
      throw new RangeError('Invalid fluid surface column');
    }
    const key=c.x+','+c.z;
    if(seen.has(key))throw new Error('Duplicate wet column in fluid mesh');
    seen.add(key);
    if(![c.flowX,c.flowZ].every(v=>Number.isInteger(v)&&Math.abs(v)<=1)){
      throw new RangeError('Fluid flow direction must be a signed cardinal vector');
    }
    const x=c.x,z=c.z,high=c.surfaceY+CELL_EPSILON;
    const flow=[c.flowX,c.flowZ];
    pushFace([
      [x,high,z],[x,high,z+1],[x+1,high,z+1],[x+1,high,z]
    ],[0,1,0],flow);
    topFaces++;
    for(const side of SIDES){
      const nx=x+side.dx,nz=z+side.dz;
      if(nx<minX||nx>maxX||nz<minZ||nz>maxZ)continue;
      const neighbor=sampleAt(nx,nz);
      if(!neighbor||!Number.isFinite(neighbor.floorY))continue;
      // A higher dry bank hides the side. A lower liquid head exposes only
      // the actual differential; zero-depth terrain is not liquid.
      const lower=Math.max(c.floorY,
        neighbor.depth>0?neighbor.surfaceY:neighbor.floorY);
      if(lower>=c.surfaceY-0.01)continue;
      pushFace(side.quad(x,z,lower,high),side.normal,flow);
      sideFaces++;
    }
  }
  return Object.freeze({
    schema:'wyrmforge.fluid-surface-mesh.v1',
    kind:surface.kind,step:surface.step,faceCount,topFaces,sideFaces,
    vertexCount:faceCount*4,triangleCount:faceCount*2,
    positions:new Float32Array(positions),
    normals:new Int8Array(normals),
    flows:new Int8Array(flows),
    indices:new Uint32Array(indices)
  });
}
