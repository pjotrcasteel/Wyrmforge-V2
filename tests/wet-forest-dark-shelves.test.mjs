import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHuntExpeditionRecipe,composeHuntExpeditionPlan
} from '../src/world-generation/hunt-expedition-plan.mjs';
import {generateWorldExpeditionRegion} from '../src/world-generation/index.mjs';

// Read authoritative run-length Voxel definitions: this is an actual terrain
// geometry test, not an appearance/color or fake height preview.
function expedition(seed,kind='wet-forest'){
  return composeHuntExpeditionPlan(createHuntExpeditionRecipe({
    journeyId:'fire-tier-one',huntId:'hunt-forest-01',chapter:0,
    kind,seed,worldRevision:3,scope:'standard',
    storyBeats:[
      {id:'find-scorched-markings',type:'investigation'},
      {id:'trace-the-fire-magic',type:'revelation'},
      {id:'survive-the-crossing',type:'confrontation'}
    ]
  }));
}
function heightMap(generated){
  const tops=new Map();
  for(const run of generated.definition.runs){
    for(let x=run.x;x<run.x+run.length;x++){
      const key=x+','+run.z;
      tops.set(key,Math.max(run.y,tops.get(key)??-Infinity));
    }
  }
  return tops;
}

test('seed-7 Wet Forest arrival, trail and combat lands have no 2m dark rectangular soil pits',()=>{
  for(const seed of [7,19,77,101]){
    const plan=expedition(seed);
    for(const region of plan.regions){
      const generated=generateWorldExpeditionRegion(plan,region.id);
      const heights=heightMap(generated);
      let changes=0;
      for(const [key,y] of heights){
        const [x,z]=key.split(',').map(Number);
        assert.ok(y>=5&&y<=7,
          'Wet Forest '+seed+'/'+region.id+' '+key+' must be grass-scale relief, got '+y);
        for(const [dx,dz] of [[1,0],[0,1]]){
          const adjacent=heights.get((x+dx)+','+(z+dz));
          if(adjacent===undefined)continue;
          assert.ok(Math.abs(y-adjacent)<=1,
            'Wet Forest '+seed+'/'+region.id+' has a tall exposed soil wall at '+key);
          if(y!==adjacent)changes++;
        }
      }
      assert.equal(generated.layout.physicalRoutePortsReady,true);
      assert.ok(heights.size>500);
    }
  }
});
test('forest landforms retain real grass, dirt paths, 7m port floors and natural elevation variety',()=>{
  const plan=expedition(7);
  const elevations=new Set(),materials=new Set();
  for(const region of plan.regions){
    const scene=generateWorldExpeditionRegion(plan,region.id);
    const heights=heightMap(scene);
    for(const value of heights.values())elevations.add(value);
    for(const run of scene.definition.runs)materials.add(run.material);
    for(const port of region.ports){
      const side=port.direction==='north'||port.direction==='south'?'x':'z';
      for(let offset=-3;offset<=3;offset++){
        const x=port.at.x+(side==='x'?offset:0);
        const z=port.at.z+(side==='z'?offset:0);
        assert.equal(heights.get(x+','+z),6,'7m expedition port must remain flush');
      }
    }
  }
  assert.deepEqual([...elevations].sort((a,b)=>a-b),[5,6,7],
    'Calm forest still needs authored physical small hills and hollows');
  assert.ok(materials.has(1)&&materials.has(2)&&materials.has(3));
});
test('mountain landforms retain multi-metre cliffs; forest cleanup stays biome-owned',()=>{
  const plan=expedition(27,'mountain-pass');
  const region=plan.regions.find(r=>r.id===plan.entryRegionId);
  const heights=[...heightMap(generateWorldExpeditionRegion(plan,region.id)).values()];
  assert.ok(Math.max(...heights)-Math.min(...heights)>=3,
    'A forest-only visual cleanup must not flatten authored mountains');
});
