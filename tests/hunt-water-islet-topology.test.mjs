import test from 'node:test';
import assert from 'node:assert/strict';
import {closeHuntRiverInteriorIslets,MAX_RIVER_INTERIOR_ISLETS}
  from '../src/world-generation/hunt-river-morphology.mjs';

const ring=[[2,3],[4,3],[3,2],[3,4]];
const id=(x,z)=>x+','+z;
const landform={
  bounds:{minX:0,maxX:6,minZ:0,maxZ:6},ports:[],
  landform:Array.from({length:7},()=>[{start:0,end:7}])
};

function setup({material=3,topY=3,missing=-1}={}){
  const original=ring.filter((_,i)=>i!==missing)
    .map(([x,z])=>({x,z,y:1,flowX:1,flowZ:0}));
  const changes=new Map(original.map(cell=>[
    id(cell.x,cell.z),{floorY:1,flowX:1,flowZ:0}
  ]));
  const columns=new Map([[id(3,3),{x:3,z:3,material,topY}]]);
  const band={definition:{runs:[{x:0,z:0,y:2,length:1,material:3}]},
    fluidLayout:{riverChannels:[{floor:original}]}};
  return {band,changes,columns};
}

test('WAT-19: only a true one-cell stone island inside four wet faces is excavated',()=>{
  const {band,changes,columns}=setup();
  assert.equal(closeHuntRiverInteriorIslets({
    band,changes,columns,landform
  }),1);
  assert.deepEqual(changes.get('3,3'),{
    x:3,z:3,floorY:1,flowX:1,flowZ:0,lateral:true,interiorIslet:true
  });
  assert.equal(changes.size,5,'the original native river cells must be kept');
  assert.equal(MAX_RIVER_INTERIOR_ISLETS,24);
  const replay=setup();
  closeHuntRiverInteriorIslets({...replay,landform});
  assert.deepEqual([...changes],[...replay.changes],
    'WorldGen river closure must be seeded and replay-stable');
});

test('WAT-19: roads, high boulders, dry shoreline and multi-cell islands are never fabricated as water',()=>{
  for(const options of [
    {material:2}, {topY:6}, {missing:2}
  ]){
    const input=setup(options);
    const before=[...input.changes];
    assert.equal(closeHuntRiverInteriorIslets({...input,landform}),0);
    assert.deepEqual([...input.changes],before);
  }
  const input=setup();
  assert.equal(closeHuntRiverInteriorIslets({
    ...input,landform,maxCells:0
  }),0);
  assert.equal(input.changes.has('3,3'),false);
});
