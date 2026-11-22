import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  SHADOW_STAMP_PIXELS,shadowStampAlpha,makeShadowStampPixels,
  getShadowStampTexture,paintSoftShadowStamp
} from '../src/shadow-stamp-texture.mjs';

test('one shared small shadow tile fades smoothly to transparent on every edge',()=>{
  assert.equal(SHADOW_STAMP_PIXELS,24);
  const size=SHADOW_STAMP_PIXELS;
  const pixels=makeShadowStampPixels();
  assert.equal(pixels.byteLength,size*size*4);
  const alpha=(x,y)=>pixels[(y*size+x)*4+3];
  assert.ok(alpha(11,11)>=230,'the central contact root must remain visible');
  assert.equal(alpha(0,0),0);
  assert.equal(alpha(0,12),0);
  assert.equal(alpha(23,23),0);
  assert.ok(alpha(6,12)>0&&alpha(6,12)<alpha(11,12),
    'caster edges should soften rather than leave hard dark squares');
  for(let i=0;i<pixels.length;i+=4){
    assert.deepEqual([...pixels.subarray(i,i+3)],[7,13,18]);
    assert.ok(pixels[i+3]>=0&&pixels[i+3]<=255);
  }
  assert.throws(()=>makeShadowStampPixels(512),RangeError);
  assert.throws(()=>shadowStampAlpha(0,0,0),RangeError);
});

test('shared stamp bitmap is allocated just once, not for every prop or Hunt frame',()=>{
  const previous=globalThis.document;
  let canvases=0,draws=0,pixelBytes=0;
  const canvas={width:0,height:0,getContext:()=>({
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    putImageData:image=>{draws++;pixelBytes=image.data.byteLength;}
  })};
  try{
    globalThis.document={createElement:()=>{
      canvases++;
      return canvas;
    }};
    const first=getShadowStampTexture();
    const second=getShadowStampTexture();
    assert.equal(first,second);
    assert.equal(canvases,1);
    assert.equal(draws,1);
    assert.equal(pixelBytes,24*24*4);
    assert.deepEqual([first.width,first.height],[24,24]);
    let drawn=0;
    const ctx={
      globalAlpha:0,drawImage:(image,x,y,w,h)=>{
        assert.equal(image,first);
        assert.deepEqual([x,y,w,h],[15,19,12,9]);
        drawn++;
      },
      fillRect:()=>{throw new Error('The browser must never use rectangle shadows');}
    };
    for(let frame=0;frame<10;frame++){
      assert.equal(paintSoftShadowStamp(ctx,15,19,12,9,.35),true);
    }
    assert.equal(drawn,10);
    assert.equal(canvases,1,'the same 24px tile must be reused every frame');
    assert.equal(ctx.globalAlpha,.35);
    assert.equal(paintSoftShadowStamp(ctx,15,19,12,9,0),false);
    assert.equal(drawn,10);
  }finally{
    globalThis.document=previous;
  }
});

test('when Canvas texture support is missing headless fixtures keep the physical receiver fallback',()=>{
  const ctx={globalAlpha:0,fillRect(...args){this.fallback=args;}};
  assert.equal(paintSoftShadowStamp(ctx,2,3,8,5,.8),true);
  assert.deepEqual(ctx.fallback,[2,3,8,5]);
  assert.equal(ctx.globalAlpha,.8);
});

test('both physical shadow renderers use one shared soft mask, not fillRect on browsers',()=>{
  for(const path of ['../src/terrain-contact-shadow-cache.mjs',
    '../src/terrain-directional-shadow-cache.mjs']){
    const source=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.match(source,/import \{paintSoftShadowStamp\} from '\.\/shadow-stamp-texture\.mjs'/);
    assert.match(source,/ctx\.imageSmoothingEnabled=true/);
    assert.match(source,/paintSoftShadowStamp\(ctx,/);
    assert.doesNotMatch(source,/ctx\.fillRect\(/);
  }
});
