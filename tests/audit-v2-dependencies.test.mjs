import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditV2Dependencies } from '../scripts/audit-v2-dependencies.mjs';

function fixture(code) {
  const root=mkdtempSync(join(tmpdir(),'v2-deps-'));
  mkdirSync(join(root,'src'));
  writeFileSync(join(root,'main.mjs'),code);
  return root;
}
test('accepts local imports and built-in Node modules',()=>{
  const root=fixture("import './src/engine.mjs'; import 'node:assert/strict';");
  try {
    writeFileSync(join(root,'src/engine.mjs'),'export const x=1;');
    assert.deepEqual(auditV2Dependencies(root).issues,[]);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('rejects external packages, missing files, V1 paths and traversal',()=>{
  for(const code of [
    "import 'old-engine';",
    "import './missing.mjs';",
    "import '../Wyrmforge/main.mjs';",
    "import './src/legacy/renderer.mjs';"
  ]) {
    const root=fixture(code);
    try {assert.ok(auditV2Dependencies(root).issues.length>0,code);}
    finally {rmSync(root,{recursive:true,force:true});}
  }
});
test('allows new local assets but rejects escaping HTML assets',()=>{
  const root=fixture('export const x=1;');
  try {
    writeFileSync(join(root,'index.html'),'<img src="./assets/grass.png">');
    assert.deepEqual(auditV2Dependencies(root).issues,[]);
    writeFileSync(join(root,'index.html'),'<script src="../Wyrmforge/main.js"></script>');
    assert.ok(auditV2Dependencies(root).issues.length>0);
  } finally {rmSync(root,{recursive:true,force:true});}
});
