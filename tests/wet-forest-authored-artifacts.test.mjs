import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph}
  from '../src/world-generation/index.mjs';

function scene(seed=7,regionId='starter-region',huntRole=undefined){
  return generateWorldSite(createWorldSiteRecipe({
    regionId,siteId:'visual-forest-'+regionId,
    encounterId:'preview-001',kind:'wet-forest',
    seed,chunkEdge:32,corruption:0,...(huntRole?{huntRole}: {})
  }));
}
function topColumns(result){
  const grid=new Map();
  for(const run of result.definition.runs)for(let x=run.x;x<run.x+run.length;x++){
    const key=x+','+run.z;
    if(run.y>(grid.get(key)??-Infinity))grid.set(key,run.y);
  }
  return grid;
}
function extrema(columns,filter){
  const values=[];
  for(const [key,y] of columns){
    const [x,z]=key.split(',').map(Number);
    if(filter(x,z))values.push(y);
  }
  assert.ok(values.length>=10,'Need a real physical region footprint');
  return {min:Math.min(...values),max:Math.max(...values)};
}
test('actual seed-7 entry loses abrupt brown eastern 8m shelf and western 4.6m square fissure',()=>{
  for(const seed of [7,19,101]){
    const site=scene(seed);
    const heights=topColumns(site);
    const east=extrema(heights,(x,z)=>x>=7&&x<=13&&z>=-14&&z<=-4);
    const west=extrema(heights,(x,z)=>x>=-10&&x<=-6&&z>=-18&&z<=-11);
    assert.ok(east.max<=8,
      'Actual authored Hunt entry retains a huge brown eastern cliff: '+
      seed+' '+JSON.stringify(east));
    assert.ok(west.min>=1,
      'Actual authored Hunt entry contains a multi-metre dark square pit: '+
      seed+' '+JSON.stringify(west));
    assert.equal(site.layout.topology.reachable,true);
    assert.ok(site.layout.microSurface.tileCount>0);
    assert.ok(site.layout.roadGrades.maximumGradeTenths<=5);
  }
});
test('woodland trail does not deepen lower forest toes into artificial two-metre walls',()=>{
  const seed=7;
  const trail=scene(seed,'region-woodland-trail','exploration');
  const reference=scene(seed,'reference-forest-role','exploration');
  const a=topColumns(trail),b=topColumns(reference);
  let artificialToes=0;
  // The special woodland median pass can gently alter one cell; it must not
  // create a new deep hole relative to the same natural, graded forest role.
  for(let z=4;z<=12;z++)for(let x=-12;x<=12;x++){
    const key=x+','+z;
    if((a.get(key)??-999)<(b.get(key)??-999)-1)artificialToes++;
  }
  assert.equal(artificialToes,0,'Woodland consolidation created deep cutouts');
  assert.equal(trail.layout.topology.reachable,true);
  assert.ok(trail.layout.microSurface.tileCount<=384);
});
test('actual 11-site Hunt graph uses the repaired WorldGen site, not experimental expedition terrain',()=>{
  const entry=scene(7,'starter-region');
  const graph=generateAuthoredHuntTerrainGraph(entry);
  const trail=graph.region('region-woodland-trail');
  assert.ok(trail,'The real streaming graph must contain woodland trail');
  const expected=generateWorldSite(createWorldSiteRecipe({
    ...entry.recipe,regionId:'region-woodland-trail',
    siteId:'preview-region-woodland-trail',huntRole:'exploration'
  }));
  assert.equal(trail.sourceHash,expected.hash,
    'Play Hunt streaming must receive the repaired authored forest');
  assert.equal(graph.region(graph.layout.entryRegionId).sourceHash,entry.hash);
});
