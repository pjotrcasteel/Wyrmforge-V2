import test from 'node:test';
import assert from 'node:assert/strict';
import {huntLavaSurface,HUNT_CHANNEL_HEIGHT_OFFSET} from '../src/hunt-lava-surface.mjs';
import {generateWorldSite} from '../src/world-generation/index.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {VoxelWorld} from '../src/voxel-world.mjs';
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
        const x=col+minX,z=row+minZ,y=lava.data[offset]-HUNT_CHANNEL_HEIGHT_OFFSET;
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
  assert.deepEqual([...data],[13,128,13,255,10,128,14,255]);
  layout.volcanicTerrain.physicalFissures[0].floor[1].y=8;
  assert.equal(huntLavaSurface(layout).data[1],0);
});


test('a damaged channel follows the exposed stone and retains signed foundation heights',()=>{
  const layout={
    footprint:{minX:0,maxX:2,minZ:0,maxZ:0,minY:-3},
    riverChannels:[{kind:'water',from:{x:0,z:0},to:{x:2,z:0},
      floor:[0,1,2].map(x=>({x,z:0,y:5,flowX:1,flowZ:0}))}]
  };
  const world=new VoxelWorld();
  for(let x=0;x<3;x++){
    world.set(x,-3,0,4);
    for(let y=-2;y<5;y++)world.set(x,y,0,3);
  }
  const initial=huntLavaSurface(layout,world);
  const height=surface=>surface.data[4]-HUNT_CHANNEL_HEIGHT_OFFSET;
  assert.equal(height(initial),5);
  world.set(1,4,0,0);
  const cut=huntLavaSurface(layout,world);
  assert.equal(height(cut),4);
  assert.equal(cut.count,3);
  assert.equal(height(initial),5,'published surface descriptors remain immutable');
  for(let y=-2;y<4;y++)world.set(1,y,0,0);
  const deep=huntLavaSurface(layout,world);
  assert.equal(height(deep),-2);
  assert.equal(world.get(1,-3,0),4,'surfacing preserves the physical foundation');
  assert.equal(deep.data[7],128);
});
