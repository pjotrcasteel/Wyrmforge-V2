// World Generation V2: author sparse, physical 10cm top-voxel occupancy.
// 10x10 height values encode 10x10x10 individual solid microcells. This
// produces crisp cuboid steps, never sheared triangles or displaced vertices.
// Voxel V2 only understands the resulting public initialization data.
export const MICRO_SURFACE_GRAMMAR_SCHEMA='wyrmforge.micro-surface-grammar.v1';
export const MAX_GENERATED_MICRO_TILES=384;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const index=(r,x,z)=>(z+r)*r*2+x+r;

function noise(seed,x,z) {
  let v=(seed ^ Math.imul(x,0x9e3779b1) ^
    Math.imul(z,0x85ebca6b))>>>0;
  v^=v>>>16;
  v=Math.imul(v,0x7feb352d);
  v^=v>>>15;
  v=Math.imul(v,0x846ca68b);
  return ((v^(v>>>16))>>>0)/0x100000000;
}

function distance(x,z,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const sq=dx*dx+dz*dz;
  if(!sq) throw new RangeError('Micro surface route cannot be zero length');
  const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/sq,0,1);
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
}

export function composeMicroSurfaceTiles({
  radius,seed,heights,surfaces,routes,rockFaceThreshold=null
}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>24 ||
      !Number.isSafeInteger(seed) || seed<0 || seed>0xffffffff ||
      !(heights instanceof Int16Array) ||
      !(surfaces instanceof Uint8Array) ||
      heights.length!==(radius*2)**2 ||
      surfaces.length!==heights.length || !Array.isArray(routes)) {
    throw new TypeError('Expected bounded completed WorldGen heightfield');
  }
  const tracks=routes.filter(route=>route.roadProfile);
  const roads=[],cliffs=[];
  for(let z=-radius;z<radius;z++)for(let x=-radius;x<radius;x++) {
    const i=index(radius,x,z),top=heights[i];
    const profile=tracks.find(route=>route.nodes.some((a,j)=>{
      if(!j) return false;
      return distance(x+0.5,z+0.5,route.nodes[j-1],a)<=route.width+0.55;
    }));
    let rockFace=false;
    if(rockFaceThreshold!==null && surfaces[i]===3) {
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,nz=z+dz;
        if(nx<-radius||nx>=radius||nz<-radius||nz>=radius) continue;
        if(Math.abs(top-heights[index(radius,nx,nz)])>=rockFaceThreshold) {
          rockFace=true;break;
        }
      }
    }
    if(!profile && !rockFace) continue;
    const levels=[];
    let changed=false;
    for(let iz=0;iz<10;iz++)for(let ix=0;ix<10;ix++) {
      const px=x+(ix+0.5)*0.1,pz=z+(iz+0.5)*0.1;
      let cut=0;
      if(profile) {
        let nearest=Infinity;
        for(let j=1;j<profile.nodes.length;j++) {
          nearest=Math.min(nearest,
            distance(px,pz,profile.nodes[j-1],profile.nodes[j]));
        }
        // Flat-topped micro voxel road bed, graded shoulder *at 10cm steps*.
        // The authoritative terrain still uses the normal solid material.
        const influence=clamp(profile.width+0.5-nearest,0,1);
        cut=Math.round(profile.roadProfile.nominalCutFraction*10*influence);
      } else if(rockFace) {
        // Staggered cliff lips with coarse clusters of tiny steps.
        // No smoothly tilted top quads and no gratuitous 1000-cell
        // subdivision of ordinary flat land.
        const n=noise(seed,(x*10+ix)>>2,(z*10+iz)>>2);
        cut=1+Math.floor(n*3);
      }
      const level=10-clamp(cut,0,9);
      levels.push(level);
      if(level!==10) changed=true;
    }
    if(changed) {
      const tile={x,y:top,z,levels};
      (profile ? roads : cliffs).push(tile);
    }
  }
  // Keep every authored road first; reserve remaining sparse tile budget for
  // cliff edges. This is an intentionally bounded mobile-memory experiment.
  if(roads.length>MAX_GENERATED_MICRO_TILES) {
    throw new RangeError('Authored road exceeds sparse microvoxel budget');
  }
  const remaining=MAX_GENERATED_MICRO_TILES-roads.length;
  // Select a deterministic scatter of cliff highlights; never depend on
  // Array or platform iteration randomness for replay reproducibility.
  cliffs.sort((a,b)=>{
    const ka=noise(seed,a.x,a.z),kb=noise(seed,b.x,b.z);
    return ka-kb || a.z-b.z || a.x-b.x;
  });
  const tiles=[...roads,...cliffs.slice(0,remaining)];
  tiles.sort((a,b)=>a.y-b.y || a.z-b.z || a.x-b.x);
  return Object.freeze({
    schema:MICRO_SURFACE_GRAMMAR_SCHEMA,
    tileCount:tiles.length,
    roadTiles:roads.length,
    rockTiles:Math.min(cliffs.length,remaining),
    tiles:Object.freeze(tiles)
  });
}
