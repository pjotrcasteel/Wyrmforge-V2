# Voxel V2 terrain texture manifest

The V2-only material library resolves **logical surface slots** into
validated, deduplicated channel assets. Assets are not copied from V1.
Six named material variants support grass top, rooted grass side, dirt,
stone and two alternate top/soil variants. Each can carry albedo, normal,
ORM and optional height asset keys.

Albedo is sRGB; normal, ORM and height channels are linear. Packed ORM:
R = ambient occlusion, G = roughness, B = metallic. Neutral missing-map
values are white albedo, normal (128,128,255), ORM (255,255,0), and
mid-gray height.

The manifest compiler supports selectable power-of-two tile sizes and
mip-level accounting. The **active renderer selects 64×64** slots, matching
the artist handoff format. Standalone manifest/default reference fixtures
continue to support 256×256 for backwards compatibility and budget tests.
The WebGL2 cache uses one texture array per active channel, with distinct
sRGB/linear GPU storage. Uploads are scheduled by the WebGL renderer's
bounded frame queue; retained source images are requeued on context restore.

A local file selected in the lab is only a preview. Its PNG header is
verified before decode and the decoded image is validated again.
No artwork is bundled, accepted or uploaded to a remote service by this
pipeline. The previous 1024×1024 Grass 002 comparison path remains separate.

**Remaining:** approved art previews (one 64px asset and repeated tile grid
at a time), measured distance filtering/mip strategy, physical-device
GPU/memory/frame data and actual Hunt gameplay acceptance. Merely declaring
mip-level accounting does not mean a complete filtering policy is live.
