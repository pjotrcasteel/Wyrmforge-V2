import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectVoxel } from '../src/camera-presets.mjs';
import {
  fitWorldgenSiteView, clampWorldgenViewZoom,
  WORLDGEN_VIEW_ZOOM_MIN, WORLDGEN_VIEW_ZOOM_MAX
} from '../src/diagnostics/worldgen-viewport.mjs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite } from '../src/world-generation/index.mjs';

const mapKinds=['wet-forest','forest-highland','mountain-pass'];
const sizes=[
  {width:650,height:970},  // iPhone CSS viewport rendered at DPR 2
  {width:780,height:1240},
  {width:1180,height:720}, // landscape/tablet
  {width:340,height:500}   // reduced embedded browser viewport
];

test('actual generated 3D bounds fit in portrait and landscape, including tall mountain peaks',()=>{
  for(const kind of mapKinds) {
    const site=generateWorldSite(createWorldSiteRecipe({kind,seed:7}));
    const {footprint}=site.layout;
    for(const camera of ['inspection','hunt']) for(const {width,height} of sizes) {
      const fit=fitWorldgenSiteView({width,height,footprint,camera});
      assert.ok(Number.isFinite(fit.scale) && fit.scale>0);
      assert.ok(fit.widthPixels<=width*0.91+1e-5);
      assert.ok(fit.heightPixels<=height*0.82+1e-5);
      assert.ok(Number.isFinite(fit.panX) && Number.isFinite(fit.panY));
      // All 8 solid corners must be visible, not just the heightmap plane.
      for(const x of [footprint.minX,footprint.maxX+1]) {
        for(const y of [footprint.minY,footprint.maxY+1]) {
          for(const z of [footprint.minZ,footprint.maxZ+1]) {
            const projected=projectVoxel(x,y,z,{
              width,height,scale:fit.scale,panX:fit.panX,panY:fit.panY,camera
            });
            assert.ok(projected.x>=width*0.04-0.01 && projected.x<=width*0.96+0.01,
              kind+' '+camera+' x '+x+','+y+','+z);
            assert.ok(projected.y>=height*0.08-0.01 && projected.y<=height*0.92+0.01,
              kind+' '+camera+' y '+x+','+y+','+z);
          }
        }
      }
    }
  }
});

test('fitted camera moves the elevated mountain center into the available screen',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({
    kind:'mountain-pass',seed:7,chunkEdge:32
  }));
  const footprint=site.layout.footprint;
  const fit=fitWorldgenSiteView({width:700,height:900,footprint,camera:'inspection'});
  assert.ok(fit.panY>0,'mountain elevation needs a downwards screen correction');
  const fitted=projectVoxel(0,0,0,{
    width:700,height:900,scale:fit.scale,
    panX:fit.panX,panY:fit.panY,camera:'inspection'
  });
  assert.ok(Number.isFinite(fitted.y));
  assert.ok(fit.widthPixels>450,'the map should use most of mobile display width');
});

test('zoom controls clamp safely and reject nonfinite gestures',()=>{
  assert.equal(clampWorldgenViewZoom(1.25),1.25);
  assert.equal(clampWorldgenViewZoom(0.01),WORLDGEN_VIEW_ZOOM_MIN);
  assert.equal(clampWorldgenViewZoom(100),WORLDGEN_VIEW_ZOOM_MAX);
  for(const invalid of [NaN,Infinity,-Infinity,undefined]) {
    assert.throws(()=>clampWorldgenViewZoom(invalid),RangeError);
  }
  const fixture={minX:-20,maxX:19,minY:-3,maxY:30,minZ:-20,maxZ:19};
  for(const invalid of [
    {width:0,height:700,footprint:fixture},
    {width:-1,height:700,footprint:fixture},
    {width:400,height:0,footprint:fixture},
    {width:400,height:700,footprint:{...fixture,maxX:-30}},
    {width:400,height:700,footprint:null},
    {width:400,height:700,footprint:fixture,horizontalFill:1.2}
  ]) assert.throws(()=>fitWorldgenSiteView(invalid));
  assert.throws(()=>fitWorldgenSiteView({
    width:400,height:700,footprint:fixture,camera:'unknown'
  }),RangeError);
});

test('mobile page gives map full flex height, collapses controls and has accessible focus mode',()=>{
  const html=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');
  assert.match(html,/body\{height:100dvh/);
  assert.match(html,/#preview-stage\{flex:1;min-height:0/);
  assert.match(html,/#controls\{position:absolute/);
  assert.match(html,/<details id="controls"/);
  assert.doesNotMatch(html,/<details id="controls"[^>]* open/);
  assert.match(html,/<summary>Map settings &amp; actions<\/summary>/);
  assert.match(html,/id="preview-message" role="status"/);
  assert.match(html,/id="focus-view" type="button" aria-pressed="false"/);
  assert.match(html,/id="fit-view" type="button"/);
  assert.match(html,/id="zoom-in"/);
  assert.match(html,/id="zoom-out"/);
  assert.match(html,/body\.focus-mode header\{display:none\}/);
  assert.match(html,/canvas\{[^}]*touch-action:none/);
  assert.doesNotMatch(html,/<footer>/,'footer no longer consumes gameplay screen space');
});

test('viewer fits actual site footprint and handles touch gestures without regenerating maps',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(host,/import \{[\s\S]*?fitWorldgenSiteView, clampWorldgenViewZoom/);
  assert.match(host,/const inspected=generatedSite\?\?expeditionSite/);
  assert.match(host,/footprint:inspected\.layout\.footprint,camera/);
  assert.match(host,/scale,panX,panY,camera/);
  assert.match(host,/const activePointers=new Map\(\)/);
  assert.match(host,/canvas\.addEventListener\('pointerdown'/);
  assert.match(host,/canvas\.addEventListener\('pointermove'/);
  assert.match(host,/canvas\.addEventListener\('pointercancel',releasePointer\)/);
  assert.match(host,/focusButton\.setAttribute\('aria-pressed',String\(focused\)\)/);
  assert.match(host,/setPreviewStatus\('V2\.6 error:/);
  assert.match(host,/controls\.open=false/);
  assert.doesNotMatch(host,/fitButton\.addEventListener\('click',resetSite\)/);
  assert.doesNotMatch(host,/focusButton\.addEventListener\('click',resetSite\)/);
});
