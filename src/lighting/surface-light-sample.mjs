// Read-only CPU counterpart for flat sprite consumers of the light contract.
import {MAX_TRANSIENT_LIGHTS} from './transient-lighting.mjs';
import {samplePointVisibility} from './point-light-visibility.mjs';
import {sampleStaticFieldIrradiance} from './static-field-sample.mjs';
export function sampleSurfaceIrradiance(position,environment=null,lights=null,
  normal=[0,1,0],visibility=null,staticField=null){
  const result=[...(environment?.ambient??[1,1,1])];
  const emitters=lights?.emitters??[];
  if(emitters.length>MAX_TRANSIENT_LIGHTS)throw new RangeError('Unbounded sprite lights');
  for(const [index,light] of emitters.entries()){
    const delta=position.map((value,index)=>light.position[index]-value);
    const distance=Math.hypot(...delta);
    if(distance>=light.radius)continue;
    const falloff=(1-distance/light.radius)**2;
    const transmission=visibility?.ready?samplePointVisibility(visibility,index,position):1;
    if(transmission<=0)continue;
    const facing=.22+.78*Math.max(0,delta.reduce((sum,n,i)=>sum+n*normal[i],0)/Math.max(distance,.001));
    for(let i=0;i<3;i++)result[i]+=light.radiance[i]*falloff*facing*transmission;
  }
  // Static emissive surfaces use the SAME published, geometry-occluded field
  // as the terrain fragment shader. No new rays during sprite painting.
  const staticIrradiance=sampleStaticFieldIrradiance(position,staticField);
  for(let i=0;i<3;i++)result[i]+=staticIrradiance[i];
  return result;
}
