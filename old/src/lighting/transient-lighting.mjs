import {LIGHT_SET_SCHEMA} from './light-contract.mjs';
import {POINT_VISIBILITY_GLSL} from './point-light-visibility.mjs';
export const MAX_TRANSIENT_LIGHTS=2;
const EMPTY_LIGHTS=Object.freeze([]);
export function writeTransientLights(set,positions,radiance){
  if(!(positions instanceof Float32Array)||positions.length!==8||
      !(radiance instanceof Float32Array)||radiance.length!==6){
    throw new TypeError('Expected bounded transient upload buffers');
  }
  const lights=set?.emitters??EMPTY_LIGHTS;
  if(set&&(set.schema!==LIGHT_SET_SCHEMA||!Number.isSafeInteger(set.epoch)||set.epoch<0||
      !Number.isSafeInteger(set.revision)||set.revision<0||!Array.isArray(lights)||lights.length>MAX_TRANSIENT_LIGHTS)){
    throw new TypeError('Invalid transient light set');
  }
  positions.fill(0);radiance.fill(0);
  lights.forEach((light,index)=>{
    if(!Array.isArray(light.position)||light.position.length!==3||!light.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)||
        !Array.isArray(light.radiance)||light.radiance.length!==3||
        !light.radiance.every(n=>Number.isFinite(n)&&n>=0&&n<=64)||
        !Number.isFinite(light.radius)||light.radius<=0||light.radius>32){
      throw new RangeError('Invalid transient light');
    }
    positions.set(light.position,index*4);positions[index*4+3]=light.radius;
    radiance.set(light.radiance,index*3);
  });
  return lights.length;
}
export const TRANSIENT_LIGHTING_GLSL=`
uniform int uTransientLightCount;
uniform vec4 uTransientPositions[2];
uniform vec3 uTransientRadiance[2];
${POINT_VISIBILITY_GLSL}
vec3 transientIrradiance(V2Surface surface,vec3 point){
  vec3 result=vec3(0.0);
  for(int i=0;i<2;i++){
    if(i>=uTransientLightCount)break;
    vec3 delta=uTransientPositions[i].xyz-point;
    float distanceToLight=length(delta);
    float radius=uTransientPositions[i].w;
    if(distanceToLight>=radius)continue;
    float falloff=1.0-distanceToLight/radius;
    falloff*=falloff;
    float facing=.22+.78*max(0.0,dot(surface.normal,delta/max(distanceToLight,.001)));
    float visibility=pointLightVisibility(i,point,uTransientPositions[i].xyz);
    result+=surface.albedo*uTransientRadiance[i]*falloff*facing*visibility;
  }
  return result;
}
`;
