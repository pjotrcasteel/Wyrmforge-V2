import {defineLightingEnvironment} from '../src/lighting/environment-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineSurface} from '../src/materials/surface-contract.mjs';
import {defineLightSet,MAX_LIGHT_EMITTERS} from '../src/lighting/light-contract.mjs';
import {BASELINE_LIGHTING_GLSL,UNLIT_LIGHTING_GLSL} from '../src/lighting/baseline-lighting.mjs';
import {assembleVoxelFragmentShader,WEBGL_V2_FRAGMENT_SHADER_SOURCE} from '../src/webgl-voxel-view.mjs';

test('surface values are immutable linear data with bounded channels and unit normals',()=>{
  const input={albedo:[.2,.3,.4],normal:[1,0,0],orm:[.8,.6,0],emission:[2,1,0]};
  const surface=defineSurface(input);
  input.albedo[0]=1;
  assert.equal(surface.albedo[0],.2);
  assert.ok(Object.isFrozen(surface)&&Object.isFrozen(surface.emission));
  for(const bad of [{albedo:[2,0,0]},{albedo:[0,0,0],normal:[0,0,0]},
    {albedo:[0,0,0],emission:[Infinity,0,0]}])assert.throws(()=>defineSurface(bad));
});

test('emitter snapshots have stable epoch/revision identity, bounded work and no mutable input aliases',()=>{
  const light={id:'lava-cell-1',position:[-2,3,4],radiance:[2,1,.2],radius:6};
  const set=defineLightSet({epoch:2,revision:7,emitters:[light]});
  light.position[0]=99;
  assert.equal(set.emitters[0].position[0],-2);
  assert.deepEqual([set.epoch,set.revision],[2,7]);
  assert.ok(Object.isFrozen(set.emitters));
  assert.throws(()=>defineLightSet({epoch:2,revision:7,emitters:[light,light]}));
  assert.throws(()=>defineLightSet({epoch:2,revision:7,emitters:[{...light,radius:33}]}));
  assert.throws(()=>defineLightSet({epoch:-1,revision:7}));
  assert.throws(()=>defineLightSet({epoch:0,revision:0,
    emitters:Array.from({length:MAX_LIGHT_EMITTERS+1},(_,id)=>({...light,id:String(id)}))}));
});

test('renderer can independently assemble baseline and unlit lighting with one output encoding',()=>{
  assert.equal(assembleVoxelFragmentShader(),WEBGL_V2_FRAGMENT_SHADER_SOURCE);
  const unlit=assembleVoxelFragmentShader(UNLIT_LIGHTING_GLSL);
  assert.ok(unlit.includes(UNLIT_LIGHTING_GLSL));
  assert.ok(!unlit.includes(BASELINE_LIGHTING_GLSL));
  assert.match(unlit,/linearToSrgbColor\(evaluateV2Lighting\(surface,context\)\)/);
  assert.throws(()=>assembleVoxelFragmentShader('void main(){}'));
  assert.throws(()=>assembleVoxelFragmentShader(' '.repeat(16385)));
});

test('new material and lighting contracts cannot transitively depend on mutable engines or GPU implementation',()=>{
  const root=fileURLToPath(new URL('../src/',import.meta.url));
  const pending=['materials/surface-contract.mjs','lighting/light-contract.mjs','lighting/baseline-lighting.mjs','lighting/environment-contract.mjs'];
  const visited=new Set();
  while(pending.length){
    const relative=pending.pop();
    if(visited.has(relative))continue;
    visited.add(relative);
    assert.match(relative,/^(materials|lighting)\//,'contract imports must stay in these pure ownership modules');
    const path=resolve(root,relative),source=readFileSync(path,'utf8');
    for(const [,target] of source.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s*)?['"]([^'"]+)['"]/gm)){
      const next=resolve(dirname(path),target);
      assert.ok(next.startsWith(root));
      pending.push(next.slice(root.length));
    }
  }
  for(const dir of ['world-generation','fluid']){
    for(const file of readdirSync(resolve(root,dir)).filter(name=>name.endsWith('.mjs'))){
      const source=readFileSync(resolve(root,dir,file),'utf8');
      assert.doesNotMatch(source,/from\s+['"][^'"]*(?:lighting\/|materials\/surface-contract)/,
        'existing owners must not acquire reverse lighting dependencies');
    }
  }
});

test('ambient environment is neutral in daylight, cooler in dim regions and immutable',()=>{
  assert.deepEqual(defineLightingEnvironment().ambient,[1,1,1]);
  const lair=defineLightingEnvironment({daylight:.45});
  assert.ok(lair.ambient[0]<lair.ambient[1]&&lair.ambient[1]<lair.ambient[2]);
  assert.ok(lair.ambient[0]>.7,'ambient still retains readable material detail');
  const color=[.8,.9,1],copied=defineLightingEnvironment({ambient:color});
  color[0]=0;assert.equal(copied.ambient[0],.8);
  assert.ok(Object.isFrozen(copied.ambient));
  for(const input of [{daylight:NaN},{daylight:-1},{ambient:[1,2,Infinity]},
    {ambient:[1,1,3]}])assert.throws(()=>defineLightingEnvironment(input));
});
