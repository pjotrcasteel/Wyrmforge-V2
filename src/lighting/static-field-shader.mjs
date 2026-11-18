// Lighting-owned, renderer-neutral GLSL twin of static-field-sample.mjs.
// Terrain and independent fluid WebGL renderers share identical emission
// interpolation, occlusion and receiver-height semantics.
export const STATIC_FIELD_EMISSION_GLSL=`
uniform highp sampler2D uLightingField;
uniform bool uLightingFieldEnabled;
uniform bool uLightingWarmEnabled;
uniform vec2 uLightingFieldOrigin;
uniform vec3 uLightingEmissionColor;
vec4 lightingColumn(ivec2 cell){
  ivec2 at=cell-ivec2(uLightingFieldOrigin);
  if(any(lessThan(at,ivec2(0)))||any(greaterThanEqual(at,textureSize(uLightingField,0))))return vec4(0.0);
  return texelFetch(uLightingField,at,0);
}
vec3 staticFieldIrradiance(vec3 point){
  if(!uLightingFieldEnabled||!uLightingWarmEnabled)return vec3(0.0);
  ivec2 receiver=ivec2(floor(point.xz));
  if(lightingColumn(receiver).a<.5)return vec3(0.0);
  vec2 at=point.xz-.5;
  ivec2 grid=ivec2(floor(at));
  vec2 f=fract(at);
  vec4 a=lightingColumn(grid),b=lightingColumn(grid+ivec2(1,0));
  vec4 c=lightingColumn(grid+ivec2(0,1)),d=lightingColumn(grid+ivec2(1,1));
  float topEnergy=mix(mix(a.b,b.b,f.x),mix(c.b,d.b,f.x),f.y);
  float sideEnergy=mix(mix(max(0.0,a.a-1.0),max(0.0,b.a-1.0),f.x),
    mix(max(0.0,c.a-1.0),max(0.0,d.a-1.0),f.x),f.y);
  float topY=mix(mix(a.r,b.r,f.x),mix(c.r,d.r,f.x),f.y);
  float sideWeight=smoothstep(.12,1.1,max(0.0,topY-point.y));
  float energy=mix(topEnergy,sideEnergy,sideWeight);
  float sourceY=mix(mix(a.g,b.g,f.x),mix(c.g,d.g,f.x),f.y);
  float edge=min(min(point.x-uLightingFieldOrigin.x,point.z-uLightingFieldOrigin.y),
    min(uLightingFieldOrigin.x+24.0-point.x,uLightingFieldOrigin.y+24.0-point.z));
  float fade=smoothstep(0.0,2.0,edge);
  float warm=energy*1.65*fade*exp2(-abs(point.y-sourceY-.4)*.35);
  vec3 emission=uLightingEmissionColor;
  return emission*warm;
}
`;
