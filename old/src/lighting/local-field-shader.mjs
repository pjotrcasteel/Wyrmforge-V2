import {TRANSIENT_LIGHTING_GLSL} from './transient-lighting.mjs';
import {BASELINE_LIGHTING_GLSL} from './baseline-lighting.mjs';
import {STATIC_FIELD_EMISSION_GLSL} from './static-field-shader.mjs';
export const LOCAL_FIELD_LIGHTING_GLSL=BASELINE_LIGHTING_GLSL.replace('evaluateV2Lighting','evaluateBaselineLighting')+`
${STATIC_FIELD_EMISSION_GLSL}
uniform vec3 uLightingAmbient;
${TRANSIENT_LIGHTING_GLSL}
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
  return base*mix(1.0,shade,fade)+surface.albedo*staticFieldIrradiance(point)+spellLight;
}
`;
