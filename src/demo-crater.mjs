// V2-native deterministic crater inspection fixtures, not gameplay ownership.
// Every command is executed by the existing TerrainEditLedger.
const TARGETS=Object.freeze({
  flat:Object.freeze({x:0,y:1,z:0,radius:4.5,depth:4}),
  hill:Object.freeze({x:0,y:7,z:0,radius:4.5,depth:4}),
  cliff:Object.freeze({x:5,y:9,z:0,radius:4.5,depth:4}),
  arch:Object.freeze({x:5,y:8,z:2,radius:3.5,depth:3})
});

export function demoCraterTarget(scene) {
  if(typeof scene!=='string' || !Object.hasOwn(TARGETS,scene)) {
    throw new RangeError('Unknown V2 crater scene');
  }
  return {...TARGETS[scene]};
}
