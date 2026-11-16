import {fireLavaMotifGlsl,FIRE_LAVA_TEXELS_PER_VOXEL,FIRE_LAVA_FRAMES_PER_SECOND} from './fire-lava-art.mjs';
// These paths are enabled only for lab fixtures that publish a material volume.
export const FIRE_MATERIAL_LAB_UNIFORMS_GLSL=`
uniform highp sampler3D uLabMaterials;
uniform bool uLabEnabled;
uniform bool uLabBlend;
uniform int uLabGrassStyle;
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

vec3 labLinearSurface(int material, vec2 uv) {
  int index=material==1?(vNormal.y>0.5?0:1):material==2?2:3;
  float layer=uTerrainLayers[index];
  if(layer<0.0)return srgbToLinearColor(terrainAlbedo(float(material==6?3:material)));
  vec2 mapped=index==0&&uLabGrassStyle>0?uv*.62:uv;
  vec3 albedo=texture(uTerrainAlbedo,vec3(mapped*uTerrainTilesPerVoxel,layer)).rgb;
  return index==0?albedo*labGrassTint(uv):albedo;
}

${fireLavaMotifGlsl()}

vec3 labLava(vec2 uv) {
  // Quantize first. The palette, river banks, and movement all share this grid.
  const float density=${FIRE_LAVA_TEXELS_PER_VOXEL}.0;
  ivec2 pixel=ivec2(floor(uv*density));
  vec2 world=(vec2(pixel)+.5)/density;
  float center=1.6*sin(world.x*.26)+.55*sin(world.x*.63);
  float halfWidth=2.1+.42*cos(world.x*.49);
  int lateral=int(floor((world.y-center)*density));
  int lane=int(floor(float(lateral)/12.0));
  int frame=int(floor(uLabTime*${FIRE_LAVA_FRAMES_PER_SECOND}.0));
  int travel=abs(lane)<=1?frame:frame*3/4;
  int column=int(mod(float(pixel.x-travel+lane*7),24.0));
  int row=int(mod(float(lateral),12.0));
  if(mod(float(lane),2.0)>0.5)row=11-row;
  int band=int((LAB_LAVA_MOTIF[row][column/8]>>uint(3*(column%8)))&7u);

  float margin=halfWidth-abs(world.y-center);
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

vec3 labTerrainColor(vec3 base,vec2 uv) {
  int material=int(round(vMaterial));
  if(material==6){
    float mineral=labNoise(floor(uv*8.0)/3.0);
    vec3 crustTint=mineral<.47?vec3(.42,.37,.44):vec3(.54,.40,.38);
    base=labLinearSurface(3,uv)*crustTint;
  }
  float structure=labNoise(uv*.42)+.33*labNoise(uv*1.75);
  if(material==1&&vNormal.y>.5)base*=labGrassTint(uv);
  float tone=mix(.82,1.16,smoothstep(.15,1.24,structure));
  if(!uLabBlend||vNormal.y<-.5)return base*tone;

  // Sample real face neighbors. A hidden face cannot blend into an exposed
  // one, even when their voxels share the same plane in the material volume.
  ivec3 normal=ivec3(round(vNormal));
  ivec3 cell=ivec3(floor(vWorld-vNormal*.002));
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
    float width=mix(.17,.43,labNoise(uv*3.1));
    float weight=.50*(1.0-smoothstep(0.0,width,edge));
    mixedColor+=labLinearSurface(next,uv)*weight;
    weights+=weight;
  }
  return (base*(1.0-weights)+mixedColor)*tone+shore*vec3(.11,.028,.005);
}
`;
