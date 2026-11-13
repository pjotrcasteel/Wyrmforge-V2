import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVersionedLab } from '../scripts/create-versioned-lab.mjs';

const COMMIT = 'f'.repeat(40);

function withRoot(run, sha = COMMIT) {
  const root = mkdtempSync(join(tmpdir(), 'voxel-v2-pages-test-'));
  try {
    mkdirSync(join(root,'src'));
    writeFileSync(join(root,'index.html'),'<script type="module" src="./main.mjs"></script>');
    writeFileSync(join(root,'main.mjs'),
      "import { VERSION } from './src/build-info.mjs';\nimport './src/terrain-actor.mjs';\n");
    writeFileSync(join(root,'external-terrain-lab.html'),
      '<script type="module" src="./external-terrain-lab.mjs"></script>');
    writeFileSync(join(root,'external-terrain-lab.mjs'),
      "import { VERSION } from './src/build-info.mjs';\n");
    writeFileSync(join(root,'play-hunt.html'),
      '<title>Play Hunt</title>\\n<span id="build">Build loading…</span>\\n'+
      '<script type="module" src="./external-terrain-lab.mjs"></script>');
    writeFileSync(join(root,'src','build-info.mjs'),
      `export const VERSION = "0.0.028";\nexport const COMMIT = "${sha}";\n`);
    writeFileSync(join(root,'src','terrain-actor.mjs'),'export const ACTOR = true;\n');
    return run(root);
  } finally {
    rmSync(root,{recursive:true,force:true});
  }
}

test('versioned lab keeps complete module graph together at a fresh URL', () => {
  withRoot(root => {
    const result=createVersionedLab(root,COMMIT);
    assert.equal(result.version,'0.0.028');
    assert.equal(result.route,`builds/${COMMIT}/`);
    assert.ok(existsSync(join(result.path,'index.html')));
    assert.ok(existsSync(join(result.path,'main.mjs')));
    assert.ok(existsSync(join(result.path,'external-terrain-lab.html')));
    assert.ok(existsSync(join(result.path,'external-terrain-lab.mjs')));
    assert.ok(existsSync(join(result.path,'play-hunt.html')));
    const hunt=readFileSync(join(result.path,'play-hunt.html'),'utf8');
    assert.match(hunt,/Build fffffff · initializing/);
    assert.match(hunt,/src="\\.\\/external-terrain-lab\\.mjs"/);
    assert.doesNotMatch(hunt,/Build loading/);
    assert.match(readFileSync(join(result.path,'external-terrain-lab.html'),'utf8'),
      /src="\.\/external-terrain-lab\.mjs"/);
    assert.ok(existsSync(join(result.path,'src','build-info.mjs')));
    assert.ok(existsSync(join(result.path,'src','terrain-actor.mjs')));
    assert.match(readFileSync(join(result.path,'index.html'),'utf8'),
      /src="\.\/main\.mjs"/);
    assert.match(readFileSync(join(result.path,'main.mjs'),'utf8'),
      /'\.\/src\/terrain-actor\.mjs'/);
    assert.match(readFileSync(join(result.path,'src','build-info.mjs'),'utf8'),
      new RegExp(COMMIT));
  });
});

test('the canonical root site stays intact and keeps its relative imports', () => {
  withRoot(root => {
    const before=['index.html','play-hunt.html','main.mjs','src/build-info.mjs'].map(p=>
      readFileSync(join(root,p),'utf8'));
    createVersionedLab(root,COMMIT);
    const after=['index.html','play-hunt.html','main.mjs','src/build-info.mjs'].map(p=>
      readFileSync(join(root,p),'utf8'));
    assert.deepEqual(after,before);
  });
});

test('mismatched source build stamp cannot produce a misleading release link', () => {
  withRoot(root => {
    assert.throws(()=>createVersionedLab(root,'a'.repeat(40)),
      /source build stamp does not match/);
    assert.equal(existsSync(join(root,'builds')),false);
  });
});

test('invalid release identifiers are rejected', () => {
  withRoot(root => {
    for(const sha of ['', '123', '../src', '0'.repeat(41)]) {
      assert.throws(()=>createVersionedLab(root,sha),TypeError);
    }
    assert.throws(()=>createVersionedLab('',COMMIT),TypeError);
  });
});

test('missing Play Hunt HTML blocks immutable release packaging',()=>{
  withRoot(root=>{
    rmSync(join(root,'play-hunt.html'));
    assert.throws(()=>createVersionedLab(root,COMMIT),
      /Missing V2 lab entry: play-hunt.html/);
  });
});

test('immutable Hunt page cannot silently load an external root module',()=>{
  withRoot(root=>{
    writeFileSync(join(root,'play-hunt.html'),
      '<span id="build">Build loading…</span>'+
      '<script type="module" src="/external-terrain-lab.mjs"></script>');
    assert.throws(()=>createVersionedLab(root,COMMIT),
      /local module/);
  });
});
