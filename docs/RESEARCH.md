# Voxel V2 — independent research ledger

Date: 2026-11-09. Status: **in progress**, not a 75-source completed review.

## Verified references (distinct source documents)

1. [0fps: Meshing in a Minecraft Game](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/) — greedy quads versus naive; fragmented geometry limits savings.
2. [0fps: Meshing Part 2](https://0fps.net/2012/07/07/meshing-minecraft-part-2/) — topology, seams and triangulation tradeoffs.
3. [0fps: Ambient occlusion](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/) — merge constraints when per-vertex lighting differs.
4. [Godot Voxel Tools: Performance](https://voxel-tools.readthedocs.io/en/latest/performance/) — upload budgets, snapshots, collider construction and bulk edits.
5. [Godot VoxelTerrain API](https://voxel-tools.readthedocs.io/en/latest/api/VoxelTerrain/) — 16/32 mesh chunk tradeoff.
6. [MDN: WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) — conservative VRAM accounting and resource disposal.
7. [Khronos: WebGL2 disjoint timer query](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/) — asynchronous GPU measurement, optional extension.
8. [Khronos: WebGL1 disjoint timer query](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query/) — async measurement semantics.
9. [MDN: Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) — transferred buffer ownership.
10. [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) — worker message and cloning behavior.
11. [MDN: Structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) — data types and serialization limitations.
12. [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) — refresh-rate variability and background suspension.
13. [MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) — exclude hidden-tab intervals from performance runs.
14. [MDN: WebGL context lost](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event) — handle loss and resource recovery.
15. [MDN: isContextLost](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/isContextLost) — explicit context state checks.
16. [meshoptimizer](https://github.com/zeux/meshoptimizer) — indexing, vertex cache/fetch, mobile tile GPU overdraw tradeoffs.
17. [UnityVoxelTerrain prototype](https://github.com/Rabidus4k/UnityVoxelTerrain) — smooth density-field alternative and chunk-local rebuilds; not proof of mobile performance.

## Decisions supported so far

- **Adopt:** benchmark 16³ vs 32³; bulk edit and one authoritative writer; bounded snapshot/worker queue; revision-gated result acceptance; budget GPU uploads and explicit buffer disposal.
- **Adopt:** report p50/p95/p99 frame intervals and hitches; exclude hidden-tab pauses; distinguish CPU timings from optional GPU timer-query measurements.
- **Benchmark:** naive exposed faces vs greedy meshing under fragmented destruction, including vertex count, CPU build cost, GPU upload bytes, and latency.
- **Defer:** density-field marching cubes, LOD, octrees, and meshoptimizer integration until measured need.
- **Risk:** a full-site Pages artifact from an old cache can roll back production; deployment safety is a V2.0 gate.
- **Open question:** 10 cm experimental voxels vs existing 12.5 cm canon; owner approval required before integrating a changed gameplay contract.


## Research batch 2 — storage, traversal, mobile rendering (2026-11-09)

18. [voxel-framework chunk coordinates](https://docs.rs/voxel-framework/latest/src/voxel_framework/chunk/mod.rs.html) — Euclidean division for negative chunk positions.
19. [voxel-framework DDA raycasting](https://docs.rs/voxel-framework/latest/voxel_framework/world/raycast/index.html) — cell-by-cell traversal and face normals.
20. [Owl Engine voxel data API](https://owl.argawaen.net/media/documentation/0.2.1/d8/d14/namespaceowl_1_1data_1_1voxel.html) — floor division and compact run encoding.
21. [Owl Engine voxel architecture](https://owl.argawaen.net/media/documentation/0.2.1/dd/d05/page-voxel.html) — chunk coordinate boundary examples and CPU/GPU separation.
22. [Sector's Edge optimized CPU ray marching](https://vercidium.com/blog/optimised-voxel-raymarching/) — 32³ packed chunks, avoiding empty allocations, chunk-local traversal.
23. [Amanatides–Woo reference implementation](https://www.mathworks.com/matlabcentral/fileexchange/26852-a-fast-voxel-traversal-algorithm-for-ray-tracing) — classic 3D DDA algorithm and references.
24. [Mobile GPUs and tiled rendering](https://developers.meta.com/vr/documentation/native/android/gpu-tiled/) — tile-based mobile GPU architecture and power constraints.
25. [WebGL/WebGPU texture upload benchmarks](https://github.com/mvaligursky/webgl-webgpu-texture-upload) — browser/GPU-dependent transfer performance; desktop-only evidence.
26. [Voxel chunk scheduler refactor analysis](https://github.com/maguirekrist/voxel_enginevk/blob/main/chunk_refactor.md) — avoid event-only dirty tracking and centralize neighborhood sampling; engineering proposal, not validated universal result.
27. [Interactive voxel brickmap and ray traversal](https://www.jorisar.nl/blog/VoxelPlayground/) — empty-brick acceleration and traversal alternatives; GPU architecture differs from WebGL2 baseline.

### Batch 2 implications

- **Adopt:** Euclidean/floor chunk division and positive local modulo, one canonical neighborhood sampler, test exact boundaries and negative positions.
- **Adopt:** 3D DDA raycasting with tests for zero direction, tie boundaries, inside-solid origins, and maximum travel.
- **Adopt:** separate authoritative packed voxel data from CPU mesh outputs and renderer-owned GPU allocations.
- **Benchmark:** 16³ versus 32³ chunks, including update time, allocations, draw calls, and fragmented geometry.
- **Defer:** brickmap ray-marched renderer; the referenced prototype does not establish WebGL2 phone suitability.
- **Risk:** event-only mesh scheduling can strand dirty chunks; reconcile desired revisions against in-flight/completed mesh versions.
- **Evidence caveat:** mobile tile-based architecture guidance is not a Wyrmforge phone benchmark; published texture-upload numbers are not transferable across devices.


## Research batch 3 — scheduling, ownership and cancellation (2026-11-09)

28. [Godot Voxel Tools development notes](https://voxel-tools.readthedocs.io/en/latest/development/) — prioritised worker tasks and background thread pool; implementation evidence, not a mobile benchmark.
29. [Godot Voxel Tools performance source](https://github.com/Zylann/godot_voxel/blob/master/doc/source/performance.md) — authoritative implementation discussion of unbounded snapshot accumulation, spatial locking, bulk edits, deferred GPU upload, and collider creation costs. **Same project as reference 4; distinct document, not an independent engine.**
30. [Godot thread-safe APIs](https://docs.godotengine.org/en/latest/tutorials/performance/thread_safe_apis.html) — GPU operations can require synchronization and cause stalls; background CPU work is not equivalent to asynchronous GPU upload.
31. [Godot Voxel Tools changelog](https://voxel-tools.readthedocs.io/en/latest/changelog/) — shutdown and queued-destruction race fixes illustrate lifecycle hazards. **Same project as references 4, 5, 28 and 29.**

### Batch 3 conclusions

- **Adopt:** one writer; bound pending jobs AND snapshot bytes; reserve main-thread GPU upload budget; treat GPU resource deletion as budgeted work; bulk spatial edits rather than per-cell event emission.
- **Adopt:** each job carries chunk revision, sampled neighbor revisions, world-generation epoch and disposable buffer ownership. Accept mesh only when all versions match; discard stale outputs without altering voxel truth.
- **Adopt:** reset increments world epoch, stops accepting previous-epoch results, and drains/terminates workers with a documented timeout. Explicit tests for reset/exit with work queued.
- **Benchmark:** upload and deletion time independently of worker meshing time; collider work independently of rendering.
- **Do not overclaim:** the revision/epoch protocol is our proposed design response to documented races, not a design proven by the cited documentation. Mobile performance and safe concurrency remain unverified.
- **Source independence warning:** multiple references are documents from the same Godot Voxel Tools project. Count distinct documents separately, but do not represent them as independent implementations.


## Research batch 4 — deterministic replay, fixed-step overload, deployment cache (2026-11-09)

32. [Microsoft Azure Architecture Center: Event Sourcing](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) — append-only event history, event versioning, optimistic concurrency, periodic snapshots and replay.
33. [Gaffer on Games: Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/) — fixed-step accumulator, headroom, overload spiral, rendering decoupled from simulation.
34. [Gaffer on Games: Deterministic Lockstep](https://www.gafferongames.com/post/deterministic_lockstep/) — input ordering, RNG seeding, floating-point cross-platform caveats.
35. [Unity: Enhanced physics performance for smooth gameplay](https://unity.com/how-to/enhanced-physics-performance-smooth-gameplay) — fixed physics steps can multiply catch-up work after slow frames; platform-specific advice, general scheduling caution.
36. [GitHub Docs: Dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) — cache visibility, branch scope, access modes and cache eviction.
37. [GitHub Docs: Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) — concurrency and workflow cache configuration.
38. [GitHub Changelog: Read-only Actions cache for untrusted triggers](https://github.blog/changelog/2026-06-26-read-only-actions-cache-for-untrusted-triggers/) — trigger trust influences cache write permission.

### Batch 4 implications

- **Adopt:** immutable ordered accepted-edit log containing command ID, generator/schema/material version, integer voxel bounds, deterministic material/damage parameters, world epoch and resulting revision.
- **Adopt:** periodic versioned snapshots; restore snapshot then replay later accepted commands; verify canonical voxel-state hash against direct execution.
- **Adopt:** deduplicate IDs within an explicitly bounded session or persisted sequence window; replay applies accepted commands once and preserves order. Do not claim exactly-once delivery across arbitrary crashes without durable storage.
- **Adopt:** fixed-step player/physics simulation with a maximum catch-up budget; separate rendering cadence and voxel command ordering. Floating-point simulation cannot be assumed bitwise deterministic across mobile architectures.
- **Adopt:** workload reports distinguish frame time, simulation catch-up, commit latency, mesh latency, and GPU upload latency.
- **Investigate before V2.0 acceptance:** GitHub Pages cache visibility and freshness are distinct from deployment safety. Even an exact-main cache can be stale relative to a newly published deployment, and another deployment may race after checking main SHA. Require post-deploy production route checks and a single-owner publication strategy or isolated preview host.
- **Research methodology:** seven distinct references; two GitHub Docs pages are from the same publisher and two Gaffer articles from the same author. Distinct documents do not equal independent experimental validation.


## Research batch 5 — browser lifecycle, mobile input and memory (2026-11-09)

39. [MDN: WebGL context restored](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event) — old GPU objects become invalid after restoration; rebuild resources.
40. [MDN: WEBGL_lose_context extension](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context) — deterministic context-loss injection for regression tests.
41. [MDN: Performance.measureUserAgentSpecificMemory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory) — experimental memory measurement, requires cross-origin isolation.
42. [MDN: Performance.memory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory) — deprecated, Chromium-only and not reliable for total memory.
43. [MDN: Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) — capture, cancellation, multi-touch lifecycle.
44. [MDN: CSS touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action) — browser gesture ownership and pointer cancellation.
45. [MDN: pointercancel event](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event) — input state cleanup for interrupted gestures.
46. [MDN: WebGL2 invalidateFramebuffer](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/invalidateFramebuffer) — discard unused attachments; relevant to tile-based GPU memory bandwidth.
47. [MDN: WebGL getError](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getError) — detect OUT_OF_MEMORY and CONTEXT_LOST_WEBGL without treating diagnostics as a zero-cost per-frame operation.

### Batch 5 implications

- **Adopt:** context-loss test mode; suspend GPU work on loss, preserve committed voxel truth, recreate GPU resources after restore, reject old renderer-epoch uploads.
- **Adopt:** explicit byte accounting for packed voxels, worker snapshots, CPU meshes and known GPU buffers; label GPU accounting as estimates. Do not require cross-origin isolation or Chromium-only memory APIs.
- **Adopt:** pointer capture and cancellation-safe gesture state machine, with tap versus orbit versus pinch disambiguation; verify interrupted pinch cannot trigger an accidental edit.
- **Benchmark:** mobile framebuffer formats, render-scale tiers, and selective attachment invalidation; do not assume a particular optimization helps without phone captures.
- **Caution:** all nine are distinct MDN documentation pages, **not nine independent publishers or experiments**. They document browser APIs; they do not establish Wyrmforge performance.


## Research batch 6 — continuous collision, editable compression and stress measurement (2026-11-09)

48. [voxel-aabb-sweep](https://github.com/fenomas/voxel-aabb-sweep) — continuous AABB sweeping; warns that per-axis movement is direction-dependent for large motions.
49. [Voxel Astra](https://github.com/fionnbanksg/voxel-astra) — independent browser voxel implementation with fixed-step physics, chunk-local updates and DDA; claims require device verification.
50. [WebGPU Voxel Engine](https://github.com/JamesKevinJones/webgpu-voxel-engine) — alternative swept-AABB and DDA implementation; WebGPU compute features are outside our WebGL2 baseline.
51. [Xepsa voxel sandbox build-along](https://www.xepsa.net/manual/book/games/build-voxel-1) — 16³ sparse chunk baseline, culled faces, incremental remesh, and swept collision.
52. [Efficient Sparse Voxel Octrees (Laine and Karras)](https://research.nvidia.com/publication/2010-02_efficient-sparse-voxel-octrees-analysis-extensions-and-implementation) — compressed hierarchical occupancy and traversal; update cost/complexity remain relevant.
53. [Editing Compressed High-resolution Voxel Scenes with Attributes](https://onlinelibrary.wiley.com/doi/10.1111/cgf.14757) — 2023 peer-reviewed work on editable compressed geometry plus attributes.
54. [VoxelRT experiments](https://github.com/dubiousconst282/VoxelRT) — comparison of brickmaps, DDA, distance fields and octrees with editing-cost caveats; author-specific benchmark.
55. [Geometry and Attribute Compression for Voxel Scenes](https://publications.graphics.tudelft.nl/papers/222) — palette compression and DAG separation of geometry/material attributes; not a mobile destruction benchmark.
56. [Chrome Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames) — instrument long animation frames where supported; cross-browser fallback required.
57. [Random Access Segmentation Volume Compression](https://onlinelibrary.wiley.com/doi/10.1111/cgf.70116) — random-access versus compression tradeoff; medical volume data, not directly comparable to terrain.

### Batch 6 implications

- **Benchmark:** swept AABB versus substepped per-axis AABB for diagonal movement, high-speed falls, tunneling, and cross-chunk collision. AABB is an initial broad-phase approximation to the proposed capsule, not proof of capsule fidelity.
- **Adopt:** collision reads committed voxels, never asynchronous render meshes; define whether unloaded/out-of-bounds space is solid, empty, or rejected.
- **Adopt:** sparse chunk map with empty/uniform encodings and packed mixed arrays as first editable storage baseline; compare alternatives on mutation throughput, memory and query latency.
- **Defer:** DAG/octree/brickmap renderer, WebGPU compute, and full GPU ray marching until actual WebGL2 mobile results justify them.
- **Measure:** p95/p99 animation frame intervals plus Chrome long-frame diagnostics when available; use cross-browser rAF deltas as baseline, explicitly excluding hidden-tab intervals.
- **Independence caution:** these are ten distinct source documents, not ten controlled comparative experiments; several are prototypes or implementations with different targets.


## Research batch 7 — WebGL buffers, instrumentation and Pages ownership (2026-11-09)

58. [MDN WebGL bufferData](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bufferData) — allocate/replace GPU data store; usage hints and out-of-memory conditions.
59. [MDN WebGL bufferSubData](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bufferSubData) — update existing buffer range; benchmark against replacement rather than assume superiority.
60. [MDN WebGL deleteBuffer](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/deleteBuffer) — explicit lifetime management for replaced and discarded chunk meshes.
61. [MDN WebGL2 bufferSubData](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/bufferSubData) — WebGL2 typed-array offset/length semantics.
62. [MDN WebGL2 bufferData](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/bufferData) — WebGL2 allocation and usage hints.
63. [MDN WebGL2 getBufferSubData](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/getBufferSubData) — GPU readback exists; avoid synchronous per-frame diagnostics.
64. [Chrome DevTools Rendering performance](https://developer.chrome.com/docs/devtools/rendering/performance) — frame rendering stats and GPU-memory tooling, desktop Chromium evidence only.
65. [GitHub Pages custom workflow publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) — site-wide artifact publishing and deployment-environment protection.
66. [MDN WebGL deleteRenderbuffer](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/deleteRenderbuffer) — explicit framebuffer attachment cleanup.

### Batch 7 implications

- **Benchmark:** allocate/recreate chunk buffers versus pooled buffers with partial updates; compare CPU frame time, upload bytes, VRAM estimates and long-frame frequency. WebGL usage flags are hints, not measured performance guarantees.
- **Adopt:** renderer-owned explicit disposal of replaced vertex/index buffers and render targets; restoration recreates GPU resources from committed voxel truth.
- **Adopt:** never perform GPU readback in the frame-critical metrics path. Use available browser instrumentation for corroboration, not as cross-platform proof.
- **Change proposed deployment design:** prefer a single Pages deployment owner or isolated experiment host. Two independent full-site deployers remain unsafe even when both workflows share concurrency and cache keys; a cache is not an atomic view of the current deployed site.
- **Evidence limitation:** seven of nine references are MDN API documentation, not independent performance experiments.


## Research batch 8 — sustained mobile profiling and deployment ordering (2026-11-09)

67. [Apple: Tailor apps for tile-based deferred rendering](https://developer.apple.com/documentation/metal/tailor-your-apps-for-apple-gpus-and-tile-based-deferred-rendering) — Apple GPU tile memory and bandwidth behavior. **Metal-specific details are not WebGL2 APIs.**
68. [Apple: Reducing the memory footprint of Metal apps](https://developer.apple.com/documentation/metal/reducing-the-memory-footprint-of-metal-apps) — device-dependent iOS memory limits, GPU memory pressure, resolution and temporary target costs.
69. [Android Developers: Slow sessions](https://developer.android.com/games/optimize/vitals/slow-session) — thermal throttling, frame pacing, GPU/CPU bottlenecks and long-running sessions; Swappy is for native renderers, not directly for browser JavaScript.
70. [Android Developers: Tools for optimizing your game](https://developer.android.com/games/tools) — Perfetto, memory diagnostics and GPU tracing on physical Android devices.
71. [Android Developers: Optimize power efficiency](https://developer.android.com/games/optimize/power) — refresh-rate and battery-performance tradeoffs; native APIs are not browser controls.
72. [Chrome DevTools: Memory panel](https://developer.chrome.com/docs/devtools/memory) — heap snapshots, allocation timeline and sampling for JS and worker memory.
73. [Chrome DevTools: Fix memory problems](https://developer.chrome.com/docs/devtools/memory-problems) — allocation/GC and retained-reference investigation.
74. [GitHub Docs: Concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency) — workflow serialization and pending-run behavior; serial does not automatically imply newest deployment.
75. [GitHub Docs: Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) — ordering of queued jobs and runs; workflow dispatch order is not guaranteed.

### Batch 8 implications

- **Adopt:** 10-minute warm-device benchmarks; record thermal context when observable, render resolution, device/browser version, p50/p95/p99, hitch counts and sustained memory trend.
- **Adopt:** instrument JavaScript heap allocation and GC in supported tooling, but keep in-app counters cross-browser and label estimates. Monitor input-to-visible latency as well as FPS.
- **Benchmark:** framebuffer resolution, chunk buffer churn and texture bandwidth on actual iPhone Safari and Android Chrome; Metal/Android native optimizations are evidence of hardware constraints, not APIs available to WebGL2.
- **Adopt:** only one authoritative Pages publication owner or a truly isolated preview host. Check production and experimental route content after every publish. Serialized workflows without freshness checking cannot prove preservation.
- **Research scope completed:** 75 distinct reference documents listed. **This is not 75 independent implementations or 75 empirical benchmarks**. The evidence remains heterogeneous, with multiple pages from the same publishers and projects. Final architecture choices still require controlled benchmarks and actual-device verification.

## Remaining research

Target 75 distinct sources across storage, meshing, destruction, workers, mobile graphics, physics, persistence and deployment. **0 further distinct references remain; 75 reference documents recorded.**. Do not claim research gate complete before each is inspected and linked to a decision or rejection.

No device performance claims are supported by this desk research.
