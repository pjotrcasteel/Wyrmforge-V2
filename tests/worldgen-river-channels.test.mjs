import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorldSite} from '../src/world-generation/index.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {huntLavaSurface} from '../src/hunt-lava-surface.mjs';

const key=(x,z)=>x+','+z;

test('river destinations have one connected downhill course and physical rock beds',()=>{
  for(const kind of ['wet-forest','forest-highland','mountain-pass','scorched-approach','mini-boss-arena','wyrm-lair']){
    const river=['scorched-approach','mini-boss-arena','wyrm-lair'].includes(kind)?'lava':'water';
    for(const seed of [7,19,42]){
      const recipe=createWorldSiteRecipe({kind,seed,river,corruption:river==='lava'?1:0});
      const site=generateWorldSite(recipe);
      assert.equal(generateWorldSite(recipe).hash,site.hash);
      const [channel]=site.layout.riverChannels;
      assert.ok(channel.nodes.length>=30,kind+' has a substantial continuous course');
      assert.ok(channel.floor.length>channel.nodes.length*2);
      const floor=new Map(channel.floor.map(cell=>[key(cell.x,cell.z),cell]));
      const seen=new Set([floor.keys().next().value]);
      const queue=[floor.get([...seen][0])];
      for(let i=0;i<queue.length;i++){
        const cell=queue[i];
        for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){
          const id=key(cell.x+dx,cell.z+dz);
          if(floor.has(id)&&!seen.has(id)){
            seen.add(id);
            queue.push(floor.get(id));
          }
        }
      }
      assert.equal(seen.size,floor.size,'banks remain connected to the river');
      for(let i=0;i<channel.nodes.length;i++){
        const node=channel.nodes[i],previous=channel.nodes[Math.max(0,i-1)];
        assert.ok(node.y<=previous.y,'the course never flows uphill');
        assert.equal(floor.get(key(node.x,node.z)).y,node.y);
        if(i)assert.equal(Math.abs(node.x-previous.x)+Math.abs(node.z-previous.z),1);
      }
      assert.ok(site.layout.topology.reachable);
      assert.ok(site.layout.escapeAudit.ready);
      const loader=new V2ExternalTerrainLoader(site.definition,{microSurfaceCapacity:2048});
      while(!loader.progress.done)loader.loadStep(192);
      const {world}=loader.terrain;
      const surface=huntLavaSurface(site.layout);
      assert.equal(surface.count,floor.size);
      assert.ok(surface.data.byteLength<=16384);
      for(const {x,y,z} of channel.floor){
        assert.equal(world.get(x,y-1,z),3);
        assert.equal(world.get(x,y,z),0);
        assert.equal(world.microSurfaceTile(x,y-1,z),null);
        const offset=((z-surface.origin[1])*surface.size[0]+x-surface.origin[0])*4;
        assert.equal(surface.data[offset+3],river==='water'?128:255);
      }
      loader.unload();
    }
  }
});

test('river recipe survives serialization and rejects unknown contents',()=>{
  const recipe=createWorldSiteRecipe({river:'water'});
  const restored=createWorldSiteRecipe(JSON.parse(JSON.stringify(recipe)));
  assert.deepEqual(restored,recipe);
  assert.throws(()=>createWorldSiteRecipe({river:'oil'}),RangeError);
  assert.equal(createWorldSiteRecipe().river,undefined);
});
