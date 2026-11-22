import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateConnectedHuntStart,generateConnectedHuntContinuation,
  activateConnectedHuntContinuation} from '../src/world-generation/index.mjs';
import {createHuntExpeditionRecipe,composeHuntExpeditionPlan} from '../src/world-generation/hunt-expedition-plan.mjs';
import {composeAuthoredHuntLayout} from '../src/world-generation/authored-hunt-layout.mjs';

const intersects=(a,b)=>a.minX<=b.maxX&&b.minX<=a.maxX&&a.minZ<=b.maxZ&&b.minZ<=a.maxZ;

test('Hunt coordinate contract preserves all branches, site roles and opportunities',()=>{
  for(const seed of [7,8])for(const scope of ['standard','extended']){
    const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',seed,
      regionId:'starter-region',siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:32}));
    const plan=composeHuntExpeditionPlan(createHuntExpeditionRecipe({
      journeyId:'fire-tier-one',huntId:'preview-expedition',kind:'wet-forest',seed,chunkEdge:32,scope
    }));
    const layout=composeAuthoredHuntLayout(plan,site);
    assert.deepEqual(layout,composeAuthoredHuntLayout(plan,site));
    assert.equal(layout.regions.length,scope==='standard'?11:14);
    assert.equal(layout.links.length,plan.links.length);
    assert.equal(layout.physicalTraversalVerified,false);
    for(const region of layout.regions){
      const original=plan.regions.find(r=>r.id===region.id);
      assert.equal(region.role,original.role);
      assert.equal(region.biome,original.biome);
      assert.deepEqual(region.opportunities.map(x=>x.id),original.opportunities.map(x=>x.id));
      assert.deepEqual(region.ports.map(x=>x.peerRegionId),original.ports.map(x=>x.peerRegionId));
      for(const other of layout.regions)
        if(region!==other)assert.equal(intersects(region.bounds,other.bounds),false);
    }
    for(const link of layout.links)for(const region of layout.regions)
      assert.equal(intersects(link.bounds,region.bounds),false);
    for(const link of layout.links)for(const other of layout.links)
      if(link!==other)assert.equal(intersects(link.bounds,other.bounds),false);
    if(scope==='standard'){
      let route=generateConnectedHuntStart(site);
      for(let next=generateConnectedHuntContinuation(site,route);next;
          next=generateConnectedHuntContinuation(site,route)){
        route=activateConnectedHuntContinuation(route,next);
      }
      assert.equal(route.planHash,layout.planHash);
      for(const segment of route.sites){
        const region=layout.regions.find(r=>r.id===segment.id);
        assert.equal(region.offsetZ,segment.offsetZ);
        assert.equal(region.bounds.minZ,segment.minZ);
        assert.equal(region.bounds.maxZ,segment.maxZ);
      }
    }
  }
});
