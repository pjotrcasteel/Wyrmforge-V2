import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite,generateConnectedHuntStart,generateConnectedHuntContinuation,connectedHuntLocation } from '../src/world-generation/index.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { spawnTerrainActor,actorOverlapsTerrain } from '../src/terrain-actor.mjs';
import { stepHuntExplorer,HUNT_FIXED_STEP } from '../src/hunt-play-runtime.mjs';

function entry(seed=7) {
  return generateWorldSite(createWorldSiteRecipe({
    regionId:'starter-region',siteId:'preview-wet-forest',
    encounterId:'preview-001',kind:'wet-forest',seed,chunkEdge:32
  }));
}

test('connected start retains both independently authored site definitions without replacing geometry',()=>{
  for(const seed of [7,19,101,267]) {
    const start=entry(seed);
    const connection=generateConnectedHuntStart(start);
    assert.deepEqual(connection,generateConnectedHuntStart(start));
    assert.equal(connection.streaming,false);
    assert.equal(connection.sites.length,2);
    assert.equal(connection.footprint.maxX-connection.footprint.minX+1,40);
    assert.equal(connection.footprint.maxZ-connection.footprint.minZ+1,88);
    assert.equal(connection.sites[0].hash,start.hash);
    assert.equal(connection.sites[1].id,'region-woodland-trail');
    const north=generateWorldSite(createWorldSiteRecipe({
      ...start.recipe,regionId:'region-woodland-trail',
      siteId:'preview-region-woodland-trail'
    }));
    assert.equal(connection.sites[1].hash,north.hash);
    const offsetZ=connection.sites[1].offsetZ;
    const runs=connection.definition.runs;
    const tiles=connection.definition.surfaceTiles;
    assert.deepEqual(runs.filter(r=>r.z>=start.layout.footprint.minZ),
      start.definition.runs);
    assert.deepEqual(runs.filter(r=>r.z<=connection.sites[1].maxZ),
      north.definition.runs.map(r=>({...r,z:r.z+offsetZ})));
    assert.deepEqual(tiles.filter(t=>t.z>=start.layout.footprint.minZ),
      start.definition.surfaceTiles);
    assert.deepEqual(tiles.filter(t=>t.z<=connection.sites[1].maxZ),
      north.definition.surfaceTiles.map(t=>({...t,z:t.z+offsetZ})));
    assert.ok(connection.seam.maximumRouteGradeTenths<=5);
    assert.ok(tiles.length<=1024);
    assert.ok(connection.definition.runs.length<=8192);
  }
});

test('Wizard crosses the graded connection in both directions in one physical world and retains craters',()=>{
  const connection=generateConnectedHuntStart(entry());
  const loader=new V2ExternalTerrainLoader(connection.definition);
  try {
    while(!loader.progress.done)loader.loadStep(4096);
    const {world,port}=loader.terrain;
    const bounds=connection.footprint;
    let actor=spawnTerrainActor(world,{x:.5,z:-17.5,searchTopY:30,maxSearchDistance:64});
    assert.ok(actor?.grounded);
    assert.equal(connectedHuntLocation(connection,actor.z),'region-entry');
    const crater=port.raycast({origin:[5.5,30,-16.5],direction:[0,-1,0],maxDistance:64});
    assert.ok(crater);
    const result=port.apply({id:'before-travel-fireball',type:'carve-crater',
      ...crater.cell,radius:2.3,depth:2,expectedRevision:world.revision});
    assert.ok(result.removedVoxels>0);
    const revision=world.revision;
    const walk=(direction,target)=>{
      for(let i=0;i<450;i++){
        actor=stepHuntExplorer(world,actor,bounds,{moveZ:direction},HUNT_FIXED_STEP);
        assert.ok(!actor.error,'physical seam must not trap the actor: '+JSON.stringify(actor));
        assert.equal(actorOverlapsTerrain(world,actor),false);
        if(direction<0?actor.z<=target:actor.z>=target)return;
      }
      assert.fail('Wizard failed to reach '+target+'; stopped at '+JSON.stringify(actor));
    };
    walk(-1,-30.5);
    assert.equal(connectedHuntLocation(connection,actor.z),'region-woodland-trail');
    walk(1,-17.5);
    assert.equal(connectedHuntLocation(connection,actor.z),'region-entry');
    assert.equal(world.revision,revision);
    assert.equal(world.get(crater.cell.x,crater.cell.y,crater.cell.z),0);
    assert.ok(port.exportJournal().commands.some(c=>c.id==='before-travel-fireball'));
    assert.ok(world.chunkCount<=20);
  } finally {loader.unload();}
});

test('Play Hunt activates the connected authored terrain in one loader and retains the original diagnostic lab',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.ok(host.includes('playConnected=generateConnectedHuntStart(generatedSite)'));
  assert.ok(host.includes('new V2ExternalTerrainLoader(playConnected.definition'));
  assert.ok(host.includes('new V2ExternalTerrainLoader(generatedSite.definition'));
  assert.ok(host.includes('playConnected?.footprint??generatedSite.layout.footprint,input'));
  assert.ok(host.includes('connectedWorld:playConnected?'));
  assert.ok(host.includes('const inspectExpedition=!playMode && expeditionMode.checked'));
});


// Audit the actual stored top material, not the route descriptor: a
// walkable grass gap still passes physics tests but disconnects the road.
function topMaterialAt(definition,x,z) {
  let y=-Infinity,material=0;
  for(const run of definition.runs) {
    if(run.z===z && x>=run.x && x<run.x+run.length && run.y>y) {
      y=run.y;material=run.material;
    }
  }
  return material;
}

test('both authored region seams retain a continuous dirt road at every row',()=>{
  for(const seed of [7,19,101,267]) {
    const authored=entry(seed);
    const start=generateConnectedHuntStart(authored);
    const next=generateConnectedHuntContinuation(authored,start);
    const materialAt=(x,z)=>topMaterialAt(
      z<start.footprint.minZ?next.definition:start.definition,x,z);
    for(const seam of [start.seam,next.seam]) {
      assert.equal(seam.profile,'broad-relief-road-v5');
      assert.ok(seam.maximumRouteGradeTenths<=5);
      for(let z=seam.minZ;z<=seam.maxZ;z++) {
        assert.equal(materialAt(0,z),2,'Missing dirt road at seed '+seed+', z='+z);
        assert.ok([-1,1].some(x=>materialAt(x,z)===2),
          'Road must not shrink to an isolated one-cell strip');
      }
      assert.equal(materialAt(0,seam.minZ-1),2,'Northern authored road endpoint');
      assert.equal(materialAt(0,seam.maxZ+1),2,'Southern authored road endpoint');
    }
  }
});


// Audit stored surface height (not shader appearance). Broad terrain
// beyond the two-cell graded shoulder must not be made of repeated
// fractional terraces. Seed 7 previously had thousands of small risers.
function auditBroadRelief(definition,seam) {
  const tiles=new Map(definition.surfaceTiles.map(t=>[t.x+','+t.z,t]));
  const top=new Map();
  for(const run of definition.runs) {
    if(run.z<seam.minZ || run.z>seam.maxZ)continue;
    for(let x=run.x;x<run.x+run.length;x++) {
      const key=x+','+run.z;
      if(!top.has(key)||top.get(key)<run.y)top.set(key,run.y);
    }
  }
  let outerMicroTiles=0,outerRisers=0,outerFineRisers=0;
  const elevations=new Set();
  for(let x=-20;x<20;x++){
    if(Math.abs(x)<6)continue;
    let previous=null,previousSign=0;
    for(let z=seam.minZ;z<=seam.maxZ;z++) {
      const y=top.get(x+','+z);
      assert.ok(Number.isInteger(y));
      const tile=tiles.get(x+','+z);
      if(tile)outerMicroTiles++;
      const h=y*10+(tile?tile.levels[0]:10);
      elevations.add(h);
      if(previous!==null && h!==previous) {
        outerRisers++;
        const delta=h-previous,sign=Math.sign(delta);
        if(Math.abs(delta)<10)outerFineRisers++;
        assert.ok(previousSign===0||previousSign===sign,
          'outer relief should not oscillate along the connector');
        previousSign=sign;
      }
      previous=h;
    }
  }
  let roadRisers=0,previousRoad=null;
  for(let z=seam.minZ;z<=seam.maxZ;z++){
    const tile=tiles.get('0,'+z);
    const h=top.get('0,'+z)*10+(tile?tile.levels[0]:10);
    if(previousRoad!==null && h!==previousRoad){
      roadRisers++;
      assert.ok(Math.abs(h-previousRoad)<=4,'road landings remain traversable');
    }
    previousRoad=h;
  }
  return {outerMicroTiles,outerRisers,outerFineRisers,roadRisers,elevationCount:elevations.size};
}

test('both joins have broad physical landforms without dense fractional shoulder contours',t=>{
  for(const seed of [7,19,101,267]){
    const authored=entry(seed);
    const start=generateConnectedHuntStart(authored);
    const next=generateConnectedHuntContinuation(authored,start);
    for(const [definition,seam] of [[start.definition,start.seam],[next.definition,next.seam]]){
      const metric=auditBroadRelief(definition,seam);
      t.diagnostic(JSON.stringify({seed,z:seam.minZ,...metric}));
      assert.equal(metric.outerMicroTiles,0);
      assert.equal(metric.outerFineRisers,0);
      assert.ok(metric.elevationCount>=2,'do not flatten all natural relief');
      assert.ok(metric.outerRisers<=100,'avoid repeated elevation bands');
      if(seed===7)assert.ok(metric.roadRisers<=5,'the reported seam needs fewer repeated road risers');
    }
  }
});
