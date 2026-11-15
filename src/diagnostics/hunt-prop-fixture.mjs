import {HuntTreePreview} from '../hunt-tree-preview.mjs';

// Synthetic prop-heavy terrain fixture. Exercise the production prop layer
// and collision queries with deterministic flat support and no enemies.
export function createHuntPropFixture(groups,image){
  const ids=Array.from({length:groups},(_,i)=>'fixture-'+i);
  const graph={layout:{regions:[],links:[]},placement:id=>{
    const group=ids.indexOf(id);
    return {placements:Array.from({length:36},(_,i)=>({
      id:id+':'+i,kind:i%3===0?'boulder':'tree',seed:i*131,
      scale:1,footprint:{radius:i%3===0?.75:.46},
      position:{x:(i%6-2.5)*3+group*4,z:(Math.floor(i/6)-2.5)*3,y:5}
    }))};
  }};
  const tree=new HuntTreePreview(graph,image);
  const terrain={raycast:()=>({point:{y:5}})};
  for(const id of ids)tree.update(ids,terrain);
  return tree;
}
