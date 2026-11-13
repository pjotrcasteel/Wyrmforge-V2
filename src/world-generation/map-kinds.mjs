// World Generation V2: Strategy pattern. These are replaceable design recipes,
// not VoxelWorld implementations, material shaders, prop engines, or game data.
// Each strategy composes a site plan using only the public builder vocabulary.
export const MAP_KIND_IDS = Object.freeze([
  'wet-forest', 'forest-highland', 'mountain-pass'
]);

function mix(seed, x, z, salt) {
  let value = (seed ^ Math.imul(x, 0x9e3779b1) ^
    Math.imul(z, 0x85ebca6b) ^ Math.imul(salt, 0xc2b2ae35)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

// Smooth, world-anchored, seeded noise for subtle *local* texture of the
// terrain silhouette. Large-scale geometry is authored by each strategy.
export function siteNoise(seed, x, z, period = 8, salt = 1) {
  if (![seed, x, z, period, salt].every(Number.isFinite) || period <= 0) {
    throw new RangeError('Invalid site noise arguments');
  }
  const fx = x / period, fz = z / period;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const dx = fx - ix, dz = fz - iz;
  const sx = dx * dx * (3 - 2 * dx);
  const sz = dz * dz * (3 - 2 * dz);
  const a = mix(seed, ix, iz, salt);
  const b = mix(seed, ix + 1, iz, salt);
  const c = mix(seed, ix, iz + 1, salt);
  const d = mix(seed, ix + 1, iz + 1, salt);
  return (a + (b - a) * sx) * (1 - sz) +
    (c + (d - c) * sx) * sz;
}

const routeNodes = Object.freeze([
  Object.freeze({x:0,z:18}),
  Object.freeze({x:-2,z:10}),
  Object.freeze({x:1,z:2}),
  Object.freeze({x:3,z:-7}),
  Object.freeze({x:0,z:-18})
]);

function addNarrativePaths(builder, kind) {
  builder.addRoute('entry-to-exit', routeNodes, 2);
  // This spur is authored around the encounter clearing, never a disconnected
  // scatter of props. The gameplay/world-map decides what the landmark means.
  builder.addRoute('landmark-spur', [
    {x:1,z:2},{x:4,z:0},{x:8,z:-3}
  ], 1);
  builder.addClearing({id:'encounter-glade', x:1,z:2,radius:5});
  builder.addClearing({id:'landmark-approach',x:8,z:-3,radius:3});
  builder.addLandmark({id:'site-landmark',kind,
    x:8,z:-3,clearance:3});
}

function forest(builder, context) {
  const seed = context.seed;
  builder.setTerrain({
    elevation(x,z) {
      const broad = 2.2 * siteNoise(seed,x,z,15,1);
      const detail = 1.2 * siteNoise(seed,x,z,7,2);
      const wetHollow = 1.5 * Math.exp(-((x+12)**2+(z-7)**2)/70);
      return 2 + broad + detail - wetHollow;
    },
    exposedStone: 0.94
  });
  addNarrativePaths(builder,'forest-ruin');
  builder.addFeature({id:'wetland',kind:'water-basin',x:-12,z:7,radius:5});
  builder.addFeature({id:'northern-grove',kind:'woodland',
    x:-10,z:-9,radius:7});
}

function transition(builder, context) {
  const seed=context.seed;
  builder.setTerrain({
    elevation(x,z) {
      const travel=(18-z)/36;
      const ridge=Math.max(0,Math.abs(x-5)-5);
      return 2+travel*8 + 0.25*ridge +
        3*siteNoise(seed,x,z,13,3)-1;
    },
    exposedStone: 0.68
  });
  addNarrativePaths(builder,'mountain-watch');
  builder.addFeature({id:'lower-forest',kind:'woodland',
    x:-12,z:10,radius:6});
  builder.addFeature({id:'foothills',kind:'rocky-slope',
    x:11,z:-10,radius:7});
}

function mountains(builder, context) {
  const seed=context.seed;
  builder.setTerrain({
    elevation(x,z) {
      const valley=Math.max(0,Math.abs(x-2)-5);
      const northward=(18-z)/36;
      const cliff=valley > 4 ? (valley-4)*0.85 : 0;
      return 3 + northward*7 + 0.65*valley + cliff +
        2.0*siteNoise(seed,x,z,11,4);
    },
    exposedStone:0.24
  });
  addNarrativePaths(builder,'mountain-shrine');
  builder.addFeature({id:'western-escarpment',kind:'cliff',
    x:-13,z:-4,radius:7});
  builder.addFeature({id:'eastern-ridge',kind:'rocky-slope',
    x:14,z:6,radius:7});
}

const BUILTIN_STRATEGIES=Object.freeze([
  Object.freeze({kind:'wet-forest',compose:forest}),
  Object.freeze({kind:'forest-highland',compose:transition}),
  Object.freeze({kind:'mountain-pass',compose:mountains})
]);

// Registry pattern with injected strategy implementations. A later map kind
// is a plugin module, not a switch in the generator or the voxel engine.
export class MapKindRegistry {
  #strategies=new Map();
  constructor(strategies=BUILTIN_STRATEGIES) {
    for(const strategy of strategies) this.register(strategy);
  }
  register(strategy) {
    if(!strategy || typeof strategy.kind!=='string' ||
        !/^[a-z][a-z0-9-]{2,31}$/.test(strategy.kind) ||
        typeof strategy.compose!=='function') {
      throw new TypeError('Map kind requires a stable name and compose strategy');
    }
    if(this.#strategies.has(strategy.kind)) {
      throw new RangeError('Map kind is already registered: '+strategy.kind);
    }
    this.#strategies.set(strategy.kind,strategy);
    return this;
  }
  resolve(kind) {
    const strategy=this.#strategies.get(kind);
    if(!strategy) throw new RangeError('Unknown World Generation V2 map kind: '+kind);
    return strategy;
  }
  get kinds() {return Object.freeze([...this.#strategies.keys()]);}
}

export function createDefaultMapKindRegistry() {
  return new MapKindRegistry();
}
