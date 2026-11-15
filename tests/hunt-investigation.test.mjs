import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntInvestigation} from '../src/hunt-investigation.mjs';

test('findings require a nearby resident site and survive reload for the same world',()=>{
  const regions=[{id:'ruins',opportunities:[
    {id:'clue',kind:'investigation-location',at:{x:5,z:0}}
  ]},{id:'grove',opportunities:[
    {id:'cache',kind:'optional-discovery',at:{x:10,z:0}}
  ]}];
  const saved=new Map();
  const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  const terrain={revision:1,raycast:()=>({point:{y:5}})};
  const hunt=new HuntInvestigation(regions,7,0,storage);
  hunt.update(['ruins'],terrain);
  assert.deepEqual(hunt.markers.map(marker=>marker.id),['clue']);
  assert.equal(hunt.interact({x:10,y:5,z:0}),null);
  assert.equal(hunt.interact({x:5,y:2,z:0}),null);
  assert.match(hunt.interact({x:5,y:5,z:0}),/Fresh ash/);
  assert.equal(hunt.interact({x:5,y:5,z:0}),null);
  hunt.update(['grove'],terrain);
  assert.match(hunt.interact({x:10,y:5,z:0}),/sealed cache/);
  assert.deepEqual(new HuntInvestigation(regions,7,0,storage).findings,['cache','clue']);
  assert.deepEqual(new HuntInvestigation(regions,8,0,storage).findings,[]);
});
