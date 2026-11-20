// LAVA-02: one immutable, deterministic tileable 256px MATERIAL atlas.
// 50 field references: docs/research/lava-v2-50-source-field-study.md.
// Real lava develops floating dark plates and narrow incandescent spreading
// zones, not an orange speckle field or checkerboard of uniform 1m symbols.
//
// CPU builds this texture ONCE per WebGL context. Mobile draw uses one
// nearest-filtered RGBA8 texelFetch per molten pixel; no shader Voronoi,
// dynamic texture uploads or runtime noise. Visual plates do NOT create
// collision/stone or change real conserved lava volume.
export const LAVA_CRUST_ATLAS_SIZE=256;
export const LAVA_CRUST_ATLAS_BYTES=LAVA_CRUST_ATLAS_SIZE**2*4;
const GRID=8;
const PITCH=LAVA_CRUST_ATLAS_SIZE/GRID;
const TAU=Math.PI*2;
const clamp=value=>Math.max(0,Math.min(1,value));

function hash(x,z){
  let h=(Math.imul(x,73856093)^Math.imul(z,19349663)^0x1f63ac93)>>>0;
  h=Math.imul(h^(h>>>16),2246822507)>>>0;
  return ((h^(h>>>13))>>>0)/4294967296;
}

const wrap=value=>(value%GRID+GRID)%GRID;

// Irregular wrapping polygonal crust with thin, emissive seams.
// Every site is periodic across the texture edges so a long river never
// develops a 25m checkerboard border. Site jitter keeps plate sizes varied.
export function buildLavaCrustAtlas(){
  const n=LAVA_CRUST_ATLAS_SIZE;
  const pixels=new Uint8Array(LAVA_CRUST_ATLAS_BYTES);
  const sites=new Map();
  for(let z=-2;z<=9;z++)for(let x=-2;x<=9;x++){
    const hx=hash(wrap(x),wrap(z));
    const hz=hash(wrap(z),wrap(x));
    sites.set(x+','+z,{
      x:(x+.5+(hx-.5)*.84)*PITCH,
      z:(z+.5+(hz-.5)*.84)*PITCH,hx,hz
    });
  }
  // Precompute only four short wave tables (1024 sin evaluations total).
  // This gently bends fractures, without per-fragment trigonometry.
  const warpX=new Float32Array(n),warpY=new Float32Array(n);
  const warpZ=new Float32Array(n),warpW=new Float32Array(n);
  for(let i=0;i<n;i++){
    const phase=TAU*i/n;
    warpX[i]=6*Math.sin(3*phase);
    warpY[i]=2*Math.sin(2*phase);
    warpZ[i]=5*Math.sin(4*phase);
    warpW[i]=2*Math.sin(2*phase);
  }
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){
    const px=x+warpX[z]+warpY[x];
    const pz=z+warpZ[x]+warpW[z];
    const bx=Math.floor(px/PITCH),bz=Math.floor(pz/PITCH);
    let first=Infinity,second=Infinity,nearest=null;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const site=sites.get((bx+dx)+','+(bz+dz));
      const ddx=px-site.x,ddz=pz-site.z;
      const distance=ddx*ddx+ddz*ddz;
      if(distance<first){
        second=first;
        first=distance;
        nearest=site;
      }else if(distance<second)second=distance;
    }
    const difference=Math.sqrt(second)-Math.sqrt(first);
    const iron=clamp((6.5-difference)/6.5);
    const core=clamp((2.4-difference)/2.4);
    const {hx,hz}=nearest;
    const brightPlate=hx>.82;
    const dark=brightPlate?[.33+.24*hz,.053+.045*hz,.015+.012*hz]:
      [.085+.08*hx,.065+.042*hx,.072+.028*hx];
    const out=(z*n+x)*4;
    for(let channel=0;channel<3;channel++){
      const ironColor=[.47,.10,.026][channel];
      const hotColor=[.98,.45,.072][channel];
      const afterIron=dark[channel]*(1-iron)+ironColor*iron;
      pixels[out+channel]=Math.round(255*
        (afterIron*(1-core)+hotColor*core));
    }
    pixels[out+3]=255;
  }
  return pixels;
}
