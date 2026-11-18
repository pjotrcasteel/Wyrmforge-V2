# L10-08 — Generic height-banded lighting for pixel cutouts

Tall trees formerly received one world-space illumination sample near their
base. A nearby fire or lava stream could light the entire crown and trunk at
once. The actual Hunt Canvas path now samples three vertically spaced points,
using the same existing `lighting.sample(position)` contract and the same
physically occluded static/transient light inputs.

The new renderer-only `sprite-light-bands.mjs` creates three contiguous
source cuts and destination rows from ordinary sprite metadata and world
pose/scale/optional height. It knows no tree, building, Water, or creature
names. Every source pixel and destination row is covered once, preserving
pixel-art transparency and existing painter's ordering. Existing falling
animation remains on the original single-sample path.

The three crops together cost no more newly tinted pixels than one full
source sprite. No new raycasts, GPU textures or full-screen passes. Existing
limits remain 65,536 newly tinted pixels per frame, 8 MiB cache, with warm
same-crop fallback. Tiny displayed sprites use the existing flat path.

Review in Scorched Approach near lava and in Wet Forest shade, especially
large pines and future tall building artwork. Horizontal colour band edges,
cold cache under dense movement and iPhone/Android budget are still pending
visual/performance acceptance. Next within L10-08: fluid display receiver
parity, then matched biome review; L10-09 atmosphere follows.
