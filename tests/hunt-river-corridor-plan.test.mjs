import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {
  generateWorldSite,generateAuthoredHuntTerrainGraph,
  composeHuntExpeditionPlan,createHuntExpeditionRecipe
} from '../src/world-generation/index.mjs';
import {containsHuntLandform} from '../src/world-generation/hunt-landform-footprint.mjs';
import {
  planHuntRiverCorridor,HUNT_RIVER_CORRIDOR_PLAN_SCHEMA
} from '../src/world-generation/hunt-river-corridor-plan.mjs';

function setup(seed=7,river='water'){
  const entry=generateWorldSite(createWorldSiteRecipe({
    seed,kind:'wet-forest',...(river?{river}:{}),huntRole:'arrival',chunkEdge:32
  }));
  const plan=composeHuntExpeditionPlan(createHuntExpeditionRecipe({
    journeyId:'fire-tier-one',huntId:'preview-expedition',
    kind:'wet-forest',seed,chunkEdge:32
  }));
  return generateAuthoredHuntTerrainGraph(entry,plan);
}

const corridor=(graph)=>{
  const link=graph.layout.links.find(item=>
    [item.fromId,item.toId].includes('region-entry')&&
    [item.fromId,item.toId].includes('region-woodland-trail'));
  assert.ok(link,'initial streamed graph has a real WorldGen connecting link');
  return link;
};

test('Water V2 plans one bounded 1m-cardinal course through the actual native 8m link',()=>{
  const graph=setup(),link=corridor(graph);
  const proposal=planHuntRiverCorridor(graph,link.id);
  const gap=cell=>Math.max(link.bounds.minX-cell.x,0,cell.x-link.bounds.maxX)+
    Math.max(link.bounds.minZ-cell.z,0,cell.z-link.bounds.maxZ);
  const describe=id=>{
    const ch=graph.region(id).fluidLayout?.riverChannels?.[0];
    const near=ch?.floor?.map(cell=>({...cell,gap:gap(cell)}))
      .sort((a,b)=>a.gap-b.gap||a.z-b.z||a.x-b.x).slice(0,5);
    return {id,cellCount:ch?.floor?.length??0,near};
  };
  assert.ok(proposal,'the two real Wet Forest riverbeds must have a candidate corridor: '+
    JSON.stringify({linkBounds:link.bounds,from:describe(link.fromId),to:describe(link.toId)}));
  assert.equal(proposal.schema,HUNT_RIVER_CORRIDOR_PLAN_SCHEMA);
  assert.equal(proposal.status,'proposed-unapplied');
  assert.equal(proposal.linkId,link.id);
  assert.equal(proposal.kind,'water');
  assert.ok(proposal.points.length>=10&&proposal.points.length<=80);
  const a=graph.layout.regions.find(item=>item.id===link.fromId);
  const b=graph.layout.regions.find(item=>item.id===link.toId);
  const bands=new Map([a,b,link].map(band=>[band.id,band]));
  const beds=id=>new Set(graph.region(id).fluidLayout.riverChannels[0].floor
    .map(cell=>cell.x+','+cell.z));
  const [first,...rest]=proposal.points;
  const last=proposal.points.at(-1);
  assert.ok(beds(a.id).has(first.x+','+first.z));
  assert.ok(beds(b.id).has(last.x+','+last.z));
  let linkTouches=0;
  for(const [i,point]of proposal.points.entries()){
    const band=bands.get(point.bandId);
    assert.ok(band&&containsHuntLandform(band,point.x,point.z),
      'proposed channel cannot leave the physical native WorldGen landform');
    if(point.bandId===link.id)linkTouches++;
    if(i){
      const previous=proposal.points[i-1];
      assert.equal(Math.abs(point.x-previous.x)+Math.abs(point.z-previous.z),1,
        'river cannot jump across any unrendered WorldGen voxel');
    }
  }
  assert.ok(linkTouches>=8,'the planned wet path crosses all eight link columns');
  assert.deepEqual(
    planHuntRiverCorridor(graph,link.id),
    proposal,'the same WorldGen graph always produces the same candidate'
  );
});

test('dry sites, unknown links and unsafe budgets cannot be treated as wet seams',()=>{
  const graph=setup(7,false);
  assert.equal(planHuntRiverCorridor(graph,corridor(graph).id),null);
  assert.throws(()=>planHuntRiverCorridor(graph,'not-a-link'),/Unknown authored Hunt link/);
  assert.throws(()=>planHuntRiverCorridor(graph,corridor(graph).id,{
    maxEndpointReach:200
  }),/bounded authored WorldGen/);
});
