# Lighting V2 — visual finishing pass (2026-11-19)

Issue [#430](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/430) | technical milestones [#375](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/375), [#377](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/377), [#378](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/378), [#379](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/379).

## Why this is necessary

The owner's 19 Nov iPhone recording still shows tree and rock shimmer, circular/disconnected canopy shadows, and uniformly dark grass in a nearly healthy Wet Forest. Previous changes added texture normals and soft circular stamps, but these did not establish temporal or art-direction acceptance. Physical geometry is already owned by WorldGen, and the Water engine is being updated in parallel. This pass **does not** edit either engine.

## Implemented scope

**Receiver silhouettes:** Rendering retains a compact 24px contact kernel for roots/rocks and adds **one additional precomputed 24px sun-oriented canopy kernel**, whose three overlapping asymmetrical lobes produce an elongated outline without a circular/radial disc. These are applied only after the existing 7×8 caster alpha cutout and physical terrain/camera receiver checks; cast direction and occluder budgets remain unchanged. Both use the same bounded, once-per-page Canvas resource path; no per-frame gradient, geometry query, full-screen filter or per-tree shadow atlas.

**Temporal stability:** Rendering holds at most 256 stabilized lighting records keyed by **stable prop ID and sprite-height band** (tree, boulder, log or future cutout with an ID). Changes below 0.035 linear irradiance are held, and larger changes track with a bounded rise per frame. This specifically avoids color flash when sparse light-field samples or cached tint work changes near a quantization threshold, without freezing real Fireball/emission light. Existing 65K pixel/frame tint work and 8MiB cache limits remain.

**Biome progression:** Pure Lighting `describeHuntBiomeMood` consumes World Map's existing progress, sunlight and biome identity. Early Wet Forest starts at **0.70 exposure**, warmer/greener ambient than the old blanket **0.42**. Through the authored forest/highland/mountain/scorched route it progressively loses warmth and daylight until the Wyrm lair reaches **0.34 exposure**, retaining emission/Fireball readability. It changes Lighting irradiance only—never the material corruption/ash/world geometry or Water state. `?biomeLighting=off` is the original lighting negative control.

## Test and device review gates

- `tests/lighting-visual-finish.test.mjs`: monotonic highland route, finite ambience, asymmetrical canopy with transparent edges, stable per-object tint vs moving light, finite/bounded caches and real Hunt integration.
- Full Node suite and six GLSL vertex/fragment shaders; existing actual Play Hunt contact/directional/forest four-state browser witnesses, Water/lighting three-biome witness and normal-map integration. Preserve latest main when other engine PRs land.
- **Still requires owner and real hardware:** iPhone Safari & Android Chrome 10-minute sustained movement, compare the same camera/seed for canopy silhouette, stone jitter, contact shadow alignment, brightness, Wyrm influence, and p50/p95/p99 and hitches. A green CI or software Chrome screenshot is not thermal or mobile acceptance.
- If flicker remains in world objects after the cache fix, capture the exact build/viewport/recording and inspect residency and camera snapping separately, not by changing physical simulation or hiding shadows.

No global GI, 4K textures, volumetrics, many-light shadows or independent mutable position caches were added. It remains a self-contained Lighting/Renderer slice. Do not claim complete engine closure until owner device acceptance and the 10-minute performance gate.
