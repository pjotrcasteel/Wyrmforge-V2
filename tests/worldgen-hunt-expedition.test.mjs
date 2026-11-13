import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createHuntExpeditionRecipe,composeHuntExpeditionPlan,
  HUNT_REGION_EDGE
} from '../src/world-generation/hunt-expedition-plan.mjs';
import {
  generateWorldExpeditionRegion,generateWorldSite
} from '../src/world-generation/index.mjs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';

function expedition(seed=7,overrides={}) {
  return composeHuntExpeditionPlan(createHuntExpeditionRecipe({
    journeyId:'fire-tier-one',huntId:'hunt-forest-01',chapter:0,
    kind:'wet-forest',seed,worldRevision:3,scope:'standard',
    storyBeats:[
      {id:'find-scorched-markings',type:'investigation'},
      {id:'trace-the-fire-magic',type:'revelation'},
      {id:'survive-the-crossing',type:'confrontation'}
    ],...overrides
  }));
}
function load(result) {
  const loader=new V2ExternalTerrainLoader(result.definition);
  let steps=0;
  while(!loader.progress.done) {
    loader.loadStep(997);
    assert.ok(++steps<60,'one 32m region should load within bounded steps');
  }
  return loader;
}
function topAt(world,x,z) {
  for(let y=24;y>=-3;y--)if(world.get(x,y,z)!==0)return y;
  return null;
}

test('World Map Hunt becomes a seed-stable connected multi-region adventure plan',()=>{
  const a=expedition(7);
  const b=expedition(7);
  const varied=expedition(8);
  assert.deepEqual(a,b);
  assert.notEqual(a.hash,varied.hash);
  assert.ok(a.regions.length>=11);
  assert.equal(a.regionEdgeMetres,32);
  assert.ok(a.footprint.widthMetres>=96);
  assert.ok(a.footprint.depthMetres>=160);
  assert.ok(a.spatialAudit.optionalDetours>=3);
  assert.equal(a.spatialAudit.reachableRegions,a.regions.length);
  assert.equal(a.spatialAudit.storyOpportunities,3);
  assert.ok(a.regions.some(r=>r.role==='investigation'));
  assert.ok(a.regions.some(r=>r.role==='horde'));
  assert.ok(a.regions.some(r=>r.role==='extraction'));
  assert.equal(a.regionDefinitionsLoaded,0);
  assert.equal(a.streamingRuntimeImplemented,false);
  assert.equal(a.recipe.storyBeats[0].id,'find-scorched-markings');
  assert.ok(a.regions.some(r=>r.opportunities.some(o=>
    o.id==='find-scorched-markings' &&
    o.kind==='story-investigation' && !o.implementedGameplay)));
  for(const region of a.regions) {
    assert.equal(region.bounds.maxX-region.bounds.minX+1,HUNT_REGION_EDGE);
    assert.equal(region.bounds.maxZ-region.bounds.minZ+1,HUNT_REGION_EDGE);
  }
});

test('World Map can request a larger journey node without fixed story or enemy spawns',()=>{
  const standard=expedition(19);
  const extended=expedition(19,{scope:'extended',chapter:3,
    kind:'scorched-approach',corruption:0.85,
    storyBeats:[{id:'old-clues',type:'revelation'}]});
  assert.ok(extended.regions.length>standard.regions.length);
  assert.ok(extended.footprint.widthMetres>=128);
  assert.equal(extended.recipe.chapter,3);
  assert.equal(extended.recipe.corruption,0.85);
  assert.equal(extended.recipe.kind,'scorched-approach');
  assert.equal(extended.recipe.journeyId,standard.recipe.journeyId);
  assert.equal(extended.spatialAudit.storyOpportunities,1);
  assert.ok(extended.regions.every(region=>
    region.opportunities.every(item=>item.implementedGameplay===false)));
});

test('expedition region links form shared cardinal ports in continuous world coordinates',()=>{
  const plan=expedition();
  const byId=new Map(plan.regions.map(region=>[region.id,region]));
  const allPorts=new Set();
  for(const link of plan.links) {
    const a=byId.get(link.fromId),b=byId.get(link.toId);
    assert.ok(a && b && a.id!==b.id);
    assert.ok(a.ports.some(p=>p.id===link.fromPort.id));
    assert.ok(b.ports.some(p=>p.id===link.toPort.id));
    const dx=Math.abs(link.fromPort.at.x-link.toPort.at.x);
    const dz=Math.abs(link.fromPort.at.z-link.toPort.at.z);
    assert.equal(dx+dz,1,'ports must be adjacent 1m physical surfaces');
    assert.equal(link.fromPort.widthMetres,6);
    assert.equal(link.toPort.widthMetres,6);
    allPorts.add(link.fromPort.id);allPorts.add(link.toPort.id);
  }
  assert.equal(allPorts.size,plan.links.length*2);
});

test('each region generates its own bounded genuine 3D Voxel V2 definition',()=>{
  const plan=expedition(7);
  const signatures=[];
  for(const region of plan.regions) {
    const result=generateWorldExpeditionRegion(plan,region.id);
    signatures.push(result.hash);
    assert.equal(result.regionId,region.id);
    assert.equal(result.definition.siteId,plan.recipe.huntId+'-'+region.id);
    assert.equal(result.definition.generatorVersion,'worldgen-expedition-v0.1');
    assert.equal(result.definition.chunkEdge,16);
    assert.equal(result.layout.physicalRoutePortsReady,true);
    assert.deepEqual(result.layout.footprint.minX,region.bounds.minX);
    assert.deepEqual(result.layout.footprint.maxZ,region.bounds.maxZ);
    assert.ok(result.definition.totalCells>6000);
    assert.ok(result.definition.runs.length<8192);
    assert.ok(result.layout.center.surfaceY>=2);
    assert.ok(result.layout.opportunities.length>=1);
    assert.equal(result.layout.hasLiveEnemies,false);
  }
  assert.equal(new Set(signatures).size,plan.regions.length);
  assert.equal(plan.regionDefinitionsLoaded,0,
    'planning does not create persistent regional voxel worlds');
});

test('two on-demand neighboring regions have physical flat 7m seams and no duplicate XY cells',()=>{
  const plan=expedition(77);
  const link=plan.links.find(item=>
    item.fromId==='region-entry' || item.toId==='region-entry');
  assert.ok(link);
  const a=generateWorldExpeditionRegion(plan,link.fromId);
  const b=generateWorldExpeditionRegion(plan,link.toId);
  const first=load(a),second=load(b);
  try {
    const worldA=first.terrain.world,worldB=second.terrain.world;
    const {fromPort,toPort}=link;
    assert.equal(fromPort.at.x-toPort.at.x===0 ||
      fromPort.at.z-toPort.at.z===0,true);
    const sideAxis=fromPort.at.x===toPort.at.x?'x':'z';
    for(let offset=-3;offset<=3;offset++) {
      const pa={...fromPort.at},pb={...toPort.at};
      pa[sideAxis]+=offset;pb[sideAxis]+=offset;
      assert.equal(topAt(worldA,pa.x,pa.z),6);
      assert.equal(topAt(worldB,pb.x,pb.z),6);
      assert.equal(worldA.get(pa.x,7,pa.z),0);
      assert.equal(worldB.get(pb.x,7,pb.z),0);
    }
    const left=plan.regions.find(x=>x.id===link.fromId).bounds;
    const right=plan.regions.find(x=>x.id===link.toId).bounds;
    assert.ok(left.maxX<right.minX || right.maxX<left.minX ||
      left.maxZ<right.minZ || right.maxZ<left.minZ);
    const again=generateWorldExpeditionRegion(plan,link.fromId);
    assert.deepEqual(a,again);
  } finally {first.unload();second.unload();}
});

test('unprotected region edges also retain coherent world-space natural elevation',()=>{
  for(const seed of [7,19,101,267]) {
    const plan=expedition(seed,{kind:seed===267?'mountain-pass':'wet-forest'});
    const link=plan.links.find(item=>
      item.fromId==='region-horde-crossing' ||
      item.toId==='region-horde-crossing');
    assert.ok(link);
    const a=generateWorldExpeditionRegion(plan,link.fromId);
    const b=generateWorldExpeditionRegion(plan,link.toId);
    const la=load(a),lb=load(b);
    try {
      const pa=link.fromPort.at,pb=link.toPort.at;
      const axis=pa.x===pb.x?'x':'z';
      for(let offset=-15;offset<=15;offset++) {
        const aa={...pa},bb={...pb};
        aa[axis]+=offset;bb[axis]+=offset;
        const h1=topAt(la.terrain.world,aa.x,aa.z);
        const h2=topAt(lb.terrain.world,bb.x,bb.z);
        assert.ok(h1!==null && h2!==null && Math.abs(h1-h2)<=1,
          'natural region seam exceeds one physical metre');
      }
    } finally {la.unload();lb.unload();}
  }
});

test('WorldMap recipe rejects invalid scope, illegal kind and fake story hints',()=>{
  for(const data of [
    {scope:'giant'},{seed:-1},{corruption:1.01},{chunkEdge:64},
    {chapter:300},{kind:'invalid-site'},{storyBeats:[{id:'X',type:'loot'}]},
    {storyBeats:[{id:'same',type:'investigation'},
      {id:'same',type:'revelation'}]}
  ])assert.throws(()=>createHuntExpeditionRecipe(data),{
    name:/RangeError|TypeError/
  });
  const plan=expedition(7);
  assert.throws(()=>generateWorldExpeditionRegion(plan,'no-such-region'),RangeError);
  assert.throws(()=>generateWorldExpeditionRegion(plan,'region-entry',{
    terrainAdapter:null
  }),TypeError);
});

test('legacy single-site World Generation remains intact and independent',()=>{
  const existing=generateWorldSite(createWorldSiteRecipe({
    kind:'wet-forest',seed:7
  }));
  assert.equal(existing.generatorVersion,'worldgen-v2.7.2');
  assert.equal(existing.recipe.radius,20);
  assert.equal(existing.definition.generatorVersion,'worldgen-v2.7.2');
  const source=readFileSync(new URL(
    '../src/world-generation/hunt-expedition-region.mjs',import.meta.url
  ),'utf8');
  assert.doesNotMatch(source,/from ['"]\.\.\/voxel-world/);
  assert.doesNotMatch(source,/from ['"]\.\.\/external-terrain-loader/);
});
