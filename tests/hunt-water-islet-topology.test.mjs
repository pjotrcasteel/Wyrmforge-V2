import test from 'node:test';
import assert from 'node:assert/strict';
import {closeHuntRiverInteriorIslets,expandHuntRiverCorridor,MAX_RIVER_INTERIOR_ISLETS}
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

test('WAT-19: real WorldGen river width tapers out of a 1m seam without a rectangular jump',()=>{
  const part=Array.from({length:9},(_,i)=>({x:4,z:i+1}));
  const changes=new Map(part.map(cell=>[id(cell.x,cell.z),{floorY:1}]));
  const runs=Array.from({length:11},(_,z)=>({
    x:0,z,y:2,length:9,material:1
  }));
  const shape={bounds:{minX:0,maxX:8,minZ:0,maxZ:10},
    landform:Array.from({length:11},()=>[{start:0,end:9}]),ports:[]};
  const band={definition:{runs,seed:7}};
  const result=expandHuntRiverCorridor(band,part,1,changes,shape);
  const sides=[...changes].filter(([coordinate,cell])=>
    cell.lateral===true);
  assert.equal(result.addedWetCells,sides.length);
  assert.ok(sides.length>=6,'the woodland bank should actually widen the river');
  assert.ok(sides.every(([coordinate,cell])=>cell.floorY===1));
  for(const endZ of [1,9]){
    assert.equal(sides.filter(([coordinate])=>
      coordinate.endsWith(','+endZ)).length,0,
      'the physical 1m region seam cannot instantly grow into a square pool');
  }
  for(const nearEndZ of [2,8]){
    assert.ok(sides.filter(([coordinate])=>
      coordinate.endsWith(','+nearEndZ)).length<=1,
      'the first bank transition widens by at most one real Voxel column');
  }
});
