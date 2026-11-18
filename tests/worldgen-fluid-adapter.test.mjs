import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {TerrainEditLedger} from '../src/terrain-edit-ledger.mjs';
import {V2TerrainPort} from '../src/terrain-integration-port.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite} from '../src/world-generation/index.mjs';
import {
  WORLDGEN_FLUID_SCHEMA,DEFAULT_CHANNEL_DEPTH_UNITS,createWorldGenFluidEngine,
  createFluidTerrainFloorQuery,attachWorldGenFluid
} from '../src/fluid/worldgen-fluid-adapter.mjs';

function synthetic(){
  const world=new VoxelWorld();
  for(let z=0;z<6;z++)for(let x=0;x<7;x++){
    const primaryCrater=x>=3&&x<=5&&z>=3&&z<=4;
    const sealedCrater=x===0&&z===5;
    const top=z===1?0:primaryCrater||sealedCrater?-2:2;
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
      assert.equal(DEFAULT_CHANNEL_DEPTH_UNITS,4);
      assert.equal(result.channelDepthUnits,4);
      assert.equal(result.fluid.totalDepth,channel.floor.length*4);
      assert.ok(result.fluid.snapshot().sources.every(source=>
        source.surfaceDeci===result.fluid.snapshot().floors[source.index]*10+4),
        'water/lava inflow stays at 40cm rather than refilling to 1 metre');
      assert.ok(result.fluid.snapshot().outlets.every(outlet=>
        outlet.surfaceDeci===result.fluid.snapshot().floors[outlet.index]*10+4));
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
  assert.equal(fluid.sample(0,5).depth,0,'unconnected crater remains dry');
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

test('shallow default river stays below an unbroken grass bank, but a cut bank can flood',()=>{
  const tops=(x,z)=>z===1?0:1;
  const layout={
    footprint:{minX:0,maxX:6,minZ:0,maxZ:4,minY:-1,maxY:3},
    riverChannels:[{
      kind:'water',
      floor:Array.from({length:7},(_,x)=>({x,z:1,y:0})),
      nodes:Array.from({length:7},(_,x)=>({x,z:1,y:0})),
      from:{x:0,z:1},to:{x:6,z:1}
    }]
  };
  const terrain={materialAt:(x,y,z)=>y<tops(x,z)?3:0};
  const {fluid}=createWorldGenFluidEngine(layout,terrain);
  assert.equal(fluid.sample(3,1).surfaceY,.4);
  const originalTotal=fluid.totalDepth;
  assert.equal(originalTotal,7*4);
  for(let i=0;i<200;i++){
    const result=fluid.step({budget:28});
    assert.ok(result.processed<=28);
  }
  assert.equal(fluid.sample(3,0).depth,0);
  assert.equal(fluid.sample(3,2).depth,0,
    'uncut grass banks must not disappear beneath an overfull river');
  const snapshot=fluid.snapshot();
  assert.ok(snapshot.sources.every(source=>
    source.surfaceDeci-snapshot.floors[source.index]*10===4));
  assert.ok(snapshot.outlets.every(outlet=>
    outlet.surfaceDeci-snapshot.floors[outlet.index]*10===4));
});

test('channel depth override remains bounded and inlet/outlet targets follow its 10cm steps',()=>{
  const tops=(_x,z)=>z===1?0:1;
  const layout={
    footprint:{minX:0,maxX:4,minZ:0,maxZ:2,minY:-1,maxY:3},
    riverChannels:[{
      kind:'water',
      floor:Array.from({length:5},(_,x)=>({x,z:1,y:0})),
      nodes:Array.from({length:5},(_,x)=>({x,z:1,y:0})),
      from:{x:0,z:1},to:{x:4,z:1}
    }]
  };
  const terrain={materialAt:(x,y,z)=>y<tops(x,z)?3:0};
  const {fluid}=createWorldGenFluidEngine(layout,terrain,{initialDepth:7});
  assert.equal(fluid.totalDepth,35);
  assert.ok(fluid.snapshot().sources.every(source=>source.surfaceDeci===7));
  assert.ok(fluid.snapshot().outlets.every(outlet=>outlet.surfaceDeci===7));
});
