# L10-08 shared emissive response: terrain and sprite consumers

This first mixed-consumer slice uses **one published** geometry-occluded
`wyrmforge.local-light-field.v2` snapshot for terrain and Canvas sprites.
A pixel-art tree, future building, rock or wizard consumes the same read-only
spatial light `sample(position)` descriptor; no entity class or sprite atlas
name appears in the Lighting sampler.

- Materials supplies `emissionColor` (RGB relative emission). The local
  light field copies this colour into its immutable, revisioned snapshot.
- Rendering binds the field colour via `uLightingEmissionColor` instead of
  hardcoding a lava colour in the shared Lighting GLSL.
- Sprite consumers sample four existing RGBA32F columns at the same world
  position and the same two physical receiver elevations as terrain.
  The CPU sampler does **zero new Voxel rays, GPU uploads or atlas reads**.
- Play Hunt selects one completed field by terrain epoch/revision and gives it
  to both consumers in the same presentation frame.
- `?spriteEmission=off` disables the **sprite-only** emissive response, leaving
  terrain and gameplay unchanged for same-build comparison.

## Remaining and honest limits

This is a bounded **single-tint per sprite** response. Large tree crowns do
not yet have a perceptually distinct top/middle/trunk colour response, and the
fluid renderer's own foam/water presentation still needs matched emissive
receiving/shading. The static field represents one combined emission spectrum
per 24m region, not arbitrarily overlapping multi-colour light volumes.
Future emission types use the descriptor; a future composite source mixer can
extend the schema rather than hardcode item names.

The recording `ScreenRecording_11-18-2026 22-49-00_1.mp4` shows live camera
travel with residency varying between two and three sites. Frame p95 values
displayed on the recording are approximately 18–28 ms. The recording does
not by itself prove shadow flicker is fully resolved or establish sustained
mobile performance. It is a user-provided iPhone visual reference, not a
repeatable scripted benchmark.

L10-08 #377 retains visual, performance and 10-minute iPhone/Android gates.
The L10-09 atmosphere and L10-10 stabilization milestones remain separate.
