import test from 'node:test';
import assert from 'node:assert/strict';
import { runCollisionFixtureSuite } from '../src/collision-fixtures.mjs';

test('wall, step, cliff and destroyed-support collision fixtures',()=>{
  const result=runCollisionFixtureSuite();
  assert.equal(result.total,4);
  assert.equal(result.verdict,'pass',JSON.stringify(result));
  assert.ok(result.cases.find(c=>c.name==='solid-wall').contacts>0);
  assert.ok(result.cases.find(c=>c.name==='cliff-fall').airborneSteps>0);
});
