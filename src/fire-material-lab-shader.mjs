// These paths are enabled only for lab fixtures that publish a material volume.
export const FIRE_MATERIAL_LAB_UNIFORMS_GLSL=`
uniform highp sampler3D uLabMaterials;
uniform bool uLabEnabled;
uniform bool uLabBlend;
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

vec3 labLinearSurface(int material, vec2 uv) {
  int index=material==1?(vNormal.y>0.5?0:1):material==2?2:3;
  float layer=uTerrainLayers[index];
  if(layer<0.0)return srgbToLinearColor(terrainAlbedo(float(material==6?3:material)));
  return texture(uTerrainAlbedo,vec3(uv*uTerrainTilesPerVoxel,layer)).rgb;
}

vec3 labLava(vec2 uv) {
  // Broad, downstream-moving ribbons with faster motion in the hot core.
  float phase=uLabTime*0.56;
  float bend=labNoise(vec2(uv.x*.48-phase*.38,uv.y*.63));
  vec2 flow=vec2(uv.x*.72-phase,uv.y*.94+bend*1.29);
  float ridges=1.0-abs(2.0*labNoise(flow)-1.0);
  float hot=smoothstep(.64,.9,ridges)*(.66+.34*labNoise(flow*1.6));
  float veins=smoothstep(.89,1.0,ridges);
  vec3 base=mix(vec3(.11,.012,.004),vec3(.66,.069,.009),hot);
  vec3 emission=vec3(.34,.225,.035)*veins;
  return base+emission;
}

vec3 labTerrainColor(vec3 base,vec2 uv) {
  int material=int(round(vMaterial));
  if(material==6)base=labLinearSurface(3,uv)*vec3(.47,.36,.34);
  float structure=labNoise(uv*.42)+.33*labNoise(uv*1.75);
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
