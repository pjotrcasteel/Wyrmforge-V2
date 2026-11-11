# Wyrmforge V2 — Environment reference library (research only)

**Status:** Reference inventory, not approved production art. V2 remains clean-room. No V1 code, art blobs, or external pack textures are copied into the V2 runtime.

## Source A — Wyrmforge V1, visual and behavior references

| Family | V1 reference | What to study | V2 direction |
|---|---|---|---|
| Grass, moss, mud | [Wet Forest material design](https://github.com/pjotrcasteel/Wyrmforge/blob/main/docs/art/wet-forest-three-material-gpu-scene.md) | Ground readability, worn paths, lighting-neutral albedo, seamless world-space tiling | Original grass/dirt/stone textures with explicit top and exposed-side faces |
| Material palettes | [Arena material reference](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Presentation.Web/wwwroot/js/arena-material-reference.js) | Grass/moss, waterlogged ground, paving, trampled soil, scorch progression | Color and mood reference only, no copied atlas |
| Trees and stumps | [Tree art behavior](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Presentation.Web/wwwroot/js/arena-tree-art.js) | Conifer/oak/pine families, live/dry/dead/charred, persistent variant per tree, stump after destruction | Original V2 world objects with separate appearance, collision and destruction state |
| Wet-forest props | [Vegetation accents](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Presentation.Web/wwwroot/js/arena-wet-forest-vegetation.js) | Pine/dead tree variants, roots, understory attached to real object positions | Seeded objects anchored to terrain; no phantom visual-only colliders |
| Stones | [V1 environment assets](https://github.com/pjotrcasteel/Wyrmforge/tree/main/src/Wyrmforge.Presentation.Web/wwwroot) | Stone surface versus freestanding rock silhouettes and footprints | Stone as terrain material; rocks as separate destructible object family |

## Source B — User-provided Ground materials - Textures asset (2).zip

Locally inspected archive: **283 PNGs**. Terrain groups include Grass, Grass Dirt, Dirt, Stone, Stony Dirt, Wet Dirt, Sand, Sandy Stone, Snow, Snowy Stone, Clay, Concrete and Asphalt; each of those named terrain groups contains eight numbered tiles. Also contains 32px/64px and plant/stone sprite groups. Most texture PNGs are 64×64 or 32×32; there are a few larger sheets.

**Use:** texture density, pattern scale, tiling and prop taxonomy references. **Do not** silently redistribute or import archive artwork into V2. Licensing/attribution and tileability have not been established.

## V2 original-art briefs

1. **Grass:** dark, readable gothic-forest ground; pixel-authored seamless tile, 64×64 working resolution, 32px-per-meter screen readability; no painted directional light, baked shadow, or obvious repeating emblem. Test 3×3 tiling and far zoom.
2. **Dirt:** rich dark earth with sparse grit and roots; same texel density; separate exposed vertical face; deterministic subtle variants.
3. **Stone:** layered weathered rock, compatible with destruction craters and cliff faces; distinct top/side treatment, no baked light.
4. **Transitions:** grass→dirt, dirt→stone, wet/charred variants as material blends or masks; preserve underlying stable material IDs.
5. **Rocks:** separate physical object family (small scatter, medium breakable, large obstacle), grounded footprint, collision and destructibility defined independently of texture.
6. **Trees:** original conifer/oak/pine silhouettes, live/dry/dead/charred and stump states, terrain-anchored, deterministic variants. Separate object renderer and destruction data; no tree baked into ground textures.

## Integration guardrails

- Stable terrain IDs: grass=1, dirt=2, stone=3; renderer maps IDs to material assets.
- Textures are replaceable; voxel data, edit ledger, mesh workers and terrain events remain independent.
- Texture UVs must remain world-anchored across chunk boundaries and after localized remeshing; no texture swimming.
- Art review must check close zoom, hunt zoom, 3×3 tiling, exposed crater sides and iPhone performance.
- Asset acceptance requires explicit visual approval; passing automated tests is not art approval.
