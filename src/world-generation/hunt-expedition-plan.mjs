// Hunt expedition geography plan (World Map -> World Generation V2).
// This is a multi-region *spatial* contract, not enemy spawning, a story
// generator, or an eagerly loaded giant voxel site. Story beat IDs are
// opaque directives supplied by World Map / Gameplay, not made-up quests.
import { MAP_KIND_IDS } from './map-kinds.mjs';

export const HUNT_EXPEDITION_RECIPE_SCHEMA='wyrmforge.hunt-expedition-recipe.v1';
export const HUNT_EXPEDITION_PLAN_SCHEMA='wyrmforge.hunt-expedition-plan.v1';
export const HUNT_REGION_EDGE=32; // metres; each region can be loaded on demand
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const TYPES=new Set(['investigation','revelation','confrontation']);
const SCOPES=new Set(['standard','extended']);
const keyed=(x,z)=>x+','+z;
const int=n=>Number.isSafeInteger(n);
const fnv=(value)=>{
  let h=0x811c9dc5;
  for(let i=0;i<value.length;i++) {
    h=Math.imul(h^value.charCodeAt(i),0x01000193);
  }
  return (h>>>0).toString(16).padStart(8,'0');
};

export function createHuntExpeditionRecipe({
  journeyId='fire-tier-one',huntId='hunt-forest-01',chapter=0,
  kind='wet-forest',seed=7,worldRevision=0,chunkEdge=16,
  corruption=0,scope='standard',storyBeats=[]
}={}) {
  if(![journeyId,huntId].every(v=>typeof v==='string' && ID.test(v)) ||
      !MAP_KIND_IDS.includes(kind) || !int(seed) || seed<0 ||
      seed>0xffffffff || !int(chapter) || chapter<0 || chapter>255 ||
      !int(worldRevision) || worldRevision<0 || worldRevision>1e6 ||
      ![16,32].includes(chunkEdge) || !Number.isFinite(corruption) ||
      corruption<0 || corruption>1 || !SCOPES.has(scope) ||
      !Array.isArray(storyBeats) || storyBeats.length>5) {
    throw new RangeError('Invalid bounded World Map Hunt expedition recipe');
  }
  const ids=new Set();
  const beats=storyBeats.map(beat=>{
    if(!beat || typeof beat.id!=='string' || !ID.test(beat.id) ||
        !TYPES.has(beat.type) || ids.has(beat.id)) {
      throw new TypeError('Story beat must have a unique opaque ID and type');
    }
    ids.add(beat.id);
    return Object.freeze({id:beat.id,type:beat.type});
  });
  return Object.freeze({
    schema:HUNT_EXPEDITION_RECIPE_SCHEMA,journeyId,huntId,chapter,
    kind,seed,worldRevision,chunkEdge,corruption,scope,
    storyBeats:Object.freeze(beats)
  });
}

const BASE=[
  ['entry',0,2,'arrival'],['woodland-trail',0,1,'exploration'],
  ['horde-crossing',0,0,'horde'],['forgotten-ruins',0,-1,'investigation'],
  ['extraction',0,-2,'extraction'],
  ['buried-grove',-1,1,'discovery'],['western-shelf',-1,0,'flank'],
  ['abandoned-outpost',-1,-1,'investigation'],
  ['eastern-clearing',1,1,'horde'],['eastern-gully',1,0,'discovery'],
  ['eastern-overlook',1,-1,'flank']
];
const EXTRA=[
  ['side-approach',2,1,'exploration'],
  ['hidden-cavern',2,0,'investigation'],
  ['fractured-overlook',2,-1,'horde']
];
const OPPORTUNITIES=Object.freeze({
  arrival:'safe-entry',exploration:'exploration-landmark',
  horde:'horde-suitable-space',investigation:'investigation-location',
  discovery:'optional-discovery',flank:'retreat-and-flank',
  extraction:'extraction-site'
});
const DELTAS=Object.freeze([
  Object.freeze({dx:1,dz:0,side:'east'}),
  Object.freeze({dx:-1,dz:0,side:'west'}),
  Object.freeze({dx:0,dz:1,side:'south'}),
  Object.freeze({dx:0,dz:-1,side:'north'})
]);
const opposite=Object.freeze({
  north:'south',south:'north',east:'west',west:'east'
});
function portFor(region,side,peerId) {
  const {x,z}=region.origin;
  const edge=HUNT_REGION_EDGE/2;
  const point=side==='north'?{x,z:z-edge}:
    side==='south'?{x,z:z+edge-1}:
    side==='east'?{x:x+edge-1,z}:{x:x-edge,z};
  return Object.freeze({
    id:region.id+'-'+side,direction:side,
    at:Object.freeze(point),peerRegionId:peerId,widthMetres:6
  });
}

export function composeHuntExpeditionPlan(recipe) {
  if(!recipe || recipe.schema!==HUNT_EXPEDITION_RECIPE_SCHEMA) {
    throw new TypeError('Expedition plan requires a validated World Map recipe');
  }
  // Revalidate even when callers constructed the schema directly.
  const r=createHuntExpeditionRecipe(recipe);
  const mirror=(r.seed&1)?1:-1;
  const specs=[...BASE,...(r.scope==='extended'?EXTRA:[])];
  const draft=specs.map(([name,gx,gz,role])=>{
    const x=gx*mirror*HUNT_REGION_EDGE,z=gz*HUNT_REGION_EDGE;
    return {
      id:'region-'+name,role,
      gridX:gx*mirror,gridZ:gz,
      origin:Object.freeze({x,z}),
      bounds:Object.freeze({
        minX:x-16,maxX:x+15,minZ:z-16,maxZ:z+15
      })
    };
  });
  const byCoord=new Map(draft.map(region=>[
    keyed(region.gridX,region.gridZ),region
  ]));
  const links=[];
  for(const region of draft)for(const {dx,dz,side} of DELTAS) {
    const peer=byCoord.get(keyed(region.gridX+dx,region.gridZ+dz));
    if(!peer || region.id>=peer.id)continue;
    links.push(Object.freeze({
      id:'link-'+[region.id,peer.id].sort().join('-'),
      fromId:region.id,toId:peer.id,
      fromPort:portFor(region,side,peer.id),
      toPort:portFor(peer,opposite[side],region.id)
    }));
  }
  links.sort((a,b)=>a.id.localeCompare(b.id));
  const storySlots=Object.freeze({
    investigation:['buried-grove','forgotten-ruins',
      'abandoned-outpost','eastern-gully','eastern-overlook'],
    revelation:['forgotten-ruins','abandoned-outpost','extraction',
      'hidden-cavern'],
    confrontation:['horde-crossing','eastern-clearing',
      'fractured-overlook']
  });
  const assigned=new Map();
  for(const beat of r.storyBeats) {
    const options=storySlots[beat.type];
    const target=options.find(name=>draft.some(node=>
      node.id==='region-'+name) && !assigned.has('region-'+name));
    if(!target)throw new RangeError('Not enough suitable sites for story beat '+beat.id);
    assigned.set('region-'+target,beat);
  }
  const regions=Object.freeze(draft.map(region=>{
    const ports=links.flatMap(link=>
      link.fromId===region.id?[link.fromPort]:
      link.toId===region.id?[link.toPort]:[]);
    const beat=assigned.get(region.id)??null;
    return Object.freeze({
      ...region,
      biome:r.kind,
      ports:Object.freeze(ports.sort((a,b)=>
        a.direction.localeCompare(b.direction))),
      opportunities:Object.freeze([
        Object.freeze({
          id:region.id+'-opportunity',
          kind:OPPORTUNITIES[region.role],
          at:Object.freeze({...region.origin}),
          // A spatial location only; World Objects/Gameplay own its content.
          implementedGameplay:false
        }),
        ...(beat?[Object.freeze({
          id:beat.id,kind:'story-'+beat.type,
          at:Object.freeze({x:region.origin.x+3,z:region.origin.z-3}),
          implementedGameplay:false
        })]:[])
      ])
    });
  }));
  const byId=new Map(regions.map(region=>[region.id,region]));
  const seen=new Set(['region-entry']),stack=['region-entry'];
  while(stack.length) {
    const id=stack.pop();
    for(const link of links) {
      const next=link.fromId===id?link.toId:
        link.toId===id?link.fromId:null;
      if(next && !seen.has(next)) {seen.add(next);stack.push(next);}
    }
  }
  if(seen.size!==regions.length ||
      !byId.has('region-extraction') ||
      links.length<=regions.length) {
    throw new Error('Hunt expedition graph has no connected multi-route geography');
  }
  const minX=Math.min(...regions.map(x=>x.bounds.minX));
  const maxX=Math.max(...regions.map(x=>x.bounds.maxX));
  const minZ=Math.min(...regions.map(x=>x.bounds.minZ));
  const maxZ=Math.max(...regions.map(x=>x.bounds.maxZ));
  const layout=Object.freeze({
    schema:HUNT_EXPEDITION_PLAN_SCHEMA,recipe:r,
    regionEdgeMetres:HUNT_REGION_EDGE,
    regions,links:Object.freeze(links),
    entryRegionId:'region-entry',exitRegionId:'region-extraction',
    footprint:Object.freeze({
      minX,maxX,minZ,maxZ,
      widthMetres:maxX-minX+1,depthMetres:maxZ-minZ+1
    }),
    spatialAudit:Object.freeze({
      reachableRegions:seen.size,
      optionalDetours:links.length-regions.length+1,
      storyOpportunities:r.storyBeats.length,
      ready:true
    }),
    // No eagerly materialized voxels and no assertion of *physical* seams:
    // those are proven by an independent on-demand region generator.
    regionDefinitionsLoaded:0,streamingRuntimeImplemented:false
  });
  return Object.freeze({
    ...layout,hash:'hunt-plan-'+fnv(JSON.stringify(layout))
  });
}
