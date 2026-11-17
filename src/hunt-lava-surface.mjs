import {waterRippleMotifGlsl} from './river-water-art.mjs';
import {FIRE_LAVA_TEXELS_PER_VOXEL} from './fire-lava-art.mjs';

// Surface presentation for WorldGen's cut stone channels. Each map texel
// records the authored face height, flow angle, and open shoreline edges.
const CARDINAL=[[-1,0],[1,0],[0,-1],[0,1]];
const key=(x,z)=>x+','+z;
// Keep signed terrain heights in the existing RGBA8 channel map.
export const HUNT_CHANNEL_HEIGHT_OFFSET=8;

export function huntLavaSurface(layout,world=null) {
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
      let y=cell.y;
      if(world){
        let ground=y-1;
        const minY=layout.footprint.minY;
        while(ground>=minY&&world.get(cell.x,ground,cell.z)===0)ground--;
        const material=ground>=minY?world.get(cell.x,ground,cell.z):0;
        if(material!==3&&material!==4)continue;
        y=ground+1;
      }
      const localHeading=Number.isFinite(cell.flowX)&&Number.isFinite(cell.flowZ)
        ?Math.round((Math.atan2(cell.flowZ,cell.flowX)+Math.PI)*255/(2*Math.PI)):heading;
      cells.set(key(cell.x,cell.z),{...cell,y,heading:localHeading,kind});
    }
  }
  const shoreline=[];
  for(const cell of cells.values()){
    const neighbors=CARDINAL.map(([dx,dz])=>cells.has(key(cell.x+dx,cell.z+dz)));
    cell.edges=neighbors.reduce((mask,connected,index)=>mask|(!connected<<index),0);
    cell.shore=15;
    if(cell.edges){
      cell.shore=0;
      shoreline.push(cell);
    }
  }
  // Pack distance from the bank into the unused high four bits. This
  // remains one bounded texture and changes only with the channel footprint.
  for(let i=0;i<shoreline.length;i++){
    const cell=shoreline[i];
    for(const [dx,dz] of CARDINAL){
      const next=cells.get(key(cell.x+dx,cell.z+dz));
      if(!next||next.shore<=cell.shore+1)continue;
      next.shore=cell.shore+1;
      shoreline.push(next);
    }
  }
  let count=0;
  for(const {x,z,y,heading,kind,edges,shore} of cells.values()){
    if(edges===15)continue;
    const offset=((z-minZ)*width+x-minX)*4;
    data.set([y+HUNT_CHANNEL_HEIGHT_OFFSET,heading,edges|(shore<<4),kind==='water'?128:255],offset);
    count++;
  }
  return count?{origin:[minX,minZ],size:[width,height],data,count}:null;
}

export const HUNT_LAVA_SURFACE_GLSL=`
${waterRippleMotifGlsl()}

ivec4 huntLavaCell(ivec2 cell) {
  ivec2 at=cell-ivec2(uHuntLavaOrigin);
  if(any(lessThan(at,ivec2(0)))||any(greaterThanEqual(at,textureSize(uHuntLava,0))))return ivec4(0);
  ivec4 channel=ivec4(round(texelFetch(uHuntLava,at,0)*255.0));
  channel.r-=${HUNT_CHANNEL_HEIGHT_OFFSET};
  return channel;
}


// Interpolate only the bank-distance field. Heights and channel IDs keep
// nearest-texel lookup so a cliff never acquires an interpolated fluid face.
float huntWaterDepth(vec2 point) {
  vec2 centered=point-.5;
  ivec2 base=ivec2(floor(centered));
  vec2 blend=fract(centered);
  ivec4 a=huntLavaCell(base);
  ivec4 b=huntLavaCell(base+ivec2(1,0));
  ivec4 c=huntLavaCell(base+ivec2(0,1));
  ivec4 d=huntLavaCell(base+ivec2(1,1));
  float da=a.a==128?float(a.b>>4)+.5:-.5;
  float db=b.a==128?float(b.b>>4)+.5:-.5;
  float dc=c.a==128?float(c.b>>4)+.5:-.5;
  float dd=d.a==128?float(d.b>>4)+.5:-.5;
  return max(0.0,mix(mix(da,db,blend.x),mix(dc,dd,blend.x),blend.y));
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
  if(vMaterial<2.5||vMaterial>4.5||vNormal.y<-.5)return false;
  ivec2 cell=ivec2(floor((vWorld-vNormal*.002).xz));
  ivec4 channel=huntLavaCell(cell);
  if(channel.a==0)return false;

  const float density=${FIRE_LAVA_TEXELS_PER_VOXEL}.0;
  vec2 position=(floor(vWorld.xz*density)+.5)/density;
  vec2 local=position-vec2(cell);
  float angle=float(channel.g)*6.2831853/255.0-3.14159265;
  vec2 downstream=vec2(cos(angle),sin(angle));
  vec2 across=vec2(-downstream.y,downstream.x);
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
    // Local height differences define spills, including cross-current steps.
  }

  if(channel.a==128){
    // Pools retain broad color fields. Whole-pixel glints carry the flow.
    bool waterfall=vNormal.y<.5;
    vec2 waterUv=position;
    float frame=floor(uLabTime*4.0);
    if(waterfall)waterUv=vec2(dot(position,across),-vWorld.y);
    vec2 drift=downstream*frame*.125;
    if(waterfall)drift=vec2(0.0,frame*.25);
    ivec2 pixel=ivec2(floor((waterUv-drift)*density));
    int column=int(mod(float(pixel.x),32.0));
    int row=int(mod(float(pixel.y),16.0));
    int ripple=int((HUNT_WATER_RIPPLES[row][column/8]>>uint(3*(column%8)))&7u);
    float depth=huntWaterDepth(position);
    float grains=soilHash(floor(vWorld.xz*density)+float(channel.r)*7.0);
    float current=labNoise((position-downstream*frame*.055)*vec2(.48,.28)+17.0);
    float pools=labNoise(position*.18+51.0);
    float colorBand=floor(current*5.0)/4.0;
    vec3 deep=vec3(.075,.28,.32);
    vec3 shallows=vec3(.22,.49,.44);
    vec3 water=mix(shallows,deep,smoothstep(.1,2.6,depth));
    water=mix(water,vec3(.15,.43,.46),colorBand*.44);
    water*=.92+.13*floor(pools*4.0)/3.0;
    // Underwater stones and the bank shadow form a narrow irregular margin.
    float shoreNoise=labNoise(floor(position*4.0)*.9+8.0);
    if(!waterfall&&margin<.065+.13*shoreNoise)return false;
    float bankShadow=(1.0-smoothstep(.06,.42,depth))*(.22+.18*shoreNoise);
    water*=1.0-bankShadow;
    if(depth<.65&&shoreNoise>.65&&grains>.82){
      water=mix(water,vec3(.28,.39,.30),.40);
    }
    // Broad faint current seams sit beneath the sparse small highlights.
    if(current>.54&&current<.60)water=mix(water,vec3(.29,.59,.57),.24);
    if(ripple==3)water=mix(water,vec3(.29,.55,.54),.22);
    if(ripple==1)water=mix(water,vec3(.35,.61,.58),.45);
    if(ripple==2)water=vec3(.45,.69,.64);

    float foam=0.0;
    float crest=0.0;
    if(waterfall){
      float heightBelowLip=float(channel.r)-vWorld.y;
      float ribbons=soilHash(vec2(floor(dot(position,across)*density*.5),float(channel.r)));
      float pulse=mod(floor(-vWorld.y*density)-frame,13.0);
      water=mix(vec3(.13,.39,.42),vec3(.32,.62,.61),ribbons*.6);
      water*=.88+.12*smoothstep(0.0,1.0,heightBelowLip);
      if(ribbons>.78&&pulse<6.0)foam=.42;
    }else{
      ivec2 cellOffsets[4]=ivec2[4](ivec2(-1,0),ivec2(1,0),ivec2(0,-1),ivec2(0,1));
      float edgeDistances[4]=float[4](local.x,1.0-local.x,local.y,1.0-local.y);
      float eddies=labNoise((position-downstream*frame*.025)*3.2+19.0);
      for(int i=0;i<4;i++){
        ivec4 upstream=huntLavaCell(cell+cellOffsets[i]);
        if(upstream.a==128&&upstream.r>channel.r){
          float reach=.10+.40*eddies;
          if(edgeDistances[i]<reach&&eddies>.52&&grains>.42){
            foam=max(foam,.25+.34*eddies);
          }
          if(edgeDistances[i]<.75&&eddies>.44&&eddies<.50)crest=.3;
        }
      }
      if(margin<.23&&shoreNoise>.63&&grains>.68)foam=max(foam,.22);
    }
    water=mix(water,vec3(.48,.72,.68),crest);
    water=mix(water,vec3(.75,.86,.77),foam);
    color=srgbToLinearColor(water);
    return true;
  }

  if(margin<.07)return false;
  color=fireLavaSurface(position,downstream,margin,vNormal.y<.5,
    float(channel.r)-vWorld.y,uLabTime);
  return true;
}
`;
