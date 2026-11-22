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

test('portable replay UI uses native file control and verifies JSON before restoring', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.match(html, /id="replay-export" type="button"/);
  assert.match(html, /id="replay-import-file" type="file"/);
  assert.doesNotMatch(html, /id="replay-import-file"[^>]* hidden/);
  assert.match(main, /replayExportButton\.addEventListener\('click'/);
  assert.match(main, /replayImportFile\.addEventListener\('change'/);
  assert.doesNotMatch(main, /replayImportFile\.click\(/);
  assert.doesNotMatch(main, /replayFileAction/);
  assert.match(main, /const parsed = parseReplayFile\(text\)/);
  assert.match(main, /installVerifiedReplay\(parsed\.checkpoint, parsed\.restored, parsed\.counters/);
  assert.match(main, /const text = createReplayFile\(/);
  assert.match(main, /file\.size > MAX_REPLAY_FILE_BYTES/);
  assert.match(main, /new TextDecoder\('utf-8', \{fatal:true\}\)/);
  assert.match(main, /'file-imported'/);
  assert.match(main, /'file-exported'/);
  assert.match(main, /replayImportFile\.value = ''/);
  assert.match(main, /cancelTerrainWorker\(\);[\s\S]*pendingTerrainDirty\.clear\(\);[\s\S]*world = restored\.world/);
});
