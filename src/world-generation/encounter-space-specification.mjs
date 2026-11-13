// World Generation V2 Specification: validate actual *terrain* suitability
// for horde survival. No enemy count, AI, loot table or runtime spawn rules.
export const ENCOUNTER_SPACE_SCHEMA='wyrmforge.encounter-space-audit.v1';
const index=(radius,x,z)=>(z+radius)*radius*2+x+radius;
const within=(radius,x,z)=>x>=-radius && x<radius && z>=-radius && z<radius;
const height=(surface,radius,x,z)=>surface[index(radius,x,z)];

function verifyApproach(heights,radius,space,approach) {
  const dx=space.x-approach.x,dz=space.z-approach.z;
  const steps=Math.ceil(Math.hypot(dx,dz)*2);
  let prior=null;
  for(let i=0;i<=steps;i++) {
    const t=i/steps;
    const x=Math.round(approach.x+dx*t);
    const z=Math.round(approach.z+dz*t);
    if(!within(radius,x,z)) {
      throw new RangeError('Horde approach leaves the map footprint');
    }
    const current=height(heights,radius,x,z);
    if(prior!==null && Math.abs(current-prior)>1) {
      throw new Error('Horde approach is not walkable: '+approach.id);
    }
    prior=current;
  }
}

export function specifyEncounterSpaces({
  radius,heights,combatSpaces=[],approaches=[],discoveryCandidates=[]
}) {
  if(!Number.isSafeInteger(radius) || radius<8 || radius>24 ||
      !(heights instanceof Int16Array) ||
      heights.length!==(radius*2)**2 ||
      !Array.isArray(combatSpaces) || !Array.isArray(approaches) ||
      !Array.isArray(discoveryCandidates)) {
    throw new TypeError('Invalid bounded combat footprint');
  }
  const audits=[];
  for(const space of combatSpaces) {
    const anchor=height(heights,radius,space.x,space.z);
    let cells=0,walkable=0;
    // The inner six-voxel radius is a practical dodge/kiting floor. Steep
    // terrain is allowed outside, retaining the distinctive mountain shape.
    for(let z=space.z-space.radius+1;z<=space.z+space.radius-1;z++) {
      for(let x=space.x-space.radius+1;x<=space.x+space.radius-1;x++) {
        if(Math.hypot(x-space.x,z-space.z)>space.radius-1) continue;
        if(!within(radius,x,z)) throw new RangeError('Combat floor exceeds map');
        cells++;
        if(Math.abs(height(heights,radius,x,z)-anchor)<=1) walkable++;
      }
    }
    if(cells<60 || walkable/cells<0.8) {
      throw new Error('Combat floor is too steep for horde survival: '+space.id);
    }
    const ingresses=approaches.filter(approach=>approach.combatSpaceId===space.id);
    if(ingresses.length<3) {
      throw new Error('Combat space needs multiple enemy ingress directions');
    }
    const directions=new Set();
    for(const approach of ingresses) {
      const dx=approach.x-space.x,dz=approach.z-space.z;
      const direction=Math.abs(dx)>=Math.abs(dz)
        ? (dx<0 ? 'west' : 'east') : (dz<0 ? 'north' : 'south');
      directions.add(direction);
      verifyApproach(heights,radius,space,approach);
    }
    if(directions.size<3) {
      throw new Error('Enemy ingress directions are too concentrated');
    }
    audits.push(Object.freeze({
      id:space.id,center:Object.freeze({x:space.x,z:space.z,y:anchor}),
      floorRadius:space.radius,walkableCells:walkable,
      floorCells:cells,ingressCount:ingresses.length,
      ingressDirections:Object.freeze([...directions].sort()),
      ready:true
    }));
  }
  for(const candidate of discoveryCandidates) {
    if(!within(radius,candidate.x,candidate.z)) {
      throw new RangeError('Discovery site leaves the terrain footprint');
    }
    if(combatSpaces.some(space=>Math.hypot(
      candidate.x-space.x,candidate.z-space.z)<=space.radius+2)) {
      throw new Error('Buried discovery overlaps active combat floor');
    }
    const surfaceY=height(heights,radius,candidate.x,candidate.z);
    if(surfaceY-candidate.coverDepth<-3) {
      throw new Error('Buried candidate lacks sufficient terrain cover');
    }
  }
  return Object.freeze({
    schema:ENCOUNTER_SPACE_SCHEMA,
    ready:audits.every(item=>item.ready),
    combatSpaces:Object.freeze(audits),
    buriedCandidates:discoveryCandidates.length
  });
}
