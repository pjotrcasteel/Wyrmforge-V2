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
test('accepts V2 local imports and Node builtins only in development scripts',()=>{
  const root=fixture("import './src/engine.mjs';");
  try {
    writeFileSync(join(root,'src/engine.mjs'),'export const x=1;');
    mkdirSync(join(root,'scripts'));
    writeFileSync(join(root,'scripts/check.mjs'),"import 'node:assert/strict';");
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
test('validates local assets and rejects escaping or missing HTML resources',()=>{
  const root=fixture('export const x=1;');
  try {
    mkdirSync(join(root,'assets'));
    writeFileSync(join(root,'assets/grass.png'),'test-image-bytes');
    writeFileSync(join(root,'index.html'),'<img src="./assets/grass.png">');
    assert.deepEqual(auditV2Dependencies(root).issues,[]);
    writeFileSync(join(root,'index.html'),'<script src="../Wyrmforge/main.js"></script>');
    assert.ok(auditV2Dependencies(root).issues.length>0);
    writeFileSync(join(root,'index.html'),'<img src="./assets/missing.png">');
    assert.match(auditV2Dependencies(root).issues.join('\n'),/unresolved asset/);
  } finally {rmSync(root,{recursive:true,force:true});}
});


test('literal dynamic imports obey the same V2 clean-room rules',()=>{
  const dynamic = specifier => "const load=()=>im" + "port('" + specifier + "');";
  const root=fixture(dynamic('./src/engine.mjs'));
  try {
    writeFileSync(join(root,'src/engine.mjs'),'export const x=1;');
    assert.deepEqual(auditV2Dependencies(root).issues,[]);
    for(const code of [
      dynamic('external-package'),
      dynamic('./src/v1/renderer.mjs'),
      dynamic('../Wyrmforge/main.mjs'),
      dynamic('./missing.mjs')
    ]) {
      writeFileSync(join(root,'main.mjs'),code);
      assert.ok(auditV2Dependencies(root).issues.length>0,code);
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('browser V2 runtime cannot import Node, even when a development test can',()=>{
  const root=fixture("import 'node:fs';");
  try {
    assert.match(auditV2Dependencies(root).issues.join('\n'),/browser runtime imports Node/);
    writeFileSync(join(root,'main.mjs'),"import './src/engine.mjs';");
    writeFileSync(join(root,'src/engine.mjs'),"import 'node:crypto';");
    assert.match(auditV2Dependencies(root).issues.join('\n'),/browser runtime imports Node/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('all root HTML entrypoints are audited, including the material inspection page',()=>{
  const root=fixture('export const x=1;');
  try {
    writeFileSync(join(root,'index.html'),'<script type="module" src="./main.mjs"></script>');
    writeFileSync(join(root,'grass-material-lab.html'),
      '<a href="./">Back</a><script src="https://example.invalid/loader.js"></script>');
    assert.match(auditV2Dependencies(root).issues.join('\n'),/non-local asset/);
    writeFileSync(join(root,'grass-material-lab.html'),
      '<a href="./">Back</a><script type="module" src="./main.mjs"></script>');
    assert.deepEqual(auditV2Dependencies(root).issues,[]);
  } finally {rmSync(root,{recursive:true,force:true});}
});
