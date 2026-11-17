import test from 'node:test';
import assert from 'node:assert/strict';
import {composeCliffSlabRecesses} from '../src/world-generation/cliff-slab-grammar.mjs';
import {generateWorldSite} from '../src/world-generation/index.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';

function wall({riverChannel=null}={}) {
  const radius=16,heights=new Int16Array(1024),surfaces=new Uint8Array(1024).fill(3);
  for(let z=-16;z<16;z++)for(let x=-16;x<16;x++)heights[(z+16)*32+x+16]=z<0?10:2;
  const plan={recipe:{kind:'wyrm-lair',radius,seed:7},routes:[],escapeRoutes:[],flowLinks:[],combatSpaces:[],clearings:[],maneuverPockets:[],approaches:[],landmarks:[]};
  return composeCliffSlabRecesses({plan,heights,surfaces,riverChannel});
}

test('slab recesses remove side occupancy beneath an intact crest and above the foot',()=>{
  const cuts=wall();
  assert.ok(cuts.size>10);
  for(const key of cuts) {
    const [x,y,z]=key.split(',').map(Number);
    assert.ok(z===-1||z===-2);
    assert.ok(y>2&&y<9,'the crest and continuous stone foundation remain');
    assert.ok(Math.abs(x)<16);
  }
  assert.deepEqual(cuts,wall());
  const protectedCuts=wall({riverChannel:{floor:[{x:0,z:-1,y:3}]}});
  assert.ok([...protectedCuts].every(key=>Math.abs(Number(key.split(',')[0]))>2));
});

test('actual generated cliff shelves contain real recessed air below solid rock',()=>{
  for(const seed of [7,19]) {
    const generated=generateWorldSite(createWorldSiteRecipe({kind:'wyrm-lair',seed,corruption:1,river:'lava'}));
    const loader=new V2ExternalTerrainLoader(generated.definition);
    try {
      while(!loader.progress.done)loader.loadStep(4096);
      const world=loader.terrain.world;
      let recesses=0;
      for(let z=-31;z<31;z++)for(let x=-31;x<31;x++)for(let y=1;y<25;y++) {
        if(world.get(x,y,z)===0&&world.get(x,y+1,z)===3&&world.get(x,y-1,z)===3)recesses++;
        else if(world.get(x,y,z)===0&&world.get(x,y+2,z)===3&&world.get(x,y-1,z)===3)recesses++;
      }
      assert.ok(recesses>0,'recesses must exist in voxel occupancy, not just the shader');
      assert.equal(generated.layout.topology.reachable,true);
    } finally {loader.unload();}
  }
});
