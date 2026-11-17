import test from 'node:test';
import assert from 'node:assert/strict';
import {huntRoutePreview,spawnHuntRoutePreview} from '../src/hunt-route-preview.mjs';
import {generateWorldSite} from '../src/world-generation/index.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {stepHuntExplorer} from '../src/hunt-play-runtime.mjs';

for(const [route,count,start] of [['forest',3,'wet-forest'],['mountain',4,'mountain-pass'],['highland',10,'wet-forest']]){
  test(`Play Hunt ${route} route loads all ${count} destinations on physical terrain`,()=>{
    const preview=huntRoutePreview(route,Infinity);
    assert.equal(preview.index,0);
    assert.equal(preview.stops.length,count);
    assert.equal(preview.stop.kind,start);
    assert.equal(preview.stop.profile.corruption.progress,0);
    const last=huntRoutePreview(route,count-1).stop;
    assert.equal(last.kind,'wyrm-lair');
    assert.equal(last.profile.corruption.progress,1);
    let previous=-1;
    for(const stop of preview.stops){
      const corruption=stop.profile.corruption.progress;
      assert.ok(corruption>previous);
      previous=corruption;
      const site=generateWorldSite(createWorldSiteRecipe({kind:stop.kind,corruption,river:stop.river}));
      assert.ok(site.layout.topology.reachable);
      assert.equal(site.layout.riverChannels[0].kind,stop.river);
      assert.ok(site.layout.microSurface.tileCount>0);
      const loader=new V2ExternalTerrainLoader(site.definition,{microSurfaceCapacity:2048});
      while(!loader.progress.done)loader.loadStep(192);
      const {world}=loader.terrain;
      const bounds=site.layout.footprint;
      let actor=spawnHuntRoutePreview(world,site.layout);
      const z=actor.z;
      for(let i=0;i<30;i++)actor=stepHuntExplorer(world,actor,bounds,{moveZ:-1});
      assert.ok(!actor.error&&actor.z<z,`Wizard can walk from the ${stop.kind} entry`);
      loader.unload();
    }
  });
}

test('the long route uses authored highlands before the mountain pass',()=>{
  const {stops}=huntRoutePreview('highland',0);
  assert.equal(stops[3].kind,'forest-highland');
  assert.equal(stops[5].kind,'mountain-pass');
  assert.equal(stops[7].kind,'scorched-approach');
  assert.equal(huntRoutePreview(null,0),null);
  assert.equal(huntRoutePreview('constructor',0),null);
});
