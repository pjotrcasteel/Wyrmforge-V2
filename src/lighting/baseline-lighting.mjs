// Lighting owns illumination. Pure shader hook: no GPU/world/material imports.
export const LIGHTING_CONTEXT_GLSL=`
struct V2LightingContext {
  vec3 position;
  bool heightContrast;
  float elevationReference;
  bool shallowGrass;
};
`;
export const BASELINE_LIGHTING_GLSL=`
vec3 evaluateV2Lighting(V2Surface surface,V2LightingContext context) {
  vec3 normal=surface.geometricNormal;
  float lighting=normal.y>.5?1.0:normal.y<-.5?.43:
    normal.x>.5?.74:normal.z>.5?.62:normal.x<-.5?.55:.50;
  if(surface.hasDetailNormal){
    vec3 n=normalize(normal);
    vec3 lightDirection=normalize(vec3(-.4,.85,.3));
    float baseDiffuse=max(dot(n,lightDirection),0.0);
    float detailedDiffuse=max(dot(surface.normal,lightDirection),0.0);
    lighting*=clamp(1.0+(detailedDiffuse-baseDiffuse)*.4,.75,1.25);
  }
  if(surface.hasOrm){
    lighting*=mix(.65,1.0,surface.orm.r);
    lighting*=mix(.96,1.0,surface.orm.g);
  }
  if(context.shallowGrass)lighting=.94;
  if(context.heightContrast){
    float tone=clamp(1.0+(context.position.y-context.elevationReference)*.28,.50,1.48);
    lighting*=tone;
    if(normal.y<.5&&normal.y>-.5)lighting*=.66;
  }
  return surface.albedo*lighting+surface.emission;
}
`;
// Explicit independent fallback for diagnosis and future light-engine failure.
export const UNLIT_LIGHTING_GLSL=`
vec3 evaluateV2Lighting(V2Surface surface,V2LightingContext context) {
  return surface.albedo+surface.emission;
}
`;
export function validateLightingShader(source){
  if(typeof source!=='string'||source.length>16384||
      !/vec3\s+evaluateV2Lighting\s*\(\s*V2Surface\s+\w+\s*,\s*V2LightingContext\s+\w+\s*\)/.test(source)){
    throw new TypeError('Expected bounded V2 surface lighting shader');
  }
  return source;
}
