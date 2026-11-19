import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  HUNT_NORMAL_TILE_SIZE,HUNT_NORMAL_STUDIES,deriveHuntNormalPixels,
  createHuntNormalTileCanvas
} from '../src/materials/hunt-terrain-normal-tiles.mjs';
import {assembleVoxelFragmentShader} from '../src/webgl-voxel-view.mjs';
import {LOCAL_FIELD_LIGHTING_GLSL} from '../src/lighting/local-field-shader.mjs';
import {TRANSIENT_LIGHTING_GLSL} from '../src/lighting/transient-lighting.mjs';

const N=HUNT_NORMAL_TILE_SIZE;
function authoredStudy(){
  const pixels=new Uint8ClampedArray(N*N*4);
  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){
      const height=128+49*Math.sin(x*2*Math.PI/N)+
        34*Math.sin(y*4*Math.PI/N)+18*Math.cos((x+y)*2*Math.PI/N);
      const at=(y*N+x)*4;
      pixels[at]=Math.round(height);
      pixels[at+1]=Math.round(height);
      pixels[at+2]=Math.round(height);
      pixels[at+3]=255;
    }
  }
  return pixels;
}
test('six mobile art studies map to distinct actual terrain normal slots',()=>{
  assert.equal(HUNT_NORMAL_STUDIES.length,6);
  assert.equal(new Set(HUNT_NORMAL_STUDIES.map(s=>s.slot)).size,6);
  for(const profile of HUNT_NORMAL_STUDIES){
    assert.ok(profile.slope>0&&profile.slope<=5);
    assert.ok(profile.source.length>0);
  }
  assert.ok(HUNT_NORMAL_STUDIES[0].slope<HUNT_NORMAL_STUDIES.at(-1).slope,
    'grass must have less relief strength than cliff stone');
});
test('derived 64px tangents are normalized, bounded and nonflat under varied art',()=>{
  const source=authoredStudy();
  for(const slope of [1.25,3.7]){
    const result=deriveHuntNormalPixels(source,{slope});
    assert.equal(result.length,N*N*4);
    const seen=new Set();
    for(let i=0;i<result.length;i+=4){
      const x=result[i]/127.5-1,y=result[i+1]/127.5-1,z=result[i+2]/127.5-1;
      assert.ok(Math.abs(Math.hypot(x,y,z)-1)<.013);
      assert.ok(z>.67,'front-facing detail cannot turn a true cliff surface inside out');
      assert.equal(result[i+3],255);
      seen.add(result[i]+','+result[i+1]);
    }
    assert.ok(seen.size>16,'nonuniform material must have visible normal variation');
  }
  const grass=deriveHuntNormalPixels(source,{slope:1.25});
  const stone=deriveHuntNormalPixels(source,{slope:3.7});
  assert.ok(Math.abs(stone[0]-128)>Math.abs(grass[0]-128),
    'stone bumps should have more normal slope than grass');
});
test('toroidal normal generation uses repeated neighbours without hard tile seams',()=>{
  const result=deriveHuntNormalPixels(authoredStudy(),{slope:2.8});
  let error=0;
  for(let y=0;y<N;y++){
    for(let c=0;c<3;c++){
      error+=Math.abs(result[(y*N)*4+c]-result[(y*N+N-1)*4+c]);
    }
  }
  assert.ok(error/(N*3)<8,'wrapped gradients should not make a sharp normal seam');
});
test('flat source remains a neutral geometric normal and parameters validate',()=>{
  const flat=new Uint8ClampedArray(N*N*4).fill(145);
  for(let i=3;i<flat.length;i+=4)flat[i]=255;
  const normals=deriveHuntNormalPixels(flat);
  for(let i=0;i<normals.length;i+=4){
    assert.ok(Math.abs(normals[i]-128)<=1);
    assert.ok(Math.abs(normals[i+1]-128)<=1);
    assert.equal(normals[i+2],255);
  }
  assert.throws(()=>deriveHuntNormalPixels(new Uint8Array(4)),TypeError);
  assert.throws(()=>deriveHuntNormalPixels(flat,{slope:0}),TypeError);
  assert.throws(()=>deriveHuntNormalPixels(flat,{slope:6}),TypeError);
});
test('DOM texture adapter writes a real 64px TexImageSource exactly once',()=>{
  const original=authoredStudy();
  const calls=[];
  const canvas={width:0,height:0,getContext:()=>{
    return {
      drawImage:(...args)=>calls.push(['draw',...args]),
      getImageData:()=>({data:new Uint8ClampedArray(original)}),
      putImageData:image=>calls.push(['pixels',image.data])
    };
  }};
  const out=createHuntNormalTileCanvas({width:N,height:N},{slope:2.5,createCanvas:()=>canvas});
  assert.equal(out,canvas);
  assert.deepEqual([canvas.width,canvas.height],[64,64]);
  assert.equal(calls.filter(x=>x[0]==='draw').length,1);
  assert.equal(calls.filter(x=>x[0]==='pixels').length,1);
  assert.ok(calls.find(x=>x[0]==='pixels')[1][2]>=170);
  assert.throws(()=>createHuntNormalTileCanvas({width:1024,height:1024},{createCanvas:()=>canvas}),RangeError);
});
test('actual Hunt uses real uploaded normals even with procedural dirt albedo',()=>{
  const fragment=assembleVoxelFragmentShader(LOCAL_FIELD_LIGHTING_GLSL);
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  const renderer=readFileSync(new URL('../src/webgl-voxel-view.mjs',import.meta.url),'utf8');
  assert.match(fragment,/uniform highp sampler2DArray uTerrainNormal/);
  assert.match(fragment,/uniform bool uTerrainNormalsEnabled/);
  assert.match(fragment,/if \(uTerrainNormalsEnabled && normalLayer >= 0\.0\)/);
  assert.doesNotMatch(fragment,/if \(layer >= 0\.0 && normalLayer >= 0\.0\)/);
  assert.match(fragment,/uTerrainNormalsEnabled&&normalLayer>=0\.0/);
  assert.match(fragment,/vec3 b = abs\(n\.y\) > 0\.5 \? vec3\(0\.0, 0\.0, 1\.0\) : vec3\(0\.0, 1\.0, 0\.0\)/);
  assert.match(fragment,/t \* tangentNormal\.x \+ b \* tangentNormal\.y/);
  assert.match(LOCAL_FIELD_LIGHTING_GLSL,/evaluateBaselineLighting\(surface,context\)/);
  assert.match(TRANSIENT_LIGHTING_GLSL,/dot\(surface\.normal,delta/);
  assert.match(renderer,/get terrainNormalDiagnostics\(\)/);
  assert.match(renderer,/gl\.uniform1i\(this\.\#uniforms\.terrainNormalEnabled/);
  assert.match(host,/HUNT_NORMAL_STUDIES\.map\(async study/);
  assert.match(host,/setTerrainMaterialTile\('normal',terrainArtKey\(study\.slot,'normal'\),image\)/);
  assert.match(host,/terrainNormalsEnabled,/);
  assert.match(host,/playQuery\.get\('terrainNormals'\)!=='off'/);
  assert.match(host,/window\.__WyrmforgeTerrainNormalTest=/);
});

test('browser screenshot witness refuses to compare a partially loaded HUD',()=>{
  const witness=readFileSync(new URL('../.github/witness/terrain-normal-hunt.mjs',import.meta.url),'utf8');
  assert.match(witness,/fluidTest=auto/);
  assert.match(witness,/fluid\?\.kind==='water'/);
  assert.match(witness,/fluid\.raisedSurfaceFaces>0/);
  assert.match(witness,/!fluid\.busy/);
  assert.match(witness,/__WyrmforgeFluidTest\.hold\(true\)/);
  assert.match(witness,/st\.activeLayers===4/);
});
