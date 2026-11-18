// WAT-01: opening a riverbank in a large mobile-sized column footprint
// must wake the true hydraulic connection, not spawn decorative water.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';

function river(){
  const altered=new Map();
  const lanes=[29,30,31,32];
  const floorAt=(x,z)=>altered.get(x+','+z)??(lanes.includes(x)?0:1);
  const initial=[],currents=[];
  for(let z=0;z<64;z++)for(const x of lanes){
    initial.push({x,z,depth:4});
    if(z<63)currents.push({x,z,dx:0,dz:1});
  }
  const config={
    bounds:{minX:0,maxX:63,minZ:0,maxZ:63},
    floorAt,initial,currents,
    sources:lanes.map(x=>({x,z:0,surfaceY:.4,rate:3})),
    outlets:lanes.map(x=>({x,z:63,surfaceY:.4,rate:3}))
  };
  return {fluid:new ColumnFluidEngine(config),altered,config};
}

const changed=(x1,x2,z)=>({
  geometryChanged:true,
  changedBounds:{
    min:{x:x1,y:-3,z},
    max:{x:x2,y:4,z}
  }
});

test('a Fireball-opened bank receives real water immediately even near the end of a 4096-column river',()=>{
  const {fluid,altered}=river();
  assert.equal(fluid.sample(28,50).depth,0);
  assert.equal(fluid.sample(27,50).depth,0);
  assert.equal(fluid.sample(28,50).floorY,1);
  assert.equal(fluid.sample(29,50).depth,4);
  const initial=fluid.totalDepth;
  altered.set('28,50',-2);
  altered.set('27,50',-2);
  assert.equal(fluid.onTerrainChange(changed(27,28,50)),2);
  assert.equal(fluid.sample(28,50).floorY,-2);
  const first=fluid.step({budget:12});
  assert.ok(first.urgentProcessed>0,'a real adjacent wet cell must wake immediately');
  assert.ok(first.processed<=12,'mobile budget cannot increase on impact');
  assert.ok(fluid.sample(28,50).depth>0,
    'newly connected crater edge should not wait for a full river sweep');
  assert.equal(fluid.sample(27,50).depth,0,
    'water must not jump over the first physical crater cell');
  let injected=first.injected,drained=first.drained;
  for(let tick=0;tick<240;tick++){
    const result=fluid.step({budget:12});
    assert.ok(result.processed<=12);
    injected+=result.injected;
    drained+=result.drained;
  }
  assert.ok(fluid.sample(27,50).depth>0,
    'the second crater cell must gradually receive real water across the breach');
  assert.equal(fluid.sample(27,51).depth,0,
    'a higher intact bank adjacent to the crater must remain dry');
  assert.equal(fluid.totalDepth+drained,initial+injected,
    'responsive flow must conserve volume including legitimate upstream and downstream boundaries');
});

test('a disconnected Fireball crater never acquires water from a scheduling wake-up',()=>{
  const {fluid,altered}=river();
  altered.set('3,50',-3);
  assert.equal(fluid.onTerrainChange(changed(3,3,50)),1);
  for(let i=0;i<80;i++)fluid.step({budget:12});
  assert.equal(fluid.sample(3,50).depth,0);
  assert.equal(fluid.snapshot().urgent.length,0);
});

test('in-flight crater scheduling survives a saved replay and rejects malformed queues',()=>{
  const {fluid,altered,config}=river();
  altered.set('28,50',-2);
  fluid.onTerrainChange(changed(28,28,50));
  fluid.step({budget:12});
  const saved=JSON.parse(JSON.stringify(fluid.snapshot()));
  assert.ok(saved.urgent.length>0,'impact work must be persisted between game steps');
  const restored=new ColumnFluidEngine(config);
  restored.restore(saved);
  assert.deepEqual(restored.snapshot(),saved);
  for(let i=0;i<40;i++){
    assert.deepEqual(restored.step({budget:12}),fluid.step({budget:12}));
    assert.deepEqual(restored.snapshot(),fluid.snapshot());
  }
  const malformed=JSON.parse(JSON.stringify(saved));
  malformed.urgent=[4096];
  assert.throws(()=>new ColumnFluidEngine(config).restore(malformed),/disturbance queue/);
  const legacy=JSON.parse(JSON.stringify(saved));
  delete legacy.urgent;
  const backwardsCompatible=new ColumnFluidEngine(config);
  backwardsCompatible.restore(legacy);
  assert.deepEqual(backwardsCompatible.snapshot().urgent,[],
    'old saves without a wake queue remain readable');
});
