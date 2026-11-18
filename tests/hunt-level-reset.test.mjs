import test from 'node:test';
import assert from 'node:assert/strict';
import {huntLevelResetKeys,resetHuntLevelSave}
  from '../src/hunt-level-reset.mjs';

const world={
  terrainIdentity:'plan-7:WorldGen-v2.7:7:0:32:0:connected-water-v3-ribbon-bank',
  worldIdentity:'plan-7:WorldGen-v2.7:7:0:32:0',
  seed:7,worldRevision:0
};
function storage(){
  const map=new Map();
  return {
    map,
    getItem:key=>map.get(key)??null,
    setItem:(key,value)=>map.set(key,value),
    removeItem:key=>map.delete(key)
  };
}

test('Reset level clears only its exact terrain, liquid, tree and two progress saves',()=>{
  const db=storage();
  const keys=huntLevelResetKeys(world);
  assert.equal(keys.length,5);
  for(const [index,key]of keys.entries())db.setItem(key,'saved-'+index);
  const foreign=[
    'wyrmforge.hunt-terrain.v1:other-plan',
    'wyrmforge.hunt-water.v1:other-plan',
    'wyrmforge.hunt-tree-damage.v1:other-plan',
    'wyrmforge.hunt-findings.v1:8:0',
    'wyrmforge.hunt-extraction.v1:7:1',
    'unrelated-account-setting'
  ];
  for(const key of foreign)db.setItem(key,'preserve');
  const result=resetHuntLevelSave(db,world);
  assert.deepEqual(result,{
    schema:'wyrmforge.hunt-level-reset.v1',
    scopedKeys:5,clearedKeys:5
  });
  assert.deepEqual(keys.map(key=>db.getItem(key)),[null,null,null,null,null]);
  for(const key of foreign)assert.equal(db.getItem(key),'preserve');
  assert.equal(resetHuntLevelSave(db,world).clearedKeys,0);
});

test('Reset is impossible for missing identities or an unreadable storage interface',()=>{
  const db=storage();
  for(const input of [
    undefined,{}, {...world,terrainIdentity:''},
    {...world,seed:-1}, {...world,worldRevision:1.5}
  ])assert.throws(()=>huntLevelResetKeys(input));
  assert.throws(()=>resetHuntLevelSave(null,world),/storage unavailable/);
  assert.throws(()=>resetHuntLevelSave({},world),/storage unavailable/);
  assert.equal(db.map.size,0);
});

test('Storage removal failures block a reload and restore the original exact saves',()=>{
  const db=storage(),keys=huntLevelResetKeys(world);
  keys.forEach((key,i)=>db.setItem(key,'saved-'+i));
  db.setItem('other-game','not touched');
  let removeCount=0;
  const flaky={
    getItem:key=>db.getItem(key),
    setItem:(key,val)=>db.setItem(key,val),
    removeItem(key){
      removeCount++;
      if(removeCount===3)throw new Error('Storage blocked');
      db.removeItem(key);
    }
  };
  assert.throws(()=>resetHuntLevelSave(flaky,world),
    /Reset could not clear this Hunt save/);
  keys.forEach((key,i)=>assert.equal(db.getItem(key),'saved-'+i));
  assert.equal(db.getItem('other-game'),'not touched');
});
