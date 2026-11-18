// Read-only CPU counterpart for flat sprite consumers of the light contract.
import {MAX_TRANSIENT_LIGHTS} from './transient-lighting.mjs';
export function sampleSurfaceIrradiance(position,environment=null,lights=null,normal=[0,1,0]){
  const result=[...(environment?.ambient??[1,1,1])];
  const emitters=lights?.emitters??[];
  if(emitters.length>MAX_TRANSIENT_LIGHTS)throw new RangeError('Unbounded sprite lights');
  for(const light of emitters){
    const delta=position.map((value,index)=>light.position[index]-value);
    const distance=Math.hypot(...delta);
    if(distance>=light.radius)continue;
    const falloff=(1-distance/light.radius)**2;
    const facing=.22+.78*Math.max(0,delta.reduce((sum,n,i)=>sum+n*normal[i],0)/Math.max(distance,.001));
    for(let i=0;i<3;i++)result[i]+=light.radiance[i]*falloff*facing;
  }
  return result;
}
