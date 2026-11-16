import {fireLavaMotifGlsl,FIRE_LAVA_TEXELS_PER_VOXEL,FIRE_LAVA_FRAMES_PER_SECOND} from './fire-lava-art.mjs';
import {FIRE_ROAD_FADING_Z,FIRE_ROAD_APPROACH_Z,FIRE_ROAD_LAVA_Z} from './fire-hunt-material-lab.mjs';
// These paths are enabled only for lab fixtures that publish a material volume.
export const FIRE_MATERIAL_LAB_UNIFORMS_GLSL=`
uniform highp sampler3D uLabMaterials;
uniform bool uLabEnabled;
uniform bool uLabBlend;
uniform int uLabGrassStyle;
uniform int uLabForestStage;
uniform float uLabTime;
uniform vec3 uLabOrigin;
`;

export const FIRE_MATERIAL_LAB_GLSL=`
float labNoise(vec2 p) {
  vec2 i=floor(p);
  vec2 f=smoothstep(vec2(0.0),vec2(1.0),fract(p));
  return mix(mix(soilHash(i),soilHash(i+vec2(1,0)),f.x),
    mix(soilHash(i+vec2(0,1)),soilHash(i+1.0),f.x),f.y);
}

int labMaterial(ivec3 p) {
  ivec3 cell=p-ivec3(uLabOrigin);
  if(any(lessThan(cell,ivec3(0)))||any(greaterThanEqual(cell,textureSize(uLabMaterials,0))))return 0;
  return int(round(texelFetch(uLabMaterials,cell,0).r*255.0));
}

vec3 labGrassTint(vec2 uv) {
  if(uLabGrassStyle==0)return vec3(1.0);
  float coverage=smoothstep(.29,.73,labNoise(uv*.21)+.16*(labNoise(uv*.67)-.5));
  vec3 low=vec3(.63,.68,.82),high=vec3(1.14,1.15,.91);
  if(uLabGrassStyle==2){low=vec3(.82,.84,.78);high=vec3(1.12,1.19,.97);}
  if(uLabGrassStyle==3){low=vec3(.71,.75,.90);high=vec3(1.08,1.10,1.13);}
  return mix(low,high,coverage);
}

vec3 labForestGrade(vec3 color,int material,vec2 uv) {
  if(uLabForestStage==0)return color;
  float pockets=labNoise(uv*.16)+.18*(labNoise(uv*.41)-.5);
  float clearing=smoothstep(.24,.79,pockets);
  vec3 canopy=color*vec3(1.03,1.26,.91);
  vec3 daylight=color*vec3(1.37,1.77,1.04)+vec3(.011,.026,.003);
  vec3 living=material==1?mix(canopy,daylight,clearing):color;
  if(uLabForestStage==1)return living;
  float value=dot(color,vec3(.2126,.7152,.0722));
  vec3 dusk=mix(color*vec3(.72,.82,.95),vec3(value)*vec3(.67,.78,.87),.24);
  if(uLabForestStage==2)return dusk;
  vec3 cooled=color*vec3(.58,.56,.64);
  vec3 soot=vec3(value)*mix(vec3(.57,.49,.55),vec3(.84,.53,.37),smoothstep(.40,.75,pockets));
  vec3 burned=mix(cooled,soot,material==1?.82:.51);
  if(uLabForestStage==3)return burned;

  // World position drives the transition, so approaching or retreating never
  // changes the color of a stationary piece of ground.
  float depth=-uv.y+(pockets-.5)*3.0;
  float fading=smoothstep(${-FIRE_ROAD_FADING_Z-2}.0,${-FIRE_ROAD_FADING_Z+2}.0,depth);
  float fire=smoothstep(${-FIRE_ROAD_APPROACH_Z-3}.0,${-FIRE_ROAD_APPROACH_Z+3}.0,depth);
  return mix(mix(living,dusk,fading),burned,fire);
}

vec3 labForestDetail(vec3 color,int material,vec2 uv) {
  if(uLabForestStage==0||material>2)return color;
  // Small authored silhouettes on the art grid, grouped in clearings and ruts.
  // Jitter their anchors in world space so the shapes cross voxel tile lines.
  vec2 pixel=floor(uv*12.0);
  vec2 grid=floor((pixel+vec2(5,3))/vec2(19,17));
  vec2 anchor=grid*vec2(19,17)-vec2(5,3)+vec2(4,4)
    +floor(vec2(soilHash(grid+2.0),soilHash(grid+15.0))*vec2(10,8));
  vec2 p=pixel-anchor;
  int stage=uLabForestStage;
  if(stage==4){
    float anchorZ=anchor.y/12.0+(soilHash(grid+8.0)-.5)*3.0;
    stage=anchorZ>${FIRE_ROAD_FADING_Z}.0?1:anchorZ>${FIRE_ROAD_APPROACH_Z}.0?2:3;
  }
  float field=labNoise(pixel/53.0);
  float chance=soilHash(grid+31.0);
  if(material==1){
    float mossPatch=step(.44,labNoise(pixel/23.0)+.22*labNoise(pixel/8.0));
    color=mix(color*.83,color*1.13,mossPatch);
    // A few flower colonies occupy the sunlit verge. Their ochre remnants
    // turn into blackened ground with isolated hot flecks nearer the Wyrm.
    float verge=length((uv-vec2(-2.7,4.2))*vec2(.70,.29));
    bool colony=verge<1.1&&field>.36&&chance<.67;
    bool petals=(abs(p.x)==1.0&&p.y==-1.0)||(p.x==0.0&&p.y>=-2.0&&p.y<=0.0);
    if(colony&&petals){
      if(stage==1){
        vec3 gold=p.x==0.0&&p.y==-1.0?vec3(.89,.76,.35):vec3(.68,.55,.21);
        return srgbToLinearColor(gold);
      }
      if(stage==2)return mix(color,srgbToLinearColor(vec3(.60,.36,.18)),.59);
      if(p.x==0.0&&p.y==-1.0&&chance<.20)return srgbToLinearColor(vec3(.79,.33,.15));
    }
    if(stage<3&&chance<.52&&field>.32){
      bool tuft=(p.x==0.0&&p.y>=-2.0&&p.y<=1.0)
        ||(abs(p.x)==1.0&&p.y>=-1.0&&p.y<=0.0)
        ||(abs(p.x)==2.0&&p.y==-1.0);
      if(tuft){
        vec3 tip=srgbToLinearColor(vec3(.54,.65,.24));
        float amount=stage==1?.54:.22;
        return p.y<0.0?mix(color,tip,amount):color*.77;
      }
    }
  }else{
    float rut=step(.53,labNoise(uv*vec2(1.8,.43))+.17*labNoise(pixel/8.0));
    color*=mix(.88,1.12,rut);
    bool chip=(p.y==0.0&&p.x>=-1.0&&p.x<=2.0)
      ||(p.y==-1.0&&p.x>=0.0&&p.x<=1.0);
    if(chip&&chance<.64){
      vec3 stone=stage==3?vec3(.40,.32,.31):vec3(.60,.52,.40);
      return p.y<0.0?mix(color,srgbToLinearColor(stone),.48):color*.71;
    }
  }
  return color;
}

vec3 labLinearSurface(int material, vec2 uv, bool topFace) {
  int index=material==1?(topFace?0:1):material==2?2:3;
  float layer=uTerrainLayers[index];
  if(layer<0.0){
    vec3 color=labForestGrade(srgbToLinearColor(terrainAlbedo(float(material==6?3:material))),material,vWorld.xz);
    return topFace?labForestDetail(color,material,uv):color;
  }
  vec2 mapped=index==0&&uLabGrassStyle>0?uv*.62:uv;
  vec3 albedo=texture(uTerrainAlbedo,vec3(mapped*uTerrainTilesPerVoxel,layer)).rgb;
  if(index==0)albedo*=labGrassTint(uv);
  albedo=labForestGrade(albedo,material,vWorld.xz);
  return topFace?labForestDetail(albedo,material,uv):albedo;
}

${fireLavaMotifGlsl()}

vec3 labLava(vec2 uv) {
  // Quantize first. The palette, river banks, and movement all share this grid.
  const float density=${FIRE_LAVA_TEXELS_PER_VOXEL}.0;
  bool road=uLabForestStage==4;
  if(road)uv=vec2(-uv.y,uv.x);
  ivec2 pixel=ivec2(floor(uv*density));
  vec2 world=(vec2(pixel)+.5)/density;
  float center=road?4.8-.6*sin(world.x*.53):1.6*sin(world.x*.26)+.55*sin(world.x*.63);
  float halfWidth=road?1.05:2.1+.42*cos(world.x*.49);
  int lateral=int(floor((world.y-center)*density));
  int lane=int(floor(float(lateral)/12.0));
  int frame=int(floor(uLabTime*${FIRE_LAVA_FRAMES_PER_SECOND}.0));
  int travel=abs(lane)<=1?frame:frame*3/4;
  int column=int(mod(float(pixel.x-travel+lane*7),24.0));
  int row=int(mod(float(lateral),12.0));
  if(mod(float(lane),2.0)>0.5)row=11-row;
  int band=int((LAB_LAVA_MOTIF[row][column/8]>>uint(3*(column%8)))&7u);

  float margin=halfWidth-abs(world.y-center);
  if(road)margin=min(margin,world.x+${FIRE_ROAD_LAVA_Z}.0);
  if(margin<.18)band=0;
  else if(margin<.48)band=min(band,1);
  if(labMaterial(ivec3(floor(vWorld.x),2,floor(vWorld.z)))==3)band=min(band,1);

  vec3 color=vec3(.30,.071,.11);
  if(band==1)color=vec3(.58,.127,.14);
  else if(band==2)color=vec3(.80,.235,.12);
  else if(band==3)color=vec3(.98,.441,.16);
  else if(band==4)color=vec3(1.0,.74,.31);
  return srgbToLinearColor(color);
}

float labGrassCoverage(float distanceToGrass,vec2 boundaryUv) {
  // Both faces sample the same world-space boundary. Broad tufts alternate
  // with exposed soil; the final contour advances in whole art texels.
  vec2 texel=floor(boundaryUv*12.0)/12.0;
  float offset=.28*(labNoise(texel*3.7+11.0)-.47);
  offset+=.12*(labNoise(texel*9.0+7.0)-.5);
  float stepped=sign(distanceToGrass)*floor(abs(distanceToGrass)*12.0)/12.0;
  return smoothstep(-.085,.085,stepped+offset);
}

bool labShallowGrassBank(int material) {
  // The trail floor is 0.1 m below the grass tops. Apply the shoulder
  // palette only to its riser, leaving deep crater and cliff walls intact.
  if(uLabForestStage==0||!uLabBlend||material!=1||abs(vNormal.y)>.5)return false;
  if(vWorld.y<2.899||vWorld.y>3.001)return false;
  ivec3 cell=ivec3(floor(vec3(vWorld.x,2.95,vWorld.z)-vNormal*.002));
  ivec3 neighbor=cell+ivec3(round(vNormal));
  return labMaterial(neighbor)==2&&labMaterial(neighbor+ivec3(0,1,0))==0;
}

vec3 labGrassLip(vec3 soil,ivec3 cell) {
  if(labMaterial(cell+ivec3(0,1,0))!=0)return soil;
  vec2 texel=floor(vWorld.xz*12.0)/12.0;
  float tufts=labNoise(texel*4.1)+.22*labNoise(texel*10.7+3.0);
  float depth=mix(1.0,3.0,smoothstep(.39,.84,tufts))/12.0;
  float belowTop=float(cell.y+1)-vWorld.y;
  float rim=1.0-smoothstep(depth-.045,depth+.025,belowTop);
  if(rim<=0.0)return soil;
  vec3 moss=labLinearSurface(1,vWorld.xz,true);
  return mix(soil,moss,rim*.88);
}

vec3 labTerrainColor(vec3 base,vec2 uv) {
  int material=int(round(vMaterial));
  if(material==6){
    float mineral=labNoise(floor(uv*8.0)/3.0);
    vec3 crustTint=mineral<.47?vec3(.42,.37,.44):vec3(.54,.40,.38);
    base=labLinearSurface(3,uv,vNormal.y>.5)*crustTint;
  }
  float structure=labNoise(uv*.42)+.33*labNoise(uv*1.75);
  if(material==1&&vNormal.y>.5)base*=labGrassTint(uv);
  base=labForestGrade(base,material,vWorld.xz);
  if(vNormal.y>.5)base=labForestDetail(base,material,uv);
  float tone=mix(.82,1.16,smoothstep(.15,1.24,structure));
  if(!uLabBlend||vNormal.y<-.5)return base*tone;
  if(labShallowGrassBank(material)){
    vec2 ground=vWorld.xz;
    float grass=labGrassCoverage(0.0,ground);
    vec3 shoulder=mix(labLinearSurface(2,ground,true),labLinearSurface(1,ground,true),grass);
    float relief=mix(.91,.98,clamp((vWorld.y-2.9)*10.0,0.0,1.0));
    return shoulder*tone*relief;
  }

  // Sample real face neighbors. A hidden face cannot blend into an exposed
  // one, even when their voxels share the same plane in the material volume.
  ivec3 normal=ivec3(round(vNormal));
  ivec3 cell=ivec3(floor(vWorld-vNormal*.002));
  bool topFace=vNormal.y>.5;
  if(material==1&&!topFace)base=labGrassLip(base,cell);
  vec3 along=fract(vWorld);
  vec3 mixedColor=vec3(0.0);
  float weights=0.0;
  float shore=0.0;
  for(int axis=0;axis<3;axis++){
    if(normal[axis]!=0)continue;
    float local=along[axis];
    float edge=min(local,1.0-local);
    if(edge>=.43)continue;
    ivec3 neighbor=cell;
    neighbor[axis]+=local<.5?-1:1;
    int next=labMaterial(neighbor);
    if(next==material||next==0)continue;
    if(next==5){
      shore=max(shore,1.0-smoothstep(0.0,.43,edge));
      continue;
    }
    if(next>3||labMaterial(neighbor+normal)!=0)continue;
    float weight;
    if(topFace&&((material==1&&next==2)||(material==2&&next==1))){
      vec3 boundary=vWorld;
      boundary[axis]=float(cell[axis])+(local<.5?0.0:1.0);
      float grass=labGrassCoverage(material==1?edge:-edge,boundary.xz);
      weight=material==1?1.0-grass:grass;
      // Use the same samples as the short bank at the seam, easing back
      // to the normal top-face shading toward the center of the tile.
      base=mix(base,labLinearSurface(material,uv,true),1.0-smoothstep(.08,.30,edge));
    }else{
      float width=mix(.17,.43,labNoise(uv*3.1));
      weight=.50*(1.0-smoothstep(0.0,width,edge));
    }
    mixedColor+=labLinearSurface(next,uv,topFace)*weight;
    weights+=weight;
  }
  return (base*max(0.0,1.0-weights)+mixedColor/max(1.0,weights))*tone+shore*vec3(.11,.028,.005);
}
`;
