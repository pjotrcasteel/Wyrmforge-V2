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
  const minimum=arena.kind==='wyrm'?500:260;
  if(cells<minimum || usable/cells<0.88) {
    throw new Error('Boss terrain lacks the required wide, traversable fighting floor');
  }
  const pockets=plan.maneuverPockets;
  if(pockets.length<(arena.kind==='wyrm'?3:2) ||
      plan.flowLinks.length!==pockets.length) {
    throw new Error('Boss lair needs connected secondary maneuver chambers');
  }
  // Sample outside the broad central fighting area, diagonally away from
  // the deliberate entry and exit. This measures irregular REAL cliff
  // geography rather than demanding a perfectly circular enclosing wall.
  const offset=Math.round((space.radius+9)/Math.SQRT2);
  const offsets=[[-offset,-offset],[offset,-offset],
    [-offset,offset],[offset,offset]];
  const rises=offsets.map(([x,z])=>
    heights[index(radius,space.x+x,space.z+z)]-centerY);
  const raisedQuadrants=rises.filter(rise=>rise>=2).length;
  if(raisedQuadrants<2) {
    throw new Error('Boss lair lacks raised natural rock masses');
  }
  return Object.freeze({
    schema:DEDICATED_ARENA_SCHEMA,kind:arena.kind,
    combatSpaceId:space.id,
    center:Object.freeze({x:space.x,y:centerY,z:space.z}),
    floorRadius:space.radius,
    siteWidthMetres:radius*2,
    usableFloorCells:usable,
    connectedManeuverSpaces:pockets.length,
    raisedQuadrants,
    rimRiseMetres:Object.freeze(rises),
    entryKind:arena.entryKind,exitKind:arena.exitKind,
    ready:true
  });
}
