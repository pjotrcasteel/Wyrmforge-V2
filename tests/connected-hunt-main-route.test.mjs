import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateConnectedHuntStart,generateConnectedHuntContinuation,
  activateConnectedHuntContinuation,connectedHuntLocation} from '../src/world-generation/index.mjs';

const ids=['region-entry','region-woodland-trail','region-horde-crossing',
  'region-forgotten-ruins','region-extraction'];

test('H08-02B: generate the five main-route sites without replacing authored geometry',()=>{
  for(const seed of [7,19,101,267]) {
    const entry=generateWorldSite(createWorldSiteRecipe({
      regionId:'starter-region',siteId:'preview-wet-forest',
      encounterId:'preview-001',kind:'wet-forest',seed,chunkEdge:32
    }));
    let route=generateConnectedHuntStart(entry);
    for(let i=2;i<ids.length;i++){
      const next=generateConnectedHuntContinuation(entry,route);
      assert.deepEqual(next,generateConnectedHuntContinuation(entry,route));
      assert.equal(next.site.id,ids[i]);
      assert.equal(next.seam.maxZ,route.footprint.minZ-1);
      assert.equal(next.site.maxZ,next.seam.minZ-1);
      assert.ok(next.seam.maximumRouteGradeTenths<=5);
      assert.ok(next.definition.surfaceTiles.length<=1024);
      assert.ok(next.definition.runs.every(run=>run.z<route.footprint.minZ));
      assert.ok(next.definition.surfaceTiles.every(tile=>tile.z<route.footprint.minZ));
      const expected=generateWorldSite(createWorldSiteRecipe({...entry.recipe,
        regionId:ids[i],siteId:'preview-'+ids[i]}));
      assert.equal(next.site.hash,expected.hash);
      assert.deepEqual(next.definition.runs.filter(r=>r.z<=next.site.maxZ),
        expected.definition.runs.map(r=>({...r,z:r.z+next.site.offsetZ})));
      assert.deepEqual(next.definition.surfaceTiles.filter(t=>t.z<=next.site.maxZ),
        expected.definition.surfaceTiles.map(t=>({...t,z:t.z+next.site.offsetZ})));
      const previous=route;
      route=activateConnectedHuntContinuation(route,next);
      assert.equal(route.seams.length,i);
      assert.deepEqual(route.sites.slice(0,-1),previous.sites);
      assert.equal(route.definition,previous.definition,
        'the route prefix must not concatenate a dense new terrain definition');
      for(const seam of route.seams)
        assert.equal(connectedHuntLocation(route,seam.minZ+.5),'connection');
      assert.equal(connectedHuntLocation(route,next.site.minZ+.5),ids[i]);
      assert.throws(()=>activateConnectedHuntContinuation(route,next),/Invalid Hunt continuation/);
    }
    assert.deepEqual(route.sites.map(s=>s.id),ids);
    assert.equal(route.footprint.maxZ-route.footprint.minZ+1,232);
    assert.equal(generateConnectedHuntContinuation(entry,route),null);
  }
});
