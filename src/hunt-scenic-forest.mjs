import {getCameraPreset,projectVoxel} from './camera-presets.mjs';
import {containsHuntLandform} from './world-generation/hunt-landform-footprint.mjs';
import {LIVE_TREES} from './wet-forest-tree-sprites.mjs';

const SPACING=3;
const ELEVATION=5;
const MAX_SCALE=1.12;
const hashCell=(x,z)=>(Math.imul(x,73856093)^Math.imul(z,19349663))>>>0;
const EDGE_TREES=LIVE_TREES.filter(sprite=>!sprite.name.includes('pine'));
// Include roots beyond every screen edge when any part of a crown is visible.
const LEFT=Math.max(...LIVE_TREES.map(s=>s.ax))*MAX_SCALE/32;
const RIGHT=Math.max(...LIVE_TREES.map(s=>s.w-s.ax))*MAX_SCALE/32;
const UP=Math.max(...LIVE_TREES.map(s=>s.ay))*MAX_SCALE/32;
const DOWN=Math.max(...LIVE_TREES.map(s=>s.h-s.ay))*MAX_SCALE/32;

export function scenicForestWindow(view){
  if(view.camera!=='hunt')return null;
  const origin=projectVoxel(0,ELEVATION,0,view);
  const dz=getCameraPreset('hunt').down[2];
  return {
    minX:Math.floor((-origin.x/view.scale-RIGHT)/SPACING),
    maxX:Math.floor(((view.width-origin.x)/view.scale+LEFT)/SPACING),
    minZ:Math.floor((-origin.y/view.scale-DOWN)/dz/SPACING),
    maxZ:Math.floor(((view.height-origin.y)/view.scale+UP)/dz/SPACING)
  };
}

// Scenic roots are outside the entire planned landform, including connectors
// and nonresident regions. Camera movement and terrain destruction cannot
// change their identity or make replacement trees appear in playable land.
export class ScenicForest {
  #bands;
  #key='';
  #trees=[];
  constructor(layout){this.#bands=[...layout.regions,...layout.links];}
  trees(view){
    const window=scenicForestWindow(view);
    if(!window)return [];
    const key=Object.values(window).join(',');
    if(key===this.#key)return this.#trees;
    const {minX,maxX,minZ,maxZ}=window;
    const bands=this.#bands.filter(({bounds:b})=>
      b.maxX>=minX*SPACING-3&&b.minX<=(maxX+1)*SPACING+3&&
      b.maxZ>=minZ*SPACING-3&&b.minZ<=(maxZ+1)*SPACING+3);
    const inside=(x,z)=>bands.some(band=>containsHuntLandform(band,x,z));
    const trees=[];
    for(let row=minZ;row<=maxZ;row++)for(let col=minX;col<=maxX;col++){
      const hash=hashCell(col,row);
      const x=col*SPACING+.45+(hash%211)/100;
      const z=row*SPACING+.45+((hash>>>8)%211)/100;
      if(inside(x,z))continue;
      const nearLand=inside(x-3,z)||inside(x+3,z)||inside(x,z-3)||inside(x,z+3);
      // Lower, fuller crowns at the rim break up the dirt silhouette without
      // placing the tallest pine wall across the entry or a readable route.
      const sprites=nearLand?EDGE_TREES:LIVE_TREES;
      trees.push({id:`scenery:${col}:${row}`,x,y:ELEVATION,z,
        scale:nearLand?.8+((hash>>>12)%5)*.06:.88+((hash>>>12)%5)*.06,
        sprite:sprites[(hash>>>16)%sprites.length],scenic:true});
    }
    this.#key=key;
    this.#trees=trees;
    return trees;
  }
}

export function projectTreeSprite(tree,view){
  const foot=projectVoxel(tree.x,tree.y,tree.z,view);
  const {sprite}=tree;
  const scale=view.scale*tree.scale/32;
  const x=Math.round(foot.x-sprite.ax*scale),y=Math.round(foot.y-sprite.ay*scale);
  const w=Math.round(sprite.w*scale),h=Math.round(sprite.h*scale);
  if(x+w<=0||x>=view.width||y+h<=0||y>=view.height)return null;
  return {depth:foot.depth,x,y,w,h,sprite};
}
