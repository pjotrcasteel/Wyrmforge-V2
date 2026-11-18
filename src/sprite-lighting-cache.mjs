// Rendering owns Canvas resources and colour conversion; no world/solver imports.
import {srgbToLinear,linearToSrgb} from './terrain-color-space.mjs';
const DECODE=Float32Array.from({length:256},(_,i)=>srgbToLinear(i/255));
export const SPRITE_LIGHT_CACHE_BYTES=8*1024*1024;
export const SPRITE_LIGHT_FRAME_PIXELS=65536;
const quantize=light=>light.map(n=>Math.round(Math.max(0,Math.min(4,n))*16)/16);
export function tintSpritePixels(data,light){
  const tables=light.map(factor=>Uint8ClampedArray.from(DECODE,value=>
    Math.round(255*linearToSrgb(Math.min(1,value*factor)))));
  const result=new Uint8ClampedArray(data);
  for(let i=0;i<result.length;i+=4){
    for(let channel=0;channel<3;channel++)result[i+channel]=tables[channel][data[i+channel]];
  }
  return result;
}
export function litSpriteColor(hex,light){
  const bytes=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16));
  return '#'+bytes.map((value,i)=>Math.round(255*linearToSrgb(Math.min(1,DECODE[value]*light[i])))
    .toString(16).padStart(2,'0')).join('');
}
function canvasFor(width,height){
  if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
}
export class SpriteLightingCache {
  #factory;#image=null;#bases=new Map();#tints=new Map();#bytes=0;#baseBytes=0;#work=0;
  #fallbackDraws=0;#untintedDraws=0;
  constructor(factory=canvasFor){this.#factory=factory;}
  beginFrame(){this.#work=0;this.#fallbackDraws=0;this.#untintedDraws=0;}
  get statistics(){return {bytes:this.#bytes,entries:this.#tints.size,
    framePixels:this.#work,fallbackDraws:this.#fallbackDraws,
    untintedDraws:this.#untintedDraws};}
  clear(){this.#bases.clear();this.#tints.clear();this.#bytes=0;this.#baseBytes=0;this.#image=null;}
  draw(ctx,image,sprite,rect,light,fallback=light){
    if(this.#image!==image){this.clear();this.#image=image;}
    const crop=[sprite.x,sprite.y,sprite.w,sprite.h].join(':');
    const tint=quantize(light),key=crop+':'+tint.join(':');
    let cached=this.#tints.get(key);
    if(cached){this.#tints.delete(key);this.#tints.set(key,cached);}
    if(!cached&&sprite.w*sprite.h<=SPRITE_LIGHT_FRAME_PIXELS){
      let base=this.#bases.get(crop);
      const pixels=sprite.w*sprite.h;
      const needed=pixels*(base?1:2);
      if(this.#work+needed<=SPRITE_LIGHT_FRAME_PIXELS){
        if(!base){
          const canvas=this.#factory(sprite.w,sprite.h),context=canvas.getContext('2d');
          context.drawImage(image,sprite.x,sprite.y,sprite.w,sprite.h,0,0,sprite.w,sprite.h);
          base=context.getImageData(0,0,sprite.w,sprite.h).data;
          if(this.#bases.size<32&&this.#baseBytes+base.byteLength<=2*1024*1024){
            this.#bases.set(crop,base);this.#bytes+=base.byteLength;this.#baseBytes+=base.byteLength;
          }
        }
        const canvas=this.#factory(sprite.w,sprite.h),context=canvas.getContext('2d');
        const output=context.createImageData(sprite.w,sprite.h);
        output.data.set(tintSpritePixels(base,tint));context.putImageData(output,0,0);
        cached={canvas,bytes:pixels*4,light:tint};this.#work+=needed;
        while(this.#tints.size&&(this.#tints.size>=48||this.#bytes+cached.bytes>SPRITE_LIGHT_CACHE_BYTES)){
          const oldest=this.#tints.keys().next().value;this.#bytes-=this.#tints.get(oldest).bytes;this.#tints.delete(oldest);
        }
        if(this.#bytes+cached.bytes<=SPRITE_LIGHT_CACHE_BYTES){this.#tints.set(key,cached);this.#bytes+=cached.bytes;}
      }
    }
    if(!cached){
      cached=this.#tints.get(crop+':'+quantize(fallback).join(':'));
      if(!cached){
        // On a busy mobile frame, NEVER flash back to the original bright
        // sprite when only the exact tint changed. Reuse the closest warmed
        // variant for this crop until the bounded tint job can run.
        let nearest=null,score=Infinity,nearestKey=null;
        for(const [candidateKey,item] of this.#tints){
          if(!candidateKey.startsWith(crop+':')||!item.light)continue;
          const distance=item.light.reduce((sum,v,i)=>sum+(v-tint[i])**2,0);
          if(distance<score){score=distance;nearest=item;nearestKey=candidateKey;}
        }
        cached=nearest;
        if(nearestKey){
          this.#tints.delete(nearestKey);
          this.#tints.set(nearestKey,nearest);
        }
      }
      if(cached)this.#fallbackDraws++;
    }
    if(cached)ctx.drawImage(cached.canvas,0,0,sprite.w,sprite.h,...rect);
    else{
      this.#untintedDraws++;
      ctx.drawImage(image,sprite.x,sprite.y,sprite.w,sprite.h,...rect);
    }
  }
}
