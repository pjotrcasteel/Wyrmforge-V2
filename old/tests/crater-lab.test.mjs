import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoCraterTarget } from '../src/demo-crater.mjs';
import { createScene } from '../src/voxel-world.mjs';
import { TerrainEditLedger } from '../src/terrain-edit-ledger.mjs';

test('each visible V2 scene provides a destructive real-voxel crater target',()=>{
  for(const chunkEdge of [16,32]) {
    for(const scene of ['flat','hill','cliff','arch']) {
      const world=createScene(scene,7,{chunkEdge});
      const ledger=new TerrainEditLedger(world);
      const target=demoCraterTarget(scene);
      const before=world.revision;
      const result=ledger.apply({
        id:'demo-crater',type:'carve-crater',...target,
        expectedRevision:world.revision
      });
      assert.equal(result.status,'accepted');
      assert.ok(result.removedVoxels>0,scene+' should show a real crater');
      assert.ok(result.dirtyChunks.length>0,scene+' should invalidate derived geometry');
      assert.equal(world.revision-before,result.removedVoxels);
    }
  }
});

test('crater diagnostic stays bound to the existing writer, replay and worker path',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  const fixture=readFileSync(new URL('../src/demo-crater.mjs',import.meta.url),'utf8');
  assert.match(html,/id="crater" type="button">Carve crater/);
  assert.match(main,/import \{ demoCraterTarget \} from '.\/src\/demo-crater\.mjs'/);
  assert.match(main,/document\.querySelector\('#crater'\)\.addEventListener\('click'/);
  assert.match(main,/id:`lab-hit-\$\{\+\+nextTerrainEditId\}`, type:'carve-crater'/);
  assert.match(main,/expectedEditRevision:terrainEdits\.editRevision/);
  assert.match(main,/for \(const id of edit\.dirtyChunks\) pendingTerrainDirty\.add\(id\)/);
  assert.match(main,/updateTerrainMeshes\(\)/);
  assert.match(main,/lastCarve, lastCrater, lastTunnel, lastBurst/);
  assert.doesNotMatch(main,/new TerrainEditLedger\(world\)\.apply\(\{/);
  assert.doesNotMatch(fixture,/\bimport\b|\bwindow\b|\bdocument\b|WebGL|\.\.\/|Math\.random/);
});

test('crater fixture rejects unknown scene names',()=>{
  assert.throws(()=>demoCraterTarget('mountain'),RangeError);
  assert.throws(()=>demoCraterTarget(null),RangeError);
  const one=demoCraterTarget('flat');
  one.depth=500;
  assert.notEqual(demoCraterTarget('flat').depth,500);
});
