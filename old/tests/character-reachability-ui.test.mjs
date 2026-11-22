import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');
const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
const nav=readFileSync(new URL('../src/character-reachability.mjs',import.meta.url),'utf8');
const policy=readFileSync(new URL('../src/character-traversal-policy.mjs',import.meta.url),'utf8');

test('World Generation mobile viewer makes actor reachability an independent opt-in diagnostic',()=>{
  assert.match(html,/id="traversal-layout" type="checkbox"/);
  assert.match(html,/id="reachability-report" role="status"/);
  assert.match(host,/traversalLayout\.addEventListener\('change'/);
  assert.match(host,/const report=analyzeCharacterReachability\(\{/);
  assert.match(host,/terrain:active\.port/);
  assert.match(host,/bounds:generatedSite\.layout\.footprint/);
  assert.match(host,/reachabilityCache=\{revision,epoch,hash:generatedSite\.hash,report\}/);
  assert.match(host,/report\.routeTo\(exit\.x,exit\.z\)/);
  assert.match(host,/cell\.state==='damaging'/);
  assert.doesNotMatch(host,/generatedSite\.layout\.topology\.walkableFromEntry/);
});

test('navigation belongs neither to World Generation nor the VoxelWorld private data model',()=>{
  assert.doesNotMatch(nav,/from ['"][^'"]*(?:voxel-world|world-generator|map-kinds|webgl|renderer|enemy|loot)/);
  assert.doesNotMatch(nav,/document\.|window\.|Canvas/);
  assert.doesNotMatch(policy,/from ['"][^'"]*(?:voxel-world|webgl|renderer|enemy|loot|WorldGeneration)/);
  assert.doesNotMatch(nav,/Math\.random\(/);
});

test('physics fall impact contains proposed damage only: never mutates a health pool',()=>{
  const actor=readFileSync(new URL('../src/terrain-actor.mjs',import.meta.url),'utf8');
  assert.match(actor,/fallImpact,fallDamage:fallImpact\?\.damage\?\?0/);
  assert.match(actor,/autoHopStarted/);
  assert.doesNotMatch(actor,/\.health\s*[-+]?=/);
  assert.doesNotMatch(policy,/\.health\s*[-+]?=/);
  assert.doesNotMatch(html,/id="actor-jump"/);
});
