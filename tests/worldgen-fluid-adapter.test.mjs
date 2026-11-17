import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {TerrainEditLedger} from '../src/terrain-edit-ledger.mjs';
import {V2TerrainPort} from '../src/terrain-integration-port.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite} from '../src/world-generation/index.mjs';
import {
  WORLDGEN_FLUID_SCHEMA,createWorldGenFluidEngine,
  createFluidTerrainFloorQuery,attachWorldGenFluid
} from '../src/fluid/worldgen-fluid-adapter.mjs';

function synthetic(){
  const world=new VoxelWorld();
  for(let z=0;z<6;z++)for(let x=0;x<7;x++){
    const top=z===1?0:z>=3&&z<=4?-2:2;
    for(let y=-4;y<top;y++)world.set(x,y,z,y===-4?4:3);
  }
  const ledger=new TerrainEditLedger(world);
  const port=new V2TerrainPort(world,ledger);
  const layout={
    footprint:{minX:0,maxX:6,minZ:0,maxZ:5,minY:-4,maxY:3},
    riverChannels:[{
      kind:'water',
      floor:Array.from({length:7},(_,x)=>({x,z:1,y:0})),
      from:{x:0,z:1},to:{x:6,z:1},
      nodes:Array.from({length:7},(_,x)=>({x,y:0,z:1}))
    }]
  };
  return {world,port,layout};
}

test('WorldGen water and volcanic channels seed the real authoritative floor',()=>{
  for(const [kind,fluidKind] of [['wet-forest','water'],['wyrm-lair','lava']]){
    const site=generateWorldSite(createWorldSiteRecipe({
      kind,seed:7,river:fluidKind,corruption:fluidKind==='lava'?1:0
    }));
    const loader=new V2ExternalTerrainLoader(site.definition,{microSurfaceCapacity:2048});
    while(!loader.progress.done)loader.loadStep(192);
    try{
      const {port,world}=loader.terrain;
      const result=createWorldGenFluidEngine(site.layout,port);
      const channel=site.layout.riverChannels[0];
      assert.equal(result.schema,WORLDGEN_FLUID_SCHEMA);
      assert.equal(result.fluid.kind,fluidKind);
      assert.equal(result.channelCellCount,channel.floor.length);
      assert.equal(result.fluid.wetCount,channel.floor.length);
      assert.equal(result.fluid.totalDepth,channel.floor.length*10);
      assert.equal(result.source.x,channel.nodes[0].x);
      assert.equal(result.source.z,channel.nodes[0].z);
      for(const cell of channel.floor){
        assert.equal(result.fluid.sample(cell.x,cell.z).floorY,cell.y);
        assert.equal(world.get(cell.x,cell.y,cell.z),0);
      }
      const before=world.revision;
      for(let i=0;i<5;i++)result.fluid.step({budget:128});
      assert.equal(world.revision,before,'Water V2 may not edit Voxel occupancy');
    }finally{
      loader.unload();
    }
  }
});

test('a real Voxel terrain-change event opens a water route into a crater',()=>{
  const {world,port,layout}=synthetic();
  const {fluid}=createWorldGenFluidEngine(layout,port);
  const unsubscribe=attachWorldGenFluid(port,fluid);
  for(let i=0;i<10;i++)fluid.step({budget:42});
  assert.equal(fluid.sample(3,2).depth,0,'bank starts dry');
  assert.equal(fluid.sample(3,3).depth,0,'enclosed crater starts dry');
  const beforeRevision=world.revision;
  const edit={id:'water-bank-fireball',type:'carve-sphere',x:3,y:1,z:2,radius:1.6};
  const changed=port.apply(edit);
  assert.equal(changed.status,'accepted');
  assert.ok(changed.removedVoxels>0);
  assert.ok(world.revision>beforeRevision);
  assert.equal(fluid.sample(3,2).floorY,0,'committed edit reaches fluids synchronously');
  for(let i=0;i<100;i++)fluid.step({budget:42});
  assert.equal(fluid.sample(3,2).floorY,0,'breach remains physically open');
  assert.ok(fluid.sample(3,3).depth>0,'crater fills across the open bank');
  assert.equal(fluid.sample(0,3).depth,0,'unconnected crater remains dry');
  assert.equal(port.metrics().listenerFailures,0);
  const snap=JSON.parse(JSON.stringify(fluid.snapshot()));
  const other=synthetic();
  const replay=other.port.apply(edit);
  assert.equal(replay.status,'accepted');
  const recreated=createWorldGenFluidEngine(other.layout,other.port).fluid;
  recreated.restore(snap);
  assert.deepEqual(recreated.snapshot(),snap,'terrain replay followed by fluid replay is exact');
  unsubscribe();
  assert.equal(port.metrics().subscribers,0);
  port.apply({id:'later-carve',type:'carve-sphere',x:3,y:1,z:0,radius:.9});
  assert.deepEqual(fluid.snapshot(),snap,'a disposed fluid region receives no old events');
  port.dispose();
  other.port.dispose();
});

test('WorldGen adapter rejects unsupported channels and invalid terrain contracts',()=>{
  const {port,layout}=synthetic();
  assert.throws(()=>createWorldGenFluidEngine({...layout,riverChannels:[]},port),/channel/);
  assert.throws(()=>createWorldGenFluidEngine(layout,{materialAt:()=>0},{
    initialDepth:11
  }),/water-seeding/);
  assert.throws(()=>createWorldGenFluidEngine({
    ...layout,footprint:{...layout.footprint,maxX:999}
  },port),/footprint/);
  assert.throws(()=>createFluidTerrainFloorQuery(layout.footprint,{}),/materialAt/);
  assert.throws(()=>attachWorldGenFluid(port,{}),/Water V2/);
  port.dispose();
});
