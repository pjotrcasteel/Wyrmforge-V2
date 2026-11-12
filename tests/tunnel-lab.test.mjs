import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('V2 tunnel is a real lab action using the existing authority, worker and UI', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.match(html,/id="tunnel" type="button">Carve tunnel/);
  assert.match(main,/import \{ demoTunnelTarget \} from '.\/src\/demo-tunnel\.mjs'/);
  assert.match(main,/document\.querySelector\('#tunnel'\)\.addEventListener\('click'/);
  assert.match(main,/type:'carve-tunnel'/);
  assert.match(main,/terrainEdits\.apply\(\{/);
  assert.match(main,/expectedEditRevision:terrainEdits\.editRevision/);
  assert.match(main,/for \(const id of edit\.dirtyChunks\) pendingTerrainDirty\.add\(id\)/);
  assert.match(main,/cancelTerrainWorker\(\);/);
  assert.match(main,/updateTerrainMeshes\(\)/);
  assert.match(main,/lastTunnel = \{/);
  assert.match(main,/lastCarve, lastCrater, lastTunnel, lastBurst/);
  assert.match(main,/  lastTunnel = null;/);
  assert.doesNotMatch(main,/new TerrainEditLedger\(world\)\.apply\(\{/);
});

test('the same imported replay ID counter also advances for tunnel edits', () => {
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  const replay=readFileSync(new URL('../src/replay-file.mjs',import.meta.url),'utf8');
  assert.match(main,/id:`lab-hit-\$\{\+\+nextTerrainEditId\}`, type:'carve-tunnel'/);
  assert.match(replay,/\^lab-hit-\(\\d\+\)\$/);
  assert.match(main,/nextTerrainEditId = counters\.nextTerrainEditId/);
});

test('the tunnel fixture cannot import renderers, gameplay or V1 assets', () => {
  const fixture=readFileSync(new URL('../src/demo-tunnel.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(fixture,/\bimport\b|\bwindow\b|\bdocument\b|WebGL|\bWyrmforge\b/);
  assert.match(fixture,/flat:Object\.freeze/);
  assert.match(fixture,/hill:Object\.freeze/);
  assert.match(fixture,/cliff:Object\.freeze/);
  assert.match(fixture,/arch:Object\.freeze/);
});
