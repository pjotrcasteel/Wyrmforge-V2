// Generic, read-only physical collider provider registry.
// Trees, buildings, rocks and future objects publish the same shape contract.
import {defineLightOccluders,MAX_LIGHT_OCCLUDERS} from './occluder-contract.mjs';
export class LightOccluderRegistry {
  #providers=new Set();
  #generation=1;
  register(provider){
    if(typeof provider?.physicalOccluders!=='function'||
        !Number.isSafeInteger(provider.physicalRevision)){
      throw new TypeError('Expected revisioned physical collider provider');
    }
    this.#providers.add(provider);
    this.#generation++;
    return ()=>{if(this.#providers.delete(provider))this.#generation++;};
  }
  snapshot(focus={x:0,z:0}){
    const entries=[];
    let version=this.#generation;
    for(const provider of this.#providers){
      version=(version*31+provider.physicalRevision)%2147483647;
      entries.push(...provider.physicalOccluders(focus,MAX_LIGHT_OCCLUDERS));
    }
    const squaredDistance=shape=>{
      const dx=(shape.min[0]+shape.max[0])*.5-focus.x;
      const dz=(shape.min[2]+shape.max[2])*.5-focus.z;
      return dx*dx+dz*dz;
    };
    entries.sort((a,b)=>squaredDistance(a)-squaredDistance(b)||a.id.localeCompare(b.id));
    return defineLightOccluders({revision:version,
      entries:entries.slice(0,MAX_LIGHT_OCCLUDERS)});
  }
  clear(){this.#providers.clear();this.#generation++;}
}
