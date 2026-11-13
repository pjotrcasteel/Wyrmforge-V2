import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('existing external 3D lab previews World Generation V2 without implementing it',()=>{
  const html=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(html,/id="site-kind"/);
  assert.match(html,/value="wet-forest" selected/);
  assert.match(html,/value="forest-highland"/);
  assert.match(html,/value="mountain-pass"/);
  assert.match(html,/value="scorched-approach"/);
  assert.match(html,/value="mini-boss-arena"/);
  assert.match(html,/value="wyrm-lair"/);
  assert.match(html,/value="fixture"/);
  assert.match(html,/id="site-seed"/);
  assert.match(html,/id="site-influence"/);
  assert.match(host,/corruption:Number\(siteInfluence\.value\)\/100/);
  assert.match(host,/siteInfluence\.addEventListener\('change'/);
  assert.match(host,/generateWorldSite,generateWorldExpeditionRegion/);
  assert.match(html,/id="expedition-mode"/);
  assert.match(html,/id="expedition-region"/);
  assert.match(host,/generateWorldExpeditionRegion\(/);
  assert.match(host,/expeditionRegion\.addEventListener\('change'/);
  assert.match(host,/expeditionRegionField\.hidden=!inspectExpedition/);
  assert.match(host,/generatedSite=generateWorldSite\(recipe\)/);
  assert.match(host,/new V2ExternalTerrainLoader\(generatedSite\.definition,/);
  assert.match(host,/new V2ExternalTerrainLoader\(createExternalSiteFixture\(/);
  assert.match(host,/siteKind\.addEventListener\('change',\(\)=>\{/);
  assert.match(host,/siteSeed\.addEventListener\('change',\(\)=>\{/);
  assert.match(host,/active\.port\.apply\(/);
  assert.match(host,/generatedSite\.layout\.clearings\[0\]/);
  assert.match(host,/generateWorldSite\(recipe\)/);
  assert.doesNotMatch(host,/new VoxelWorld\(|createScene\(/);
});

test('World Generation core and adapter cannot import renderer or V1 assets',()=>{
  for(const module of ['site-recipe','site-plan-builder','site-topology-specification',
    'map-kinds','world-generator','voxel-terrain-adapter',
    'hunt-expedition-plan','hunt-expedition-region']) {
    const src=readFileSync(new URL('../src/world-generation/'+module+'.mjs',import.meta.url),'utf8');
    assert.doesNotMatch(src,/from ['"][^'"]*(?:webgl|camera-presets|v1|V1\/)/i);
    assert.doesNotMatch(src,/window\.|document\.|new Worker\(/);
  }
});
