// Appearance studies for the Fire Hunt. Candidate surfaces use existing V2
// voxel IDs as preview carriers. This module does not change terrain generation.
import {VoxelWorld} from './voxel-world.mjs';
import {TerrainEditLedger} from './terrain-edit-ledger.mjs';

export const FIRE_HUNT_MATERIALS=Object.freeze([
  {id:'grass',name:'Wet Forest grass',group:'Wet Forest',voxel:1,slot:'grass/meadow'},
  {id:'grass-shade',name:'Shaded grass',group:'Wet Forest',voxel:1,slot:'grass/meadow-dark'},
  {id:'roots',name:'Rooted soil · grass edge',group:'Wet Forest',voxel:1,slot:'grass/rooted-soil'},
  {id:'dirt',name:'Trail dirt',group:'Wet Forest',voxel:2,slot:'dirt/earth'},
  {id:'damp-dirt',name:'Damp forest soil',group:'Wet Forest',voxel:2,slot:'dirt/earth-dark'},
  {id:'stone',name:'Cliff stone',group:'Wet Forest',voxel:3,slot:'stone/bedrock'},
  {id:'bark',name:'Forest bark',group:'Forest props',voxel:3,slot:'stone/bedrock',swatch:[82,62,43]},
  {id:'charred-bark',name:'Charred bark',group:'Scorched Approach',voxel:3,slot:'stone/bedrock',swatch:[48,38,32]},
  {id:'scorched-soil',name:'Scorched soil',group:'Scorched Approach',voxel:2,slot:'dirt/earth',swatch:[79,51,40]},
  {id:'ash',name:'Ash',group:'Scorched Approach',voxel:2,slot:'dirt/earth',swatch:[119,108,99]},
  {id:'basalt',name:'Volcanic basalt',group:'Volcanic Lair',voxel:3,slot:'stone/bedrock',swatch:[58,56,61]},
  {id:'lava-crust',name:'Cooled lava crust',group:'Volcanic Lair',voxel:3,slot:'stone/bedrock',swatch:[64,42,37]},
  {id:'lava',name:'Molten lava',group:'Volcanic Lair',voxel:3,slot:'stone/bedrock',swatch:[222,83,24]}
].map(material=>Object.freeze({...material,...(material.swatch?{swatch:Object.freeze(material.swatch)}:{})})));

export function createMaterialLabTerrain(materialId,scene,excavated=false){
  const material=FIRE_HUNT_MATERIALS.find(item=>item.id===materialId);
  if(!material||!['sample','repeats','layers'].includes(scene))throw new RangeError('Unknown material or scene');
  const world=new VoxelWorld();
  const radius={sample:3,repeats:7,layers:6}[scene];
  for(let x=-radius;x<radius;x++){
    for(let z=-radius;z<radius;z++){
      if(scene==='layers'){
        world.set(x,0,z,3);
        world.set(x,1,z,3);
        world.set(x,2,z,2);
        world.set(x,3,z,material.voxel);
      }else{
        const height=scene==='sample'&&z>=0?0:1;
        for(let y=0;y<=height;y++)world.set(x,y,z,material.voxel);
      }
    }
  }
  const edit=scene==='layers'&&excavated?new TerrainEditLedger(world).apply({
    id:'material-lab-crater',type:'carve-crater',x:0,y:3,z:0,radius:3.5,depth:3
  }):null;
  return {world,radius,highest:scene==='layers'?4:2,removedVoxels:edit?.removedVoxels??0};
}
