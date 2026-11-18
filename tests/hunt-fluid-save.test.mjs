import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {FluidRegionCheckpoints} from '../src/fluid/fluid-region-checkpoints.mjs';
import {
  HuntFluidSave,HUNT_FLUID_SAVE_PREFIX,MAX_HUNT_FLUID_SAVE_CHARS
} from '../src/fluid/hunt-fluid-save.mjs';

const memory=()=>{
  const values=new Map();
  return {
    values,
    getItem(key){return values.get(key)??null;},
    setItem(key,value){values.set(key,value);}
  };
};
const floorEngine=(floorAt=()=>0)=>new ColumnFluidEngine({
  bounds:{minX:0,maxX:2,minZ:0,maxZ:0},floorAt,
  initial:[{x:0,z:0,depth:40}],kind:'water'
});

test('durable Water V2 checkpoint round-trips exact solver state over browser storage',()=>{
  const storage=memory(),identity='hunt-plan-7:worldgen-v2.7:7:0';
  const first=new FluidRegionCheckpoints(identity);
  const a=first.open('region-entry',()=>floorEngine());
  for(let i=0;i<30;i++)a.step({budget:3});
  const before=a.snapshot();
  const saved=new HuntFluidSave(storage,identity);
  assert.equal(saved.status,'ready');
  assert.equal(saved.saveFrom(first),true);
  assert.equal(saved.status,'saved');
  assert.equal(saved.hasCheckpoint,true);
  const key=HUNT_FLUID_SAVE_PREFIX+identity;
  assert.ok(storage.values.get(key).length<MAX_HUNT_FLUID_SAVE_CHARS);

  const reloaded=new HuntFluidSave(storage,identity);
  assert.equal(reloaded.status,'loaded');
  const next=new FluidRegionCheckpoints(identity);
  assert.equal(reloaded.restoreInto(next),true);
  const b=next.open('region-entry',()=>floorEngine());
  assert.deepEqual(b.snapshot(),before);
  for(let i=0;i<20;i++){
    a.step({budget:2});
    b.step({budget:2});
  }
  assert.deepEqual(a.snapshot(),b.snapshot());
});

test('water checkpoint waits for exact authoritative terrain replay before reopen',()=>{
  const storage=memory(),identity='world-seven:river';
  let terrain=0;
  const open=()=>floorEngine(()=>terrain);
  const first=new FluidRegionCheckpoints(identity);
  first.open('river',open);
  const save=new HuntFluidSave(storage,identity);
  assert.equal(save.saveFrom(first),true);
  const returned=new FluidRegionCheckpoints(identity);
  new HuntFluidSave(storage,identity).restoreInto(returned);
  terrain=-2;
  assert.throws(()=>returned.open('river',open),/same replayed physical terrain/);
  assert.deepEqual(returned.dormantIds,['river'],
    'failed replay must not discard the player's liquid checkpoint');
  terrain=0;
  assert.equal(returned.open('river',open).totalDepth,40);
});

test('corrupt, oversized, or wrong-world water saves fail closed without overwrite',()=>{
  const storage=memory(),identity='plan-42';
  const one=new FluidRegionCheckpoints(identity);
  one.open('r1',()=>floorEngine());
  new HuntFluidSave(storage,identity).saveFrom(one);
  const key=HUNT_FLUID_SAVE_PREFIX+identity;
  const original=storage.values.get(key);

  const mismatched=JSON.parse(original);
  mismatched.identity='another-world';
  storage.values.set(key,JSON.stringify(mismatched));
  const wrong=new HuntFluidSave(storage,identity);
  assert.equal(wrong.status,'unreadable');
  assert.throws(()=>wrong.restoreInto(new FluidRegionCheckpoints(identity)),/save refused/);
  assert.throws(()=>wrong.saveFrom(one),/cannot overwrite/);

  storage.values.set(key,'{not-json');
  assert.equal(new HuntFluidSave(storage,identity).status,'unreadable');
  storage.values.set(key,'x'.repeat(MAX_HUNT_FLUID_SAVE_CHARS+1));
  assert.equal(new HuntFluidSave(storage,identity).status,'unreadable');
  storage.values.delete(key);
  assert.equal(new HuntFluidSave(storage,identity).restoreInto(new FluidRegionCheckpoints(identity)),false);
});

test('storage failures do not report a successful save or mutate persisted state',()=>{
  const first=memory(),identity='plan-7';
  const regions=new FluidRegionCheckpoints(identity);
  regions.open('r',()=>floorEngine());
  const storage={
    getItem:key=>first.getItem(key),
    setItem(){throw new Error('Storage quota exhausted');}
  };
  const save=new HuntFluidSave(storage,identity);
  assert.equal(save.saveFrom(regions),false);
  assert.equal(save.status,'unavailable');
  assert.match(save.error,/quota exhausted/);
  const noStorage=new HuntFluidSave(undefined,identity);
  assert.equal(noStorage.status,'unavailable');
  assert.equal(noStorage.saveFrom(regions),false);
});
