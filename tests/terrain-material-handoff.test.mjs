import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TERRAIN_ART_TILE_SIZE, MAX_TERRAIN_ART_PNG_BYTES, TERRAIN_ART_SLOTS,
  TERRAIN_ART_CHANNELS, terrainArtKey, validateTerrainArtFile,
  validateTerrainArtInput, inspectTerrainArtPngHeader
} from '../src/terrain-material-handoff.mjs';
import {
  createReferenceTerrainPixels, createReferenceMaterialPixels,
  createReferenceTerrainCanvas, createReferenceMaterialCanvas
} from '../src/terrain-reference-tiles.mjs';
import { compileTerrainTextureManifest } from '../src/terrain-texture-manifest.mjs';

const signature=[137,80,78,71,13,10,26,10];
function pngHeader(width=64,height=64) {
  const data=new Uint8Array(24);
  data.set(signature);
  data.set([0,0,0,13,73,72,68,82],8);
  const view=new DataView(data.buffer);
  view.setUint32(16,width,false);
  view.setUint32(20,height,false);
  return new Blob([data],{type:'image/png'});
}

test('all material preview slots and channels map onto actual manifest assets',()=>{
  assert.equal(TERRAIN_ART_TILE_SIZE,64);
  assert.equal(MAX_TERRAIN_ART_PNG_BYTES,256*1024);
  assert.equal(TERRAIN_ART_SLOTS.length,6);
  assert.deepEqual(TERRAIN_ART_CHANNELS,['albedo','normal','orm']);
  const manifest=compileTerrainTextureManifest(undefined,{tileSize:64});
  assert.ok(manifest.estimatedBytes<compileTerrainTextureManifest().estimatedBytes/10);
  for(const slot of TERRAIN_ART_SLOTS)for(const channel of TERRAIN_ART_CHANNELS) {
    const key=terrainArtKey(slot,channel);
    assert.ok(manifest.assets.some(asset=>asset.channel===channel && asset.key===key));
  }
  assert.throws(()=>terrainArtKey('../../v1','albedo'),RangeError);
  assert.throws(()=>terrainArtKey('grass/meadow','unsafe'),RangeError);
  assert.throws(()=>terrainArtKey('dirt/earth/normal','normal'),RangeError);
});

test('valid 64px PNG is verified before decoding and handed to the proper channel',async()=>{
  const png=pngHeader();
  assert.equal(validateTerrainArtFile(png),true);
  assert.equal(await inspectTerrainArtPngHeader(png),true);
  const asset=validateTerrainArtInput(png,{width:64,height:64},'grass/meadow','albedo');
  assert.deepEqual(asset,{channel:'albedo',key:'grass/meadow/albedo',tileSize:64});
  assert.equal(Object.isFrozen(asset),true);
  assert.deepEqual(validateTerrainArtInput(png,{width:64,height:64},'stone/bedrock','orm'),
    {channel:'orm',key:'stone/bedrock/orm',tileSize:64});
});

test('PNG preflight rejects wrong dimensions, invalid headers, oversized payload and non-PNG files',async()=>{
  const png=pngHeader();
  const invalid=[pngHeader(128,64),pngHeader(64,128),pngHeader(2048,2048)];
  for(const file of invalid) {
    await assert.rejects(inspectTerrainArtPngHeader(file),/64×64/);
  }
  const badHeader=new Uint8Array(24);
  const corrupt=new Blob([badHeader],{type:'image/png'});
  await assert.rejects(inspectTerrainArtPngHeader(corrupt),/PNG header/);
  const huge=new Blob([new Uint8Array(MAX_TERRAIN_ART_PNG_BYTES+1)],{type:'image/png'});
  await assert.rejects(inspectTerrainArtPngHeader(huge),/size limit/);
  const jpg=new Blob([new Uint8Array(24)],{type:'image/jpeg'});
  await assert.rejects(inspectTerrainArtPngHeader(jpg),/PNG/);
  assert.throws(()=>validateTerrainArtInput(png,{width:256,height:256},'dirt/earth','albedo'),
    /64×64/);
  assert.throws(()=>validateTerrainArtInput(png,{width:64,height:32},'dirt/earth','albedo'),
    /64×64/);
});

function fakeDocument() {
  let buffer=null;
  return {
    createElement(tag) {
      assert.equal(tag,'canvas');
      return {width:0,height:0,getContext(type) {
        assert.equal(type,'2d');
        return {
          createImageData(width,height) {
            buffer=new Uint8ClampedArray(width*height*4);
            return {data:buffer};
          },
          putImageData(image) {buffer=image.data.slice();}
        };
      }};
    },
    pixels:()=>buffer
  };
}

test('native 64px reference tiles preserve material-specific pixels and neutral preview channels',()=>{
  for(const kind of ['grass','grass-dark','roots','dirt','dirt-dark','stone']) {
    const documentRef=fakeDocument();
    const canvas=createReferenceTerrainCanvas(kind,documentRef,64);
    assert.deepEqual([canvas.width,canvas.height],[64,64]);
    assert.deepEqual(documentRef.pixels(),createReferenceTerrainPixels(kind,64));
    assert.deepEqual(createReferenceTerrainPixels(kind,64),
      createReferenceTerrainPixels(kind,64),'the preview is deterministic');
    for(const channel of ['normal','orm']) {
      const doc=fakeDocument();
      const material=createReferenceMaterialCanvas(kind,channel,doc,64);
      assert.deepEqual([material.width,material.height],[64,64]);
      assert.deepEqual(doc.pixels(),createReferenceMaterialPixels(kind,channel,64));
    }
  }
});

test('the live lab supplies preview-only materials without new voxel IDs or saved images',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const host=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.match(html,/id="terrain-material-slot"/);
  assert.match(html,/id="terrain-material-channel"/);
  assert.match(html,/id="terrain-material-file" type="file" accept="image\/png"/);
  assert.match(html,/id="terrain-material-clear"/);
  assert.match(host,/await inspectTerrainArtPngHeader\(file\)/);
  assert.match(host,/validateTerrainArtInput\(file, image, slot, channel\)/);
  assert.match(host,/applyTerrainMaterialPreview\(\)/);
  assert.match(host,/authoredMaterialTiles\.set\(identity/);
  assert.match(host,/gpuRenderer\.setTerrainMaterialTile\(tile\.channel, tile\.key, tile\.image\)/);
  assert.match(host,/createReferenceTerrainCanvas\(kind, document, TERRAIN_ART_TILE_SIZE\)/);
  assert.match(host,/materialRequestGeneration\+\+/);
  assert.doesNotMatch(host,/localStorage\.setItem\([^)]*terrain/i);
});
