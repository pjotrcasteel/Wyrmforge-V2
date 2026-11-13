import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite } from '../src/world-generation/index.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { projectEncounterGuides } from '../src/diagnostics/worldgen-combat-overlay.mjs';

test('optional overlay projects actual generated combat surfaces and all four ingress points',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'mountain-pass',seed:7}));
  const loader=new V2ExternalTerrainLoader(site.definition);
  try {
    while(!loader.progress.done) loader.loadStep(2048);
    const view={
      width:800,height:1200,scale:6,panX:0,panY:0,camera:'inspection'
    };
    const overlay=projectEncounterGuides(site,loader.terrain.world,view);
    assert.equal(overlay.combat.length,1);
    assert.equal(overlay.combat[0].ring.length,49);
    assert.equal(overlay.approaches.length,4);
    assert.equal(overlay.approaches.every(a=>a.centerId==='central-arena'),true);
    assert.equal(overlay.escapes.length,2);
    assert.deepEqual(overlay.escapes.map(x=>x.side),['west','east']);
    assert.equal(new Set(overlay.escapes.map(x=>x.id)).size,2);
    assert.ok(overlay.escapes.every(x=>x.points.length>=35));
    assert.ok(overlay.escapes.every(x=>x.points.every(p=>
      Number.isFinite(p.x) && Number.isFinite(p.y))));
    assert.ok(overlay.combat[0].ring.every(p=>Number.isFinite(p.x) &&
      Number.isFinite(p.y)));
    assert.deepEqual(projectEncounterGuides(site,loader.terrain.world,view),overlay);
    const hunt=projectEncounterGuides(site,loader.terrain.world,{...view,camera:'hunt'});
    assert.notDeepEqual(hunt.combat[0].ring,overlay.combat[0].ring);
  } finally {
    loader.unload();
  }
});

test('horde overlays are optional diagnostics and do not expose hidden discovery sites',()=>{
  const html=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  const helper=readFileSync(new URL('../src/diagnostics/worldgen-combat-overlay.mjs',import.meta.url),'utf8');
  assert.match(html,/id="combat-layout" type="checkbox"/);
  assert.match(html,/id="combat-guide" aria-hidden="true"/);
  assert.match(html,/#combat-guide\{position:absolute;inset:0;pointer-events:none/);
  assert.match(host,/if\(!combatLayout\.checked \|\| !generatedSite \|\| !active\?\.world\) return/);
  assert.match(host,/projectEncounterGuides\(generatedSite,active\.world,view\)/);
  assert.match(host,/paintEncounterGuide\(\{/);
  assert.doesNotMatch(helper,/\.discoveryCandidates|\.chests|\.lootTable/);
  assert.doesNotMatch(helper,/from ['"][^'"]*(?:world-generator|voxel-world|webgl)/);
});
