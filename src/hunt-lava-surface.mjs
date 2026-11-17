import {FIRE_LAVA_TEXELS_PER_VOXEL,FIRE_LAVA_FRAMES_PER_SECOND} from './fire-lava-art.mjs';

// Surface presentation for WorldGen's cut stone channels. Each map texel
// records the authored face height, flow angle, and open shoreline edges.
const CARDINAL=[[-1,0],[1,0],[0,-1],[0,1]];
const key=(x,z)=>x+','+z;

export function huntLavaSurface(layout) {
  const fissures=layout.riverChannels??layout.volcanicTerrain?.physicalFissures;
  if(!fissures?.length)return null;
  const {minX,maxX,minZ,maxZ}=layout.footprint;
  const width=maxX-minX+1,height=maxZ-minZ+1;
  const data=new Uint8Array(width*height*4);
  const cells=new Map();
  for(const {floor,from,to,kind} of fissures){
    const dx=to.x-from.x,dz=to.z-from.z;
    const distance=Math.hypot(dx,dz);
    // Compare the ends of the cut so the motif travels down the channel.
    const ordered=[...floor].sort((a,b)=>((a.x-b.x)*dx+(a.z-b.z)*dz)/distance);
    const endSize=Math.max(1,Math.floor(ordered.length/4));
    const heightSum=cells=>cells.reduce((sum,cell)=>sum+cell.y,0);
    const reverse=heightSum(ordered.slice(0,endSize))<heightSum(ordered.slice(-endSize));
    const angle=Math.atan2(reverse?-dz:dz,reverse?-dx:dx);
    const heading=Math.round((angle+Math.PI)*255/(2*Math.PI));
    for(const cell of floor){
      const localHeading=Number.isFinite(cell.flowX)&&Number.isFinite(cell.flowZ)
        ?Math.round((Math.atan2(cell.flowZ,cell.flowX)+Math.PI)*255/(2*Math.PI)):heading;
      cells.set(key(cell.x,cell.z),{...cell,heading:localHeading,kind});
    }
  }
  let count=0;
  for(const {x,z,y,heading,kind} of cells.values()){
    const neighbors=CARDINAL.map(([dx,dz])=>cells.has(key(x+dx,z+dz)));
    if(!neighbors.some(Boolean))continue;
    const edges=neighbors.reduce((mask,connected,index)=>mask|(!connected<<index),0);
    const offset=((z-minZ)*width+x-minX)*4;
    data.set([y,heading,edges,kind==='water'?128:255],offset);
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

vec3 huntRiverBank(vec3 surface) {
  if(vNormal.y<.5)return surface;
  vec2 point=(floor(vWorld.xz*8.0)+.5)/8.0;
  ivec2 cell=ivec2(floor(point));
  vec2 local=fract(point);
  vec3 result=surface;
  for(int i=0;i<4;i++){
    ivec2 offset=ivec2(0);
    float distanceToBank=0.0;
    if(i==0){offset.x=-1;distanceToBank=local.x;}
    else if(i==1){offset.x=1;distanceToBank=1.0-local.x;}
    else if(i==2){offset.y=-1;distanceToBank=local.y;}
    else{offset.y=1;distanceToBank=1.0-local.y;}
    ivec4 channel=huntLavaCell(cell+offset);
    if(channel.a==0||vWorld.y<float(channel.r))continue;
    float blend=(1.0-smoothstep(.05,.7,distanceToBank))*.55;
    vec3 bank=surface*vec3(.66,.76,.72);
    if(channel.a==255)bank=mix(surface*.44,vec3(.045,.029,.023),.5);
    result=mix(result,bank,blend);
  }
  return result;
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
  if(channel.a==128){
    vec3 water=vec3(.085,.20,.25);
    if(band==1)water=vec3(.11,.28,.32);
    else if(band==2)water=vec3(.15,.36,.40);
    else if(band==3)water=vec3(.28,.48,.49);
    else if(band==4)water=vec3(.55,.69,.65);
    bool waterfall=vNormal.y<.5;
    float foam=waterfall?.62:0.0;
    if(margin<.27&&band>=2)foam=.72;
    water=mix(water,vec3(.73,.81,.71),foam);
    color=srgbToLinearColor(water);
    return true;
  }
  color=fireLavaColor(band);
  return true;
}
`;
