// V2 LAB DIAGNOSTICS ONLY — not the Wyrmforge Character Visibility engine.
// Draw a tiny collision-aligned debug actor, not a scaled-up sprite. The
// actor's actual height and footprint are defined by V2 actor physics.
// Pixel-accurate occlusion / emissive silhouettes belong to another system.
import { projectVoxel } from '../camera-presets.mjs';
import { ACTOR_HALF_WIDTH, ACTOR_HEIGHT } from '../terrain-actor.mjs';

const BOX_EDGES = Object.freeze([
  [0,1],[1,3],[3,2],[2,0], // floor
  [4,5],[5,7],[7,6],[6,4], // roof
  [0,4],[1,5],[2,6],[3,7]
]);

export function projectActorDiagnostic(actor, view) {
  if (!actor || ![actor.x, actor.y, actor.z].every(Number.isFinite) ||
      !view || ![view.width,view.height,view.scale,view.panX,view.panY]
        .every(Number.isFinite) || view.scale <= 0) {
    throw new TypeError('Expected a finite V2 actor and camera view');
  }
  const foot = projectVoxel(actor.x,actor.y,actor.z,view);
  const top = projectVoxel(actor.x,actor.y+ACTOR_HEIGHT,actor.z,view);
  if (!(foot.y > top.y)) {
    throw new RangeError('V2 diagnostic actor camera must project up as up');
  }

  const corners=[];
  // Matching vertex order for our 12 edge pairs: bottom 0..3, top 4..7.
  for (const y of [actor.y,actor.y+ACTOR_HEIGHT]) {
    for (const z of [actor.z-ACTOR_HALF_WIDTH, actor.z+ACTOR_HALF_WIDTH]) {
      for (const x of [actor.x-ACTOR_HALF_WIDTH, actor.x+ACTOR_HALF_WIDTH]) {
        corners.push(projectVoxel(x,y,z,view));
      }
    }
  }
  const screenWidth=Math.max(0.01,
    Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)));
  const height=foot.y-top.y; // NO minimum pixel size: it distorted collisions.
  const headRadius=Math.min(height*0.18,screenWidth*0.23);
  const headCenterY=top.y+headRadius;
  const bodyTop=headCenterY+headRadius;
  const bodyHeight=foot.y-bodyTop;
  const bodyWidth=screenWidth*0.72;
  if (bodyHeight <= 0 || !Number.isFinite(headRadius)) {
    throw new RangeError('Projected V2 collision volume is too small');
  }
  return {
    foot,top,
    colliderHeight:ACTOR_HEIGHT,
    colliderHalfWidth:ACTOR_HALF_WIDTH,
    projectedHeight:height,
    head:{x:top.x,y:headCenterY,radius:headRadius},
    torso:{x:foot.x-bodyWidth/2,y:bodyTop,width:bodyWidth,height:bodyHeight},
    boxEdges:BOX_EDGES.map(([a,b])=>[corners[a],corners[b]])
  };
}
