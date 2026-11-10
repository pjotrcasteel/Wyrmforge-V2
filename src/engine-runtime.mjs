// V2.6 composition boundary: the runtime depends on contracts, not engines.
// No voxel-world, renderer, DOM, or physics implementation imports.
export const ENGINE_RUNTIME_SCHEMA='wyrmforge.engine-runtime.v1';
export const ENGINE_KINDS=Object.freeze([
  'terrain','physics','lighting','vfx','audio','navigation','rendering','worldGeneration'
]);
const TERRAIN_CONSUMERS=new Set(['physics','lighting','vfx','audio','navigation']);
function assertEngine(kind,engine) {
  if(!engine || typeof engine.start!=='function' ||
     typeof engine.stop!=='function' || typeof engine.dispose!=='function') {
    throw new TypeError(kind+' must provide start, stop and dispose');
  }
  if(kind==='terrain' && (typeof engine.subscribe!=='function' ||
      typeof engine.apply!=='function')) {
    throw new TypeError('Terrain engine must provide subscribe and apply');
  }
  if(TERRAIN_CONSUMERS.has(kind) && typeof engine.onTerrainChange!=='function') {
    throw new TypeError(kind+' must handle terrain changes');
  }
}
export function createEngineRuntime(implementations) {
  if(!implementations || typeof implementations!=='object' ||
      !implementations.terrain) throw new TypeError('Terrain engine required');
  const entries=ENGINE_KINDS.filter(kind=>implementations[kind]!==undefined)
    .map(kind=>[kind,implementations[kind]]);
  for(const [kind,engine] of entries) assertEngine(kind,engine);
  let state='created';
  let subscriptions=[];
  let started=[];
  const terrain=implementations.terrain;
  return Object.freeze({
    schema:ENGINE_RUNTIME_SCHEMA,
    get state(){return state;},
    get(kind) {
      if(!ENGINE_KINDS.includes(kind)) throw new RangeError('Unknown engine');
      return implementations[kind]??null;
    },
    start() {
      if(state!=='created') throw new Error('Runtime cannot start from '+state);
      try {
        for(const [kind,engine] of entries) {
          engine.start();
          started.push(engine);
          if(TERRAIN_CONSUMERS.has(kind)) {
            const unsubscribe=terrain.subscribe(kind,change=>engine.onTerrainChange(change));
            if(typeof unsubscribe!=='function') throw new TypeError('Expected unsubscribe');
            subscriptions.push(unsubscribe);
          }
        }
        state='running';
      } catch(error) {
        for(const unsubscribe of subscriptions.reverse()) unsubscribe();
        subscriptions=[];
        for(const engine of started.reverse()) engine.stop();
        started=[];
        throw error;
      }
    },
    stop() {
      if(state==='stopped') return;
      if(state!=='running') throw new Error('Runtime cannot stop from '+state);
      for(const unsubscribe of subscriptions.reverse()) unsubscribe();
      subscriptions=[];
      for(const engine of started.reverse()) engine.stop();
      started=[];
      state='stopped';
    },
    dispose() {
      if(state==='disposed') return;
      if(state==='running') this.stop();
      for(const [,engine] of [...entries].reverse()) engine.dispose();
      state='disposed';
    }
  });
}
