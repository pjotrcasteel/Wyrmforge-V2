// V2.3 demo positions; their tunnel paths are *commands* handled by the
// same authoritative TerrainEditLedger as spheres and spell damage.
// No renderer/physics/world ownership lives here.
const TARGETS=Object.freeze({
  flat:Object.freeze({x:-6,y:0,z:0,toX:6,toY:0,toZ:0,radius:1.75}),
  hill:Object.freeze({x:-7,y:3,z:0,toX:7,toY:3,toZ:0,radius:2.2}),
  cliff:Object.freeze({x:-7,y:3,z:0,toX:7,toY:3,toZ:0,radius:2.2}),
  arch:Object.freeze({x:-6,y:5,z:2,toX:6,toY:5,toZ:2,radius:1.5})
});

export function demoTunnelTarget(scene) {
  if (typeof scene!=='string' || !Object.hasOwn(TARGETS,scene)) {
    throw new RangeError('Unknown V2 tunnel scene');
  }
  return {...TARGETS[scene]};
}
