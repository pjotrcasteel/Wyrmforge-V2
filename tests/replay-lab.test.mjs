import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('lab checkpoint actions are interactive and include replay diagnostics in JSON', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.match(html, /id="checkpoint-save"/);
  assert.match(html, /id="checkpoint-restore" disabled/);
  assert.match(main, /document\.querySelector\('#checkpoint-save'\)\.addEventListener/);
  assert.match(main, /restoreReplayButton\.addEventListener\('click'/);
  assert.match(main, /restoreReplayCheckpoint\(checkpoint\)/);
  assert.match(main, /restoreReplayCheckpoint\(replayCheckpoint\)/);
  assert.match(main, /cancelTerrainWorker\(\);[\s\S]*pendingTerrainDirty\.clear\(\);[\s\S]*world = restored\.world/);
  assert.match(main, /lastReplay, replayPointAvailable:replayCheckpoint !== null/);
});
