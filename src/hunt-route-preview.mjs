// Play Hunt fixtures for the World Map material handoff. Distances represent
// travel along the journey between destinations, in author-defined units.
import {spawnTerrainActor} from './terrain-actor.mjs';
import {createHuntRouteMaterialProfile} from './terrain-corruption-profile.mjs';

const ROUTES = {
  forest: [[0,'wet-forest'],[40,'wet-forest'],[100,'wyrm-lair']],
  mountain: [[0,'mountain-pass'],[30,'mountain-pass'],[72,'scorched-approach'],[110,'wyrm-lair']],
  highland: [[0,'wet-forest'],[14,'wet-forest'],[31,'wet-forest'],[46,'forest-highland'],
    [62,'forest-highland'],[75,'mountain-pass'],[96,'mountain-pass'],[117,'scorched-approach'],
    [133,'mini-boss-arena'],[158,'wyrm-lair']]
};

const BIOME_NAMES = {
  'wet-forest':'Wet Forest', 'forest-highland':'Forest Highlands',
  'mountain-pass':'Mountain Pass', 'scorched-approach':'Scorched Approach',
  'mini-boss-arena':'Volcanic Arena', 'wyrm-lair':'Wyrm Lair'
};

export function huntRoutePreview(route, destination) {
  if(!Object.hasOwn(ROUTES,route))return null;
  const nodes=ROUTES[route].map(([distance,biome])=>({distance,biome}));
  const sample=createHuntRouteMaterialProfile(nodes);
  const stops=Object.freeze(nodes.map(({biome,distance})=>Object.freeze({
    kind:biome,name:BIOME_NAMES[biome],profile:sample(distance)
  })));
  const index=Number.isInteger(destination)&&destination>=0&&destination<stops.length?destination:0;
  return Object.freeze({route,index,stops,stop:stops[index]});
}

// The streamed forest entrance assumes a fixed inset. Steep standalone
// road grades can require a different stable foothold near the same entry.
export function spawnHuntRoutePreview(world,layout) {
  const {x,z}=layout.topology.entry;
  const {minZ,maxZ}=layout.footprint;
  for(const offset of [0,-1,-2,-3,1]){
    const row=z+offset;
    if(row<minZ||row>maxZ)continue;
    const actor=spawnTerrainActor(world,{x:x+.5,z:row+.5,searchTopY:30,maxSearchDistance:64});
    if(actor)return Object.freeze({...actor});
  }
  throw new Error('No physical Voxel V2 floor near the Hunt route entry');
}
