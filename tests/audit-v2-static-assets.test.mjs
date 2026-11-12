import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditV2Dependencies } from '../scripts/audit-v2-dependencies.mjs';

function withFixture(callback) {
  const root=mkdtempSync(join(tmpdir(),'voxel-v2-static-audit-'));
  mkdirSync(join(root,'src'));
  mkdirSync(join(root,'assets'));
  writeFileSync(join(root,'main.mjs'),'export const version=2;');
  try {callback(root);}
  finally {rmSync(root,{recursive:true,force:true});}
}
function check(root,expected=null) {
  const report=auditV2Dependencies(root);
  if(expected===null) assert.deepEqual(report.issues,[]);
  else assert.match(report.issues.join('\n'),expected);
  return report;
}

test('authored JS runtime assets are resolved relative to their source modules',()=>{
  withFixture(root=>{
    mkdirSync(join(root,'src','textures'));
    writeFileSync(join(root,'src','textures','grass.png'),'PNG');
    writeFileSync(join(root,'src','material.mjs'),
      'export const grass=new ' + 'URL("./textures/grass.png",import.meta.url);');
    check(root);
    writeFileSync(join(root,'src','material.mjs'),
      'export const grass=new ' + 'URL("./textures/missing.png",import.meta.url);');
    check(root,/unresolved asset/);
    writeFileSync(join(root,'src','material.mjs'),
      'export const grass=new ' + 'URL("../../Wyrmforge/v1/grass.png",import.meta.url);');
    check(root,/forbidden asset/);
    writeFileSync(join(root,'src','material.mjs'),
      'export const grass=new ' + 'URL("https://cdn.example.invalid/grass.png",import.meta.url);');
    check(root,/non-local asset/);
  });
});

test('CSS url and import dependencies require local assets and cannot escape clean room',()=>{
  withFixture(root=>{
    writeFileSync(join(root,'assets','dirt.png'),'PNG');
    writeFileSync(join(root,'assets','detail.css'),'html { color: white; }');
    writeFileSync(join(root,'src','terrain.css'),
      '@import "../assets/detail.css"; .soil{background:url(../assets/dirt.png)}');
    check(root);
    writeFileSync(join(root,'src','terrain.css'),
      'div { background: url("../../Wyrmforge/v1/soil.png"); }');
    check(root,/forbidden asset/);
    writeFileSync(join(root,'src','terrain.css'),
      '@import "https://cdn.example.invalid/reset.css";');
    check(root,/non-local asset/);
    writeFileSync(join(root,'src','terrain.css'),
      'div { background: url(../assets/unknown.png); }');
    check(root,/unresolved asset/);
  });
});

test('HTML inline styles, responsive srcset and root CSS are covered',()=>{
  withFixture(root=>{
    writeFileSync(join(root,'assets','one.png'),'PNG');
    writeFileSync(join(root,'assets','two.png'),'PNG');
    writeFileSync(join(root,'layout.css'),
      'div { background-image: url("./assets/one.png"); }');
    writeFileSync(join(root,'index.html'),
      '<style>body{background:url(./assets/one.png)}</style>' +
      '<img srcset="./assets/one.png 1x, ./assets/two.png 2x">' +
      '<link rel="stylesheet" href="./layout.css">');
    const report=check(root);
    assert.ok(report.dependencies>=5,'CSS, HTML and srcset dependencies counted');
    writeFileSync(join(root,'index.html'),
      '<img srcset="./assets/one.png 1x, https://cdn.example.invalid/two.png 2x">');
    check(root,/non-local asset/);
    writeFileSync(join(root,'layout.css'),
      'body{background-image:url(data:image/png;base64,aaaa)}');
    check(root,/non-local asset/);
  });
});

test('hash package imports are not confused with local HTML fragments',()=>{
  withFixture(root=>{
    writeFileSync(join(root,'index.html'),'<a href="#terrain">Terrain</a>');
    check(root);
    writeFileSync(join(root,'main.mjs'),
      "import '#private-engine';");
    check(root,/non-local import/);
  });
});

test('all shipped browser entrypoints reject Node builtins',()=>{
  withFixture(root=>{
    writeFileSync(join(root,'external-terrain-lab.mjs'),"import 'node:fs';");
    check(root,/browser runtime imports Node/);
    writeFileSync(join(root,'external-terrain-lab.mjs'),
      "export const entry='v2';");
    check(root);
  });
});
