import test from 'node:test';
import assert from 'node:assert/strict';
import {closeHuntRiverInteriorIslets,expandHuntRiverCorridor,
  composeHuntRiverBankTiles,MAX_RIVER_INTERIOR_ISLETS}
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

test('WAT-19: real exposed stone outcrops get microvoxel edges but stay dry rock',()=>{
  const changes=new Map([['2,2',{floorY:1}]]);
  const columns=new Map([
    ['3,2',{x:3,z:2,material:3,topY:3,topVoxelY:2}],
    ['1,2',{x:1,z:2,material:2,topY:3,topVoxelY:2}]
  ]);
  const band={definition:{runs:[],surfaceTiles:[],seed:7}};
  const shore=composeHuntRiverBankTiles({
    band,part:[{x:2,z:2}],changes,columns
  });
  assert.equal(shore.bankTiles,1);
  const tile=shore.tiles[0];
  assert.equal(id(tile.x,tile.z),'3,2');
  assert.equal(tile.y,2);
  assert.equal(tile.levels.length,100);
  assert.ok(tile.levels.some(level=>level<=7),
    'the exposed stone rim must not stay a rigid 1m rectangular block');
  assert.ok(tile.levels.every(level=>Number.isSafeInteger(level)&&level>=1&&level<=10),
    'rock remains solid at a real 10cm Voxel material level');
  assert.equal(changes.size,1,'sculpting stone must not invent a wet column');
  assert.equal(changes.has('3,2'),false);
  assert.equal(shore.tiles.some(cell=>id(cell.x,cell.z)==='1,2'),false,
    'authored material-2 walking road must never be sculpted');
});
