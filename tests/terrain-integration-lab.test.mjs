import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('actual standalone lab routes every terrain writer through one V2.6 port', () => {
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  const port=readFileSync(new URL('../src/terrain-integration-port.mjs',import.meta.url),'utf8');

  assert.match(main,/import \{ V2TerrainPort \} from '.\/src\/terrain-integration-port\.mjs'/);
  assert.match(main,/import \{ attachTerrainConsumerProbes \} from '.\/src\/terrain-consumer-probes\.mjs'/);
  assert.match(main,/function installTerrainPort\(nextWorld, ledger\)/);
  assert.match(main,/new V2TerrainPort\(nextWorld, ledger, \{epoch:\+\+terrainEpoch\}\)/);
  assert.match(main,/attachTerrainConsumerProbes\(terrainEdits\)/);
  assert.match(main,/installTerrainPort\(world, new TerrainEditLedger\(world\)\)/);
  assert.match(main,/installTerrainPort\(world, restored\.ledger\)/);
  assert.match(main,/terrainIntegration:\{\.\.\.terrainEdits\.metrics\(\)/);
  assert.match(main,/probes:terrainConsumers\.report\(\)/);

  assert.match(main,/terrainEdits\.apply\(\{/);
  assert.match(main,/applyDemoBurst\(world, terrainEdits/);
  assert.match(main,/applyTerrainSpellHit\(world, terrainEdits/);
  assert.match(main,/excavateActorSupport\(world,terrainEdits,actor/);
  assert.match(main,/ledger:terrainEdits/);
  assert.doesNotMatch(main,/terrainEdits = new TerrainEditLedger\(world\)/);

  // Port owns NO voxel storage; it only delegates the existing authority.
  assert.doesNotMatch(port,/new VoxelWorld|new TerrainEditLedger|\.set\(x,y,z/);
  assert.match(port,/const result=this\.#ledger\.apply\(command\)/);
  assert.match(port,/const change=immutableChange\(command,result,this\.#epoch\)/);
});

test('all six V2-native fake consumers are wired without V1 dependencies', () => {
  const probes=readFileSync(new URL('../src/terrain-consumer-probes.mjs',import.meta.url),'utf8');
  const events=readFileSync(new URL('../src/terrain-integration-port.mjs',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.match(events,/TERRAIN_CONSUMERS = Object\.freeze\(\[/);
  for(const kind of ['gameplay','physics','lighting','vfx','audio','navigation']) {
    assert.match(events,new RegExp(`'${kind}'`));
  }
  assert.match(probes,/port\.subscribe\(kind,change=>/);
  assert.match(probes,/change\.sequence!==row\.lastSequence\+1/);
  assert.match(main,/terrainConsumers\.dispose\(\)/);
  assert.match(main,/terrainEdits\.dispose\(\)/);
  assert.doesNotMatch(probes,/from '.\.\/\.\.\/Wyrmforge|from '\.\/.*v1/i);
});
