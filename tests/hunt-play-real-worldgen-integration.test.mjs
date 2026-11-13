import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite } from '../src/world-generation/index.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { spawnHuntExplorer,stepHuntExplorer,HUNT_FIXED_STEP } from '../src/hunt-play-runtime.mjs';
import { actorOverlapsTerrain } from '../src/terrain-actor.mjs';

function canonicalWetForestRecipe() {
  // Identical to the visible World Generation V2 lab's non-expedition path,
  // for the same seed, kind, pitch, corruption and world revision.
  return createWorldSiteRecipe({
    regionId:'starter-region',siteId:'preview-wet-forest',
    encounterId:'preview-001',kind:'wet-forest',seed:7,
    worldRevision:0,chunkEdge:32,corruption:0
  });
}

test('H08-01 Play Hunt consumes the SAME authored WorldGeneratorV2 output as the lab',()=>{
  const recipe=canonicalWetForestRecipe();
  const lab=generateWorldSite(recipe);
  const hunt=generateWorldSite({...recipe});

  assert.equal(hunt.schema,'wyrmforge.generated-site.v2');
  assert.equal(hunt.generatorVersion,'worldgen-v2.7.2');
  assert.equal(hunt.definition.generatorVersion,hunt.generatorVersion);
  assert.equal(hunt.definition.schema,'voxel-v2.terrain-initialization.v2');
  assert.ok(hunt.layout.topology.reachable);
  assert.ok(hunt.layout.microSurface.tileCount>0,
    'the real 10cm microvoxel grammar is mandatory, not optional fake flat terrain');
  assert.ok(hunt.layout.roadGrades.cells>0,
    'real grade/road shaping from WorldGen must be preserved');
  assert.equal(hunt.recipe.radius,20);
  assert.ok(hunt.layout.escapeRoutes.length>0,
    'the actual authored alternative exploration routes must survive');
  assert.ok(hunt.layout.combatSpaces.length>0);
  assert.deepEqual(hunt,lab,
    'the same recipe in the lab and Play Hunt must have exactly identical output');
});

test('H08-01 game actor can spawn and navigate real WorldGen V2 terrain through Voxel V2',()=>{
  const generatedSite=generateWorldSite(canonicalWetForestRecipe());
  const loader=new V2ExternalTerrainLoader(generatedSite.definition);
  let steps=0;
  try {
    while(!loader.progress.done) {
      loader.loadStep(192);
      assert.ok(++steps<3000,'real WorldGen site must load with bounded Voxel V2 steps');
    }
    const world=loader.terrain.world;
    const bounds=generatedSite.layout.footprint;
    const entry=generatedSite.layout.topology.entry;
    assert.ok(world.chunkCount>4,'authored multi-layer world has real chunk topology');
    const actorRegion={bounds,origin:{x:0,z:0}};
    const actor=spawnHuntExplorer(world,actorRegion,{
      direction:'south',at:{x:entry.x,z:entry.z}
    });
    assert.equal(actor.grounded,true,'Wizard must land on authoritative terrain');
    assert.equal(actorOverlapsTerrain(world,actor),false);
    assert.ok(actor.z>0 && actor.z<bounds.maxZ);
    let moved=actor;
    for(let i=0;i<24;i++) {
      moved=stepHuntExplorer(world,moved,bounds,{moveZ:-1},HUNT_FIXED_STEP);
      assert.ok(!moved.error);
      assert.equal(actorOverlapsTerrain(world,moved),false);
    }
    assert.ok(moved.z<actor.z,'movement must happen on the real WorldGen floor');
  } finally {
    loader.unload();
  }
});

test('H08-01 Play Hunt cannot fall back to the simplified expedition generator',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  const playHtml=readFileSync(new URL('../play-hunt.html',import.meta.url),'utf8');
  const labHtml=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');

  assert.match(host,/const inspectExpedition=!playMode && expeditionMode\.checked/);
  assert.match(host,/const kind=playMode\?'wet-forest':siteKind\.value/);
  assert.match(host,/generatedSite=generateWorldSite\(recipe\)/);
  assert.match(host,/new V2ExternalTerrainLoader\(generatedSite\.definition/);
  assert.match(host,/generatedSite\.definition\.schema!=='voxel-v2\.terrain-initialization\.v2'/);
  assert.match(host,/generatedSite\.layout\.microSurface\.tileCount<1/);
  assert.match(host,/playActor=spawnHuntExplorer\(active\.world,region/);
  assert.match(host,/generatedSite\.layout\.footprint,input\)/);
  assert.match(host,/generatedSite\.layout\.topology\.entry/);
  assert.match(host,/Voxel source: /);
  assert.match(host,/microSurfaceTiles:generatedSite\?\.layout\.microSurface\.tileCount/);
  assert.doesNotMatch(playHtml,/id="expedition-mode"[^>]*checked/);
  assert.match(labHtml,/id="expedition-mode"/);
  // A true WorldGen-generated site must be visible in the lab as well.
  assert.match(host,/const recipe=createWorldSiteRecipe\(/);
});


test('real WorldGen grass, dirt, slopes and 10cm surface stay collider-safe throughout a long walk',()=>{
  const generated=generateWorldSite(canonicalWetForestRecipe());
  const loader=new V2ExternalTerrainLoader(generated.definition);
  try {
    while(!loader.progress.done)loader.loadStep(4096);
    const world=loader.terrain.world;
    const entry=generated.layout.topology.entry;
    const region={
      origin:{x:0,z:0},bounds:generated.layout.footprint
    };
    let actor=spawnHuntExplorer(world,region,{
      direction:'south',at:{x:entry.x,z:entry.z}
    });
    assert.ok(actor);
    const start={...actor};
    let moved=0;
    for(let i=0;i<400;i++){
      const controls=i<180?{moveX:-.25,moveZ:-1}:
        i<260?{moveX:1,moveZ:-.2}:
        i<320?{moveX:-1,moveZ:.3}:{moveX:0,moveZ:1};
      const after=stepHuntExplorer(world,actor,
        generated.layout.footprint,controls,HUNT_FIXED_STEP);
      assert.notEqual(after.error,'actor-overlap',
        'Play Hunt must never brick the Wizard on real authored microterrain');
      assert.equal(actorOverlapsTerrain(world,after),false,
        'the real microvoxel collider cannot be penetrated by game controls');
      if(Math.hypot(after.x-actor.x,after.z-actor.z)>0.001)moved++;
      actor=after;
    }
    assert.ok(moved>30,'the physical Wizard should make progress, not freeze at spawn');
    assert.ok(Math.hypot(actor.x-start.x,actor.z-start.z)>0.1);
  } finally {
    loader.unload();
  }
});

test('Play Hunt matches WorldGen inspection camera AND material shader by default',()=>{
  const play=readFileSync(new URL('../play-hunt.html',import.meta.url),'utf8');
  const lab=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(play,/value="inspection" selected/);
  assert.match(lab,/value="inspection" selected/);
  assert.doesNotMatch(play,/value="hunt" selected/);
  assert.match(host,/fastHuntMode:false/);
  assert.match(host,/playMode && viewCamera\.value==='inspection'/);
  assert.match(host,/const diagonal=Math\.SQRT1_2/);
  assert.match(host,/playCameraToggle\.addEventListener\('click'/);
  assert.match(play,/id="play-camera-toggle"/);
  assert.match(play,/<details id="play-hud">/);
  assert.match(host,/playHudDetails\.textContent=/);
  assert.doesNotMatch(play,/<details id="play-hud" open/);
});
