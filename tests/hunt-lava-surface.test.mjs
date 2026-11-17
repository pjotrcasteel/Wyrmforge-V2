import test from 'node:test';
import assert from 'node:assert/strict';
import {huntLavaSurface} from '../src/hunt-lava-surface.mjs';
import {generateWorldSite} from '../src/world-generation/index.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';

test('volcanic Hunt channels shade only the exposed physical fissure floors',()=>{
  for(const kind of ['scorched-approach','mini-boss-arena','wyrm-lair']){
    for(const seed of [7,19,42]){
      const site=generateWorldSite(createWorldSiteRecipe({kind,seed,corruption:1}));
      const {layout,definition}=site;
      const lava=huntLavaSurface(layout);
      assert.ok(lava.count>0);
      assert.deepEqual(huntLavaSurface(layout),lava);
      assert.ok(lava.data.byteLength<=16*1024);
      const [minX,minZ]=lava.origin;
      const [width,height]=lava.size;
      const authored=new Map(layout.volcanicTerrain.physicalFissures.flatMap(fissure=>
        fissure.floor.map(({x,y,z})=>[z+','+x,y])));
      const loader=new V2ExternalTerrainLoader(definition,{microSurfaceCapacity:2048});
      while(!loader.progress.done)loader.loadStep(192);
      const {world}=loader.terrain;
      for(let row=0;row<height;row++)for(let col=0;col<width;col++){
        const offset=(row*width+col)*4;
        if(!lava.data[offset+3])continue;
        const x=col+minX,z=row+minZ,y=lava.data[offset];
        assert.equal(y,authored.get(z+','+x));
        assert.equal(world.get(x,y-1,z),3);
        assert.equal(world.get(x,y,z),0);
      }
      loader.unload();
    }
  }
});

test('dry terrain has no lava and an east-facing descending channel flows east',()=>{
  assert.equal(huntLavaSurface({}),null);
  const layout={footprint:{minX:0,maxX:1,minZ:0,maxZ:0},volcanicTerrain:{physicalFissures:[{
    from:{x:0,z:0},to:{x:1,z:0},floor:[{x:0,z:0,y:5},{x:1,z:0,y:2}]
  }]}};
  const {data}=huntLavaSurface(layout);
  assert.deepEqual([...data],[5,128,13,255,2,128,14,255]);
  layout.volcanicTerrain.physicalFissures[0].floor[1].y=8;
  assert.equal(huntLavaSurface(layout).data[1],0);
});
