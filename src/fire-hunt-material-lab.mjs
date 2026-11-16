// Appearance studies for the Fire Hunt. Candidate surfaces use existing V2
// voxel IDs as preview carriers. This module does not change terrain generation.
import {VoxelWorld} from './voxel-world.mjs';
import {TerrainEditLedger} from './terrain-edit-ledger.mjs';

const material=(id,name,group,voxel,slot,asset,usage)=>Object.freeze({id,name,group,voxel,slot,asset,usage});

export const FIRE_HUNT_MATERIALS=Object.freeze([
  material('grass','Moss and grass','Wet Forest',1,'grass/meadow','grass','Moist woodland ground and the top lip of mossy cliffs.'),
  material('grass-shade','Shaded moss','Wet Forest',1,'grass/meadow-dark','grass-shade','Low-contrast variation beneath canopy and around boulders.'),
  material('roots','Rooted bank','Wet Forest',1,'grass/rooted-soil','roots','Vertical soil banks directly below the grass lip.'),
  material('dirt','Trampled earth','Wet Forest',2,'dirt/earth','earth','Navigable paths and the upper layer of fresh craters.'),
  material('damp-dirt','Wet mud','Wet Forest',2,'dirt/earth-dark','mud','Low-lying damp patches and shaded pockets off the main trail.'),
  material('stone','Layered cliff rock','Wet Forest',3,'stone/bedrock','stone','Vertical cliff faces and rock exposed by deep excavation.'),
  material('bark','Forest bark','Wet Forest',1,'grass/meadow','bark','Vertical tree trunks and fallen wood surfaces.'),
  material('charred-bark','Charred bark','Scorched Approach',1,'grass/meadow','charred','Burned trunks and deadwood, with its grain oriented vertically.'),
  material('dark-rock','Dark fractured rock','Cliff study',3,'stone/bedrock','dark-rock','Cooler, cross-grain alternative for comparison on the same wall.')
]);

export const TERRAIN_BASE_TILES=Object.freeze({
  'grass/meadow':'grass','grass/meadow-dark':'grass-shade','grass/rooted-soil':'roots',
  'dirt/earth':'earth','dirt/earth-dark':'mud','stone/bedrock':'stone'
});

export const MATERIAL_LAB_TARGET=Object.freeze({x:1,y:2,z:-1});
export const MATERIAL_LAB_SPAWN=Object.freeze({x:.5,z:5});
export function createMaterialLabTerrain(materialId,scene,excavated=false,boundary='broken'){
  const material=FIRE_HUNT_MATERIALS.find(item=>item.id===materialId);
  if(!material||!['hunt','sample','repeats','layers','cliff'].includes(scene))throw new RangeError('Unknown material or scene');
  const world=new VoxelWorld();
  const radius={sample:3,repeats:7,layers:6,cliff:6,hunt:19}[scene];
  for(let x=-radius;x<radius;x++){
    for(let z=-radius;z<radius;z++){
      if(scene==='hunt'){
        const wallZ=-3+Math.round(1.6*Math.sin(x*.29));
        const shelf=z<wallZ;
        const height=shelf?6:2;
        const edgeOffset=boundary==='hard'?0:Math.round(.7*Math.sin(z*.9)+.55*Math.cos(z*.43));
        const path=Math.abs(x-edgeOffset)<=1;
        for(let y=0;y<=height;y++){
          const surface=y===height;
          world.set(x,y,z,surface?(path&&!shelf?2:1):y===height-1?2:3);
        }
      }else if(scene==='cliff'){
        const height=z<0?5:0;
        for(let y=0;y<=height;y++)world.set(x,y,z,y===5?1:y===4?2:3);
      }else if(scene==='layers'){
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
  const edit=(scene==='layers'||scene==='hunt')&&excavated?new TerrainEditLedger(world).apply({
    id:'material-lab-crater',type:'carve-crater',...(scene==='hunt'?MATERIAL_LAB_TARGET:{x:0,y:3,z:0}),radius:scene==='hunt'?2.3:3.5,depth:scene==='hunt'?2:3
  }):null;
  return {world,radius,highest:scene==='hunt'?7:scene==='cliff'?6:scene==='layers'?4:2,removedVoxels:edit?.removedVoxels??0};
}
