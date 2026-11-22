import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveHuntTerrainGravity,huntTerrainSaveIdentity} from '../src/hunt-gravity-mode.mjs';

test('normal streamed Hunt and its gravity bypass share the existing save',()=>{
  for(const mode of [null,'off']){
    const {terrain,defaultEnabled}=resolveHuntTerrainGravity(true,mode);
    assert.equal(terrain,mode===null);
    assert.equal(huntTerrainSaveIdentity('hunt',mode,{structuralGravity:terrain,defaultEnabled}),'hunt');
  }
});

test('guided and explicit preview saves remain isolated from normal streamed terrain',()=>{
  assert.equal(resolveHuntTerrainGravity(false,null).terrain,false);
  assert.equal(resolveHuntTerrainGravity(false,'terrain').terrain,false);
  for(const mode of ['terrain','split-span']){
    const {defaultEnabled}=resolveHuntTerrainGravity(true,mode);
    assert.equal(huntTerrainSaveIdentity('hunt',mode,{structuralGravity:true,defaultEnabled}),'hunt:gravity-'+mode);
  }
});
