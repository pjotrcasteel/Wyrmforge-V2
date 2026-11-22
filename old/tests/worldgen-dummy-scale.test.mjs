import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { projectRouteDummy } from '../src/diagnostics/worldgen-dummy-actor.mjs';
import { ACTOR_HEIGHT, ACTOR_HALF_WIDTH } from '../src/terrain-actor.mjs';
import {
  AUTO_HOP_HEIGHT, classifyTraversalHeight
} from '../src/character-traversal-policy.mjs';

const camera={width:720,height:720,scale:10,panX:0,panY:0,camera:'inspection'};
function report(nodes) {
  return {
    entry:{x:nodes[0].x,z:nodes[0].z},
    targets:[{id:'exit',x:nodes.at(-1).x,z:nodes.at(-1).z,reachable:true}],
    routeTo:()=>nodes,
    cells:nodes.map(n=>({...n}))
  };
}
test('the dummy uses the real 1.6m collider at unmodified camera scale',()=>{
  const path=[{x:2,z:3,y:4},{x:3,z:3,y:4.5},{x:4,z:3,y:5}];
  const start=projectRouteDummy(report(path),0,camera);
  const end=projectRouteDummy(report(path),100,camera);
  assert.equal(start.colliderHeight,ACTOR_HEIGHT);
  assert.equal(start.colliderHalfWidth,ACTOR_HALF_WIDTH);
  assert.equal(start.colliderHeight,1.6);
  assert.equal(start.colliderHalfWidth*2,0.56);
  assert.equal(start.routeIndex,0);
  assert.equal(end.routeIndex,2);
  assert.equal(start.nextHeightDifference,0.5);
  assert.equal(start.nextMovement,'auto-hop');
  assert.equal(start.recommendedHopLimit,0.55);
  assert.equal(end.nextHeightDifference,null);
  assert.ok(start.projectedHeight>0);
  const biggerView=projectRouteDummy(report(path),0,{...camera,scale:20});
  assert.ok(Math.abs(biggerView.projectedHeight-2*start.projectedHeight)<1e-5);
});

test('a 1m ledge cannot be treated as an easy character traversal',()=>{
  assert.equal(AUTO_HOP_HEIGHT,0.55);
  assert.equal(classifyTraversalHeight(1,2).passable,false);
  assert.equal(classifyTraversalHeight(1,1.5).passable,true);
  assert.equal(classifyTraversalHeight(1,1.5).type,'auto-hop');
  const projected=projectRouteDummy(report([
    {x:0,z:0,y:1},{x:1,z:0,y:2}
  ]),0,camera);
  assert.equal(projected.nextPassable,false);
  assert.equal(projected.nextMovement,'blocked-uphill');
});

test('the scale dummy can fall back to supported entrance if exit is unreachable',()=>{
  const disconnected={
    entry:{x:0,z:0},
    targets:[{id:'exit',x:4,z:4,reachable:false}],
    routeTo:()=>null,
    cells:[{x:0,z:0,y:2}]
  };
  const dummy=projectRouteDummy(disconnected,50,camera);
  assert.equal(dummy.feetY,2);
  assert.equal(dummy.routeLength,1);
  assert.equal(dummy.nextMovement,'end');
  assert.throws(()=>projectRouteDummy(disconnected,101,camera),/0–100/);
});

test('mobile World Generation viewer exposes the scale overlay and scrub without changing world ownership',()=>{
  const html=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');
  const code=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(html,/id="dummy-actor" type="checkbox" checked/);
  assert.match(html,/id="dummy-route-progress" type="range"/);
  assert.match(html,/id="dummy-actor-status"/);
  assert.match(code,/projectRouteDummy\(report,Number\(dummyProgress\.value\),view\)/);
  assert.match(code,/paintDummyActor\(ctx,view\)/);
  assert.doesNotMatch(code,/dummy.*world\.set\(/);
});
