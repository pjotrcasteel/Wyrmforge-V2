import {TRANSIENT_LIGHTING_GLSL} from './transient-lighting.mjs';
import {BASELINE_LIGHTING_GLSL} from './baseline-lighting.mjs';
export const LOCAL_FIELD_LIGHTING_GLSL=BASELINE_LIGHTING_GLSL.replace('evaluateV2Lighting','evaluateBaselineLighting')+`
uniform highp sampler2D uLightingField;
uniform bool uLightingFieldEnabled;
uniform bool uLightingWarmEnabled;
uniform vec2 uLightingFieldOrigin;
uniform vec3 uLightingAmbient;
uniform vec3 uLightingEmissionColor;
${TRANSIENT_LIGHTING_GLSL}
vec4 lightingColumn(ivec2 cell){
  ivec2 at=cell-ivec2(uLightingFieldOrigin);
  if(any(lessThan(at,ivec2(0)))||any(greaterThanEqual(at,textureSize(uLightingField,0))))return vec4(0.0);
  return texelFetch(uLightingField,at,0);
}
vec3 evaluateV2Lighting(V2Surface surface,V2LightingContext context){
  // Ambient belongs to the entire scene, not the moving field footprint.
  // Keep emitted energy independent of ambient attenuation.
  vec3 base=(evaluateBaselineLighting(surface,context)-surface.emission)*uLightingAmbient+surface.emission;
  vec3 spellLight=transientIrradiance(surface,context.position);
  if(!uLightingFieldEnabled)return base+spellLight;
  vec3 point=context.position;
  // Read the occupied side of the actual exposed face.
  ivec2 cell=ivec2(floor(point.xz-surface.geometricNormal.xz*.02));
  vec4 here=lightingColumn(cell);
  if(here.a<.5)return base+spellLight;
  float occlusion=0.0;
  for(int i=0;i<4;i++){
    ivec2 stepTo=i==0?ivec2(1,0):i==1?ivec2(-1,0):i==2?ivec2(0,1):ivec2(0,-1);
    vec4 neighbor=lightingColumn(cell+stepTo);
    float block=neighbor.a>.5?smoothstep(.15,2.8,neighbor.r-point.y):0.0;
    occlusion+=block;
  }
  float shade=1.0-min(.42,occlusion*.12);
  float edge=min(min(point.x-uLightingFieldOrigin.x,point.z-uLightingFieldOrigin.y),
    min(uLightingFieldOrigin.x+24.0-point.x,uLightingFieldOrigin.y+24.0-point.z));
  float fade=smoothstep(0.0,2.0,edge);
  if(!uLightingWarmEnabled)return base*mix(1.0,shade,fade)+spellLight;
  // Interpolate only irradiance, never terrain occupancy or geometry.
  vec2 at=point.xz-.5;ivec2 grid=ivec2(floor(at));vec2 f=fract(at);
  vec4 a=lightingColumn(grid),b=lightingColumn(grid+ivec2(1,0));
  vec4 c=lightingColumn(grid+ivec2(0,1)),d=lightingColumn(grid+ivec2(1,1));
  float topEnergy=mix(mix(a.b,b.b,f.x),mix(c.b,d.b,f.x),f.y);
  // RGBA32F A contains 1 + side-face irradiance for occupied receivers;
  // zero is reserved for missing geometry. Two physically sampled elevations
  // share the existing one bounded field texture, no extra GPU allocation.
  float sideEnergy=mix(mix(max(0.0,a.a-1.0),max(0.0,b.a-1.0),f.x),
    mix(max(0.0,c.a-1.0),max(0.0,d.a-1.0),f.x),f.y);
  float topY=mix(mix(a.r,b.r,f.x),mix(c.r,d.r,f.x),f.y);
  float sideWeight=smoothstep(.12,1.1,max(0.0,topY-point.y));
  float energy=mix(topEnergy,sideEnergy,sideWeight);
  float sourceY=mix(mix(a.g,b.g,f.x),mix(c.g,d.g,f.x),f.y);
  float warm=energy*1.65*fade*exp2(-abs(point.y-sourceY-.4)*.35);
  vec3 emission=uLightingEmissionColor;
  // Local diffuse/indirect spill; not an additive screen-space halo.
  return base*mix(1.0,shade,fade)+surface.albedo*emission*warm+spellLight;
}
`;
