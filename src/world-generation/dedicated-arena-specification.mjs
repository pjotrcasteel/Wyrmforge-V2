// World Generation-only Specification: a boss arena must be a distinct
// traversable *physical landform*, not a generic horde floor with a boss tag.
// Enemy AI, fight phases, scenery and fluid simulations are other V2 owners.
export const DEDICATED_ARENA_SCHEMA='wyrmforge.dedicated-arena.v1';
const index=(r,x,z)=>(z+r)*2*r+x+r;

export function specifyDedicatedArena({plan,heights}) {
  if(!plan.dedicatedArena)return null;
  const radius=plan.recipe.radius,arena=plan.dedicatedArena;
  if(!(heights instanceof Int16Array) || heights.length!==(radius*2)**2) {
    throw new TypeError('Dedicated arena requires physical site elevations');
  }
  const space=plan.combatSpaces.find(s=>s.id===arena.combatSpaceId);
  if(!space || !['mini-boss','wyrm'].includes(arena.kind)) {
    throw new Error('Boss terrain lacks its dedicated combat floor');
  }
  const centerY=heights[index(radius,space.x,space.z)];
  let cells=0,usable=0;
  for(let z=-space.radius+1;z<space.radius;z++) {
    for(let x=-space.radius+1;x<space.radius;x++) {
      if(Math.hypot(x,z)>space.radius-1)continue;
      cells++;
      if(Math.abs(heights[index(radius,space.x+x,space.z+z)]-centerY)<=1) {
        usable++;
      }
    }
  }
  if(cells<75 || usable/cells<0.8) {
    throw new Error('Boss arena has insufficient usable physical fighting floor');
  }
  // Off-axis samples examine actual circular cliffs without treating the
  // two authored entrances and enemy lanes as walls.
  const offsets=[[-10,-10],[10,-10],[-10,10],[10,10]];
  const rises=offsets.map(([x,z])=>
    heights[index(radius,space.x+x,space.z+z)]-centerY);
  const raisedQuadrants=rises.filter(rise=>rise>=2).length;
  if(raisedQuadrants<2) {
    throw new Error('Boss arena has no distinct physical enclosing stone rim');
  }
  return Object.freeze({
    schema:DEDICATED_ARENA_SCHEMA,kind:arena.kind,
    combatSpaceId:space.id,
    center:Object.freeze({x:space.x,y:centerY,z:space.z}),
    floorRadius:space.radius,
    usableFloorCells:usable,
    raisedQuadrants,
    rimRiseMetres:Object.freeze(rises),
    entryKind:arena.entryKind,exitKind:arena.exitKind,
    ready:true
  });
}
