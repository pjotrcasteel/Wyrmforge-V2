// Replaceable surface-mesh presentation adapter, not a voxel authority.
// It consumes only the versioned generated-site layout and public VoxelWorld
// get(), and never changes voxels, saves, jobs, or renderer implementations.
// Vertical coordinates are quantized to 0.1 voxel (10 cm at a 1 m voxel).
export const SURFACE_DETAIL_SCHEMA='wyrmforge.surface-presentation.v1';
export const SURFACE_UNIT=0.1;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const key=(x,z)=>x+','+z;

function hash2(seed,x,z) {
  let value=(seed ^ Math.imul(x,0x9e3779b1) ^
    Math.imul(z,0x85ebca6b))>>>0;
  value^=value>>>16;
  value=Math.imul(value,0x7feb352d);
  value^=value>>>15;
  value=Math.imul(value,0x846ca68b);
  return ((value^(value>>>16))>>>0)/0x100000000;
}

function smoothNoise(seed,x,z,period) {
  const fx=x/period,fz=z/period;
  const ix=Math.floor(fx),iz=Math.floor(fz);
  const tx=fx-ix,tz=fz-iz;
  const sx=tx*tx*(3-2*tx),sz=tz*tz*(3-2*tz);
  const a=hash2(seed,ix,iz),b=hash2(seed,ix+1,iz);
  const c=hash2(seed,ix,iz+1),d=hash2(seed,ix+1,iz+1);
  return (a+(b-a)*sx)*(1-sz)+(c+(d-c)*sx)*sz;
}

function distanceToSegment(x,z,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const square=dx*dx+dz*dz;
  if(square===0) throw new RangeError('Degenerate surface route');
  const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/square,0,1);
  return Math.hypot(x-(a.x+t*dx),z-(a.z+t*dz));
}

export function createSurfaceDetailSampler(site) {
  if(!site || site.schema!=='wyrmforge.generated-site.v2' ||
      !Number.isSafeInteger(site.recipe?.seed) ||
      !Array.isArray(site.layout?.routes) || !site.layout.footprint) {
    throw new TypeError('Expected versioned public World Generation site');
  }
  const routes=site.layout.routes.filter(route=>route.roadProfile);
  const seed=site.recipe.seed;
  const geology=site.layout.geology;
  const {minY,maxY}=site.layout.footprint;
  const roughness=geology?.rockFaceThreshold !== null &&
    geology?.rockFaceThreshold !== undefined ? 3 :
    maxY-minY>=12 ? 2 : 1;
  const cache=new Map();
  const sampleTenths=(x,z)=>{
    if(!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) {
      throw new TypeError('Surface corner coordinates must be integers');
    }
    const id=key(x,z);
    if(cache.has(id)) return cache.get(id);
    const longWave=smoothNoise(seed^0x13579bdf,x,z,5)-0.5;
    const shortWave=smoothNoise(seed^0x2468ace0,x,z,2)-0.5;
    const organic=Math.round((longWave*1.4+shortWave*0.6)*roughness);
    let roadCut=0;
    for(const route of routes) {
      let distance=Infinity;
      for(let i=1;i<route.nodes.length;i++) {
        distance=Math.min(distance,distanceToSegment(
          x,z,route.nodes[i-1],route.nodes[i]
        ));
      }
      // A graded shoulder fades the cut smoothly to zero at roadWidth+1,
      // and the minimum 1/10 visual cut applies only inside the route.
      const width=route.width;
      const influence=clamp(width+1-distance,0,1);
      const tenths=Math.round(route.roadProfile.nominalCutFraction*10);
      roadCut=Math.max(roadCut,Math.round(tenths*influence));
    }
    const value=clamp(organic-roadCut,-6,5);
    cache.set(id,value);
    return value;
  };
  return Object.freeze({
    schema:SURFACE_DETAIL_SCHEMA,verticalUnit:SURFACE_UNIT,
    roughnessTenths:roughness,roadProfiles:routes.length,
    sampleTenths,
    sampleOffset:(x,z)=>sampleTenths(x,z)*SURFACE_UNIT
  });
}

export function presentGeneratedSurfaceMeshes({site,world,meshes}) {
  if(!world || typeof world.get!=='function' ||
      !Array.isArray(meshes)) {
    throw new TypeError('Expected current voxel world and exposed-face meshes');
  }
  const sampler=createSurfaceDetailSampler(site);
  const {minX,maxX,minZ,maxZ,minY,maxY}=site.layout.footprint;
  const tops=new Map();
  const topAt=(x,z)=>{
    if(x<minX || x>maxX || z<minZ || z>maxZ) return null;
    const id=key(x,z);
    if(tops.has(id)) return tops.get(id);
    let top=null;
    for(let y=maxY;y>=minY;y--) {
      if(world.get(x,y,z)!==0) {top=y+1;break;}
    }
    tops.set(id,top);
    return top;
  };
  const isSurfaceCorner=(x,y,z)=>{
    // Any of the 4 columns touching the same corner may terminate at Y.
    // This handles upper ledges AND lower wall-to-top junctions; each
    // repeated vertex gets the exact same offset across chunk seams.
    for(let dx=-1;dx<=0;dx++)for(let dz=-1;dz<=0;dz++) {
      if(topAt(x+dx,z+dz)===y) return true;
    }
    return false;
  };
  return meshes.map(mesh=>{
    if(!mesh || !(mesh.positions instanceof Float32Array) ||
        !Array.isArray(mesh.origin) || mesh.origin.length!==3 ||
        mesh.positions.length%3!==0) {
      throw new TypeError('Expected bounded, origin-relative V2 mesh positions');
    }
    const positions=mesh.positions.slice();
    for(let i=0;i<positions.length;i+=3) {
      const x=positions[i]+mesh.origin[0];
      const y=positions[i+1]+mesh.origin[1];
      const z=positions[i+2]+mesh.origin[2];
      if(isSurfaceCorner(x,y,z)) {
        positions[i+1]=Math.round((positions[i+1]+
          sampler.sampleOffset(x,z))*10)/10;
      }
    }
    return {...mesh,positions};
  });
}
