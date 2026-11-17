import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {
  ColumnFluidEngine,FLUID_STATE_SCHEMA,MAX_FLUID_COLUMNS
} from '../src/fluid/column-fluid-engine.mjs';

const BOUNDS={minX:0,maxX:8,minZ:0,maxZ:8};

function fixture(kind='water'){
  const world=new VoxelWorld();
  const heights=new Map();
  for(let z=0;z<=8;z++)for(let x=0;x<=8;x++){
    let floor=3;
    if(z===2||z===3)floor=0;
    if(x>=4&&x<=6&&(z===5||z===6))floor=-2;
    heights.set(x+','+z,floor);
    for(let y=-4;y<floor;y++)world.set(x,y,z,3);
  }
  const floorAt=(x,z)=>{
    for(let y=3;y>=-4;y--)if(world.get(x,y,z))return y+1;
    return -4;
  };
  const initial=[];
  for(let z=2;z<=3;z++)for(let x=0;x<=8;x++)initial.push({x,z,depth:10});
  const sources=[
    {x:0,z:2,surfaceY:1,rate:3},
    {x:0,z:3,surfaceY:1,rate:3}
  ];
  const engine=new ColumnFluidEngine({bounds:BOUNDS,floorAt,initial,sources,kind});
  return {world,engine,floorAt,initial,sources};
}

function tick(engine,n=1,budget=81){
  for(let i=0;i<n;i++)engine.step({budget});
}

test('separate water authority cannot flow through an intact bank',()=>{
  const {engine,world}=fixture();
  const before=world.revision;
  tick(engine,100);
  assert.equal(engine.sample(5,4).depth,0);
  assert.equal(engine.sample(5,5).depth,0);
  assert.equal(engine.sample(5,6).depth,0);
  assert.equal(engine.sample(5,4).floorY,3);
  assert.equal(world.revision,before,'fluid never mutates Voxel authority');
  assert.equal(engine.sample(-1,0),null);
});

test('a real physical bank breach progressively wets its connected crater',()=>{
  const {engine,world}=fixture();
  for(let y=-2;y<3;y++)world.set(5,y,4,0);
  assert.equal(engine.sample(5,4).floorY,3,'terrain edit must be published');
  assert.equal(engine.onTerrainChange({
    geometryChanged:true,
    changedBounds:{min:{x:5,y:-2,z:4},max:{x:5,y:2,z:4}}
  }),1);
  assert.equal(engine.sample(5,4).floorY,-2);
  tick(engine,2);
  const early=engine.sample(5,4).depth;
  assert.ok(early>0,'broken bank opens the path');
  tick(engine,80);
  assert.ok(engine.sample(5,5).depth>0,'new crater must receive water');
  assert.ok(engine.sample(5,6).depth>0,'water spreads into the crater');
  assert.ok(engine.sample(5,5).surfaceY>-2);
  assert.equal(engine.sample(2,5).depth,0,'neighboring intact bank remains dry');
});

test('water transfers are conservative without sources and lava moves slower',()=>{
  const config={
    bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
    floorAt:()=>0,initial:[{x:0,z:0,depth:80}]
  };
  const water=new ColumnFluidEngine({...config,kind:'water'});
  const lava=new ColumnFluidEngine({...config,kind:'lava'});
  const first=water.step({budget:2});
  lava.step({budget:2});
  assert.equal(first.injected,0);
  assert.equal(water.totalDepth,80);
  assert.equal(lava.totalDepth,80);
  assert.ok(water.sample(1,0).depth>lava.sample(1,0).depth);
  assert.equal(water.kind,'water');
  assert.equal(lava.kind,'lava');
});

test('fixed processing budgets are respected and deterministic across replay',()=>{
  const a=fixture().engine,b=fixture().engine;
  for(let i=0;i<15;i++){
    assert.ok(a.step({budget:7}).processed<=7);
    b.step({budget:7});
  }
  assert.deepEqual(a.snapshot(),b.snapshot());
  const saved=JSON.parse(JSON.stringify(a.snapshot()));
  const c=fixture().engine;
  c.restore(saved);
  tick(a,30,11);
  tick(c,30,11);
  assert.deepEqual(a.snapshot(),c.snapshot());
  assert.equal(c.snapshot().schema,FLUID_STATE_SCHEMA);
});

test('terrain replay must precede fluid snapshot restoration',()=>{
  const {world,engine,floorAt,initial,sources}=fixture();
  tick(engine,25);
  const before=engine.snapshot();
  for(let y=-2;y<3;y++)world.set(5,y,4,0);
  const afterTerrain=new ColumnFluidEngine({bounds:BOUNDS,floorAt,initial,sources});
  assert.throws(()=>afterTerrain.restore(before),/same replayed physical terrain/);
  engine.onTerrainChange({
    geometryChanged:true,
    changedBounds:{min:{x:5,z:4},max:{x:5,z:4}}
  });
  tick(engine,15);
  const after=engine.snapshot();
  afterTerrain.restore(after);
  assert.deepEqual(afterTerrain.snapshot(),after);
  assert.equal(engine.onTerrainChange({geometryChanged:false}),0);
});

test('region, source and per-frame work are bounded',()=>{
  assert.equal(MAX_FLUID_COLUMNS,4096);
  assert.throws(()=>new ColumnFluidEngine({
    bounds:{minX:0,maxX:100,minZ:0,maxZ:100},floorAt:()=>0
  }),/column budget/);
  assert.throws(()=>new ColumnFluidEngine({
    bounds:{minX:0,maxX:0,minZ:0,maxZ:0},floorAt:()=>0,
    initial:[{x:0,z:0,depth:-1}]
  }),/Invalid initial fluid depth/);
  assert.throws(()=>new ColumnFluidEngine({
    bounds:{minX:0,maxX:0,minZ:0,maxZ:0},floorAt:()=>0,
    sources:[{x:0,z:0,surfaceY:1,rate:99}]
  }),/source rate/);
  assert.throws(()=>fixture().engine.step({budget:4097}),/budget/);
});
