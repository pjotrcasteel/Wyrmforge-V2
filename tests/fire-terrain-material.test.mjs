import test from 'node:test';
import assert from 'node:assert/strict';
import {FIRE_ROCK_MOTIF,fireRockMotifGlsl} from '../src/fire-rock-art.mjs';
import {FIRE_BASALT_PALETTE} from '../src/fire-terrain-material.mjs';

test('volcanic fracture art reaches the shader with the correct basalt palette indices',()=>{
  const packed=[...fireRockMotifGlsl().matchAll(/(\d+)u/g)].map(match=>Number(match[1]));
  assert.equal(FIRE_ROCK_MOTIF.length,32);
  for(const [rowIndex,row] of FIRE_ROCK_MOTIF.entries()){
    assert.match(row,/^[0-3]{32}$/);
    const unpacked=Array.from({length:32},(_,x)=>
      (packed[rowIndex*4+Math.floor(x/8)]>>((x%8)*3))&7).join('');
    assert.equal(unpacked,row);
  }
  const crackTexels=[...FIRE_ROCK_MOTIF.join('')].filter(value=>value==='0').length;
  assert.ok(crackTexels<=48,'fractures remain sparse over broad stone surfaces');
  assert.equal(FIRE_BASALT_PALETTE.length,4);
  for(const color of FIRE_BASALT_PALETTE){
    assert.equal(color.length,3);
    assert.ok(color.every(value=>Number.isFinite(value)&&value>=0&&value<=1));
  }
});
