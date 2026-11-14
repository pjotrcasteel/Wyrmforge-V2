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
      assert.equal(seam.profile,'micrograded-road-v4');
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


// Evaluate the authoritative surface at 10cm resolution, not a screenshot
// or the metadata. Longitudinal steps must no longer be confined to the
// synchronized metre rows which produced the horizontal stripe artifact.
function shoulderRiserDistribution(definition,seam) {
  const tiles=new Map(definition.surfaceTiles.map(t=>[t.x+','+t.z,t]));
  const top=new Map();
  for(const run of definition.runs) {
    if(run.z<seam.minZ || run.z>seam.maxZ)continue;
    for(let x=run.x;x<run.x+run.length;x++) {
      const key=x+','+run.z;
      if(!top.has(key)||top.get(key)<run.y)top.set(key,run.y);
    }
  }
  const height=(mx,mz)=>{
    const x=Math.floor(mx/10),z=Math.floor(mz/10);
    const tile=tiles.get(x+','+z);
    const y=top.get(x+','+z);
    return y*10+(tile?tile.levels[(mz-z*10)*10+mx-x*10]:10);
  };
  let interior=0,coarse=0,mixedTiles=0;
  for(const t of tiles.values())if(t.z>=seam.minZ && t.z<=seam.maxZ &&
      Math.abs(t.x)>=5 && new Set(t.levels).size>1)mixedTiles++;
  for(let mz=seam.minZ*10+1;mz<(seam.maxZ+1)*10;mz++) {
    for(let mx=-200;mx<200;mx++){
      if(Math.abs(Math.floor(mx/10))<5)continue;
      const delta=Math.abs(height(mx,mz)-height(mx,mz-1));
      if(delta<1 || delta>5)continue; // natural cliffs are not the defect
      if(mz%10===0)coarse++;else interior++;
    }
  }
  return {interior,coarse,mixedTiles,interiorFraction:interior/(interior+coarse)};
}

test('both seam shoulders distribute physical risers inside 1m tiles, not only on synchronized metre boundaries',t=>{
  for(const seed of [7,19,101,267]){
    const authored=entry(seed);
    const start=generateConnectedHuntStart(authored);
    const next=generateConnectedHuntContinuation(authored,start);
    for(const [definition,seam] of [[start.definition,start.seam],[next.definition,next.seam]]){
      const metric=shoulderRiserDistribution(definition,seam);
      t.diagnostic(JSON.stringify({seed,z:seam.minZ,...metric}));
      assert.ok(metric.mixedTiles>=20,'shoulders require real varied microcell occupancy');
      assert.ok(metric.interiorFraction>=.25,'small risers must not be concentrated at whole-metre rows');
    }
  }
});
