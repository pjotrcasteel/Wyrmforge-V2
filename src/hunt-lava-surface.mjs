import {FIRE_LAVA_TEXELS_PER_VOXEL,FIRE_LAVA_FRAMES_PER_SECOND} from './fire-lava-art.mjs';

// Surface presentation for WorldGen's cut stone channels. Each map texel
// records the authored face height, flow angle, and open shoreline edges.
const CARDINAL=[[-1,0],[1,0],[0,-1],[0,1]];
const key=(x,z)=>x+','+z;

export function huntLavaSurface(layout) {
  const fissures=layout.volcanicTerrain?.physicalFissures;
  if(!fissures?.length)return null;
  const {minX,maxX,minZ,maxZ}=layout.footprint;
  const width=maxX-minX+1,height=maxZ-minZ+1;
  const data=new Uint8Array(width*height*4);
  const cells=new Map();
  for(const {floor,from,to} of fissures){
    const dx=to.x-from.x,dz=to.z-from.z;
    const distance=Math.hypot(dx,dz);
    // Compare the ends of the cut so the motif travels down the channel.
    const ordered=[...floor].sort((a,b)=>((a.x-b.x)*dx+(a.z-b.z)*dz)/distance);
    const endSize=Math.max(1,Math.floor(ordered.length/4));
    const heightSum=cells=>cells.reduce((sum,cell)=>sum+cell.y,0);
    const reverse=heightSum(ordered.slice(0,endSize))<heightSum(ordered.slice(-endSize));
    const angle=Math.atan2(reverse?-dz:dz,reverse?-dx:dx);
    const heading=Math.round((angle+Math.PI)*255/(2*Math.PI));
    for(const cell of floor)cells.set(key(cell.x,cell.z),{...cell,heading});
  }
  let count=0;
  for(const {x,z,y,heading} of cells.values()){
    const neighbors=CARDINAL.map(([dx,dz])=>cells.has(key(x+dx,z+dz)));
    if(!neighbors.some(Boolean))continue;
    const edges=neighbors.reduce((mask,connected,index)=>mask|(!connected<<index),0);
    const offset=((z-minZ)*width+x-minX)*4;
    data.set([y,heading,edges,255],offset);
    count++;
  }
  return count?{origin:[minX,minZ],size:[width,height],data,count}:null;
}

export const HUNT_LAVA_SURFACE_GLSL=`
ivec4 huntLavaCell(ivec2 cell) {
  ivec2 at=cell-ivec2(uHuntLavaOrigin);
  if(any(lessThan(at,ivec2(0)))||any(greaterThanEqual(at,textureSize(uHuntLava,0))))return ivec4(0);
  return ivec4(round(texelFetch(uHuntLava,at,0)*255.0));
}

bool huntLavaSurface(out vec3 color) {
  if(abs(vMaterial-3.0)>.5||vNormal.y<-.5)return false;
  ivec2 cell=ivec2(floor((vWorld-vNormal*.002).xz));
  ivec4 channel=huntLavaCell(cell);
  if(channel.a==0)return false;

  const float density=${FIRE_LAVA_TEXELS_PER_VOXEL}.0;
  vec2 position=(floor(vWorld.xz*density)+.5)/density;
  vec2 local=position-vec2(cell);
  float angle=float(channel.g)*6.2831853/255.0-3.14159265;
  vec2 downstream=vec2(cos(angle),sin(angle));
  vec2 across=vec2(-downstream.y,downstream.x);
  float travel=dot(position,downstream);
  float margin=1.0;
  if(vNormal.y>.5){
    if(abs(vWorld.y-float(channel.r))>.015)return false;
    if((channel.b&1)!=0)margin=min(margin,local.x);
    if((channel.b&2)!=0)margin=min(margin,1.0-local.x);
    if((channel.b&4)!=0)margin=min(margin,local.y);
    if((channel.b&8)!=0)margin=min(margin,1.0-local.y);
  }else{
    ivec4 lower=huntLavaCell(cell+ivec2(round(vNormal.xz)));
    if(lower.a==0||float(lower.r)>=float(channel.r)||
      vWorld.y<float(lower.r)||vWorld.y>float(channel.r))return false;
    // A spill descends onto the adjacent floor only in the downstream direction.
    if(dot(downstream,vNormal.xz)<.24)return false;
    travel+=float(channel.r)-vWorld.y;
  }

  int lateral=int(floor(dot(position,across)*density));
  int lane=int(floor(float(lateral)/12.0));
  int pace=margin<.35?3:4;
  int frame=int(floor(uLabTime*${FIRE_LAVA_FRAMES_PER_SECOND}.0))*pace/4;
  int column=int(mod(floor(travel*density)-float(frame)+float(lane*7),24.0));
  int row=int(mod(float(lateral),12.0));
  if((lane&1)!=0)row=11-row;
  int band=int((LAB_LAVA_MOTIF[row][column/8]>>uint(3*(column%8)))&7u);
  if(margin<.09)return false;
  if(margin<.21)band=0;
  else if(margin<.38)band=min(band,1);
  color=fireLavaColor(band);
  return true;
}
`;
