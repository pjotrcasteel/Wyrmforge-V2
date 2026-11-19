# LAVA V2 — 50-source field-reference review

**Reviewed:** 19 November 2026 · **Owner screenshot:** Wyrm Lair iPhone Safari build `8825d7f`, p95 34 ms.

**Method:** Screened 50 distinct publicly indexed geology/volcanology/photo/video/paper sources, prioritizing primary USGS, Smithsonian, NPS, NASA and peer-reviewed studies. The brief observations below are based on accessible source descriptions and summaries; full papers or video frames have **not** all been independently reviewed. Distilled implementation constraints, not an assertion of quantitatively simulated magma thermodynamics.

## Design decisions grounded in the reference patterns
1. **The current orange-speckled sheet is wrong.** Moving basalt commonly develops a DARK skin with irregular glowing fractures and much hotter exposed breakouts. Don't paint a uniform bright orange noise texture.
2. **Crust moves as pieces**, slowly advecting, cracking/stretching or disappearing at margins. World-anchored pixel features should drift along the real fluid flow vector without new random flash every frame.
3. **Brightness is localized.** Hot channels, sharp breakouts and falls can glow red/orange/yellow; cooled skins become grey/black and iron-red, especially at edges. This is a relative visual heat model, not a thermometer.
4. **Banks and islands are solid rock.** Molten visual geometry can only cover cells which the native fluid solver marks wet. No second fake lava overlay and no arbitrary new collidable crust.
5. **Bubbles, rolling and folds** should be sparse and coherent; don't add particle spam, bloom or repeated per-pixel sine noise on iPhone. Source/replay deterministic quantized patterns are preferred.
6. **A lava lake is not the same as a narrow channel.** Crust plate coverage and breakup vary with transported flow and current; changes shouldn't be tuned to one screenshot only.

## Reference index (50 distinct sources)

### A. Cooling, crust and pāhoehoe / ‘a‘ā (10)
01. [How does pahoehoe flow?](https://www.usgs.gov/news/volcano-watch-how-does-pahoehoe-flow) — Flow thickens beneath insulating roof; channels can develop tubes.
02. [Pāhoehoe and ‘a‘ā](https://www.usgs.gov/news/volcano-watch-pahoehoe-and-aa-lava-flows) — Cooling, shear and effusion separate smooth advancing lobes from rubble.
03. [How do lava flows cool?](https://www.usgs.gov/observatories/hvo/news/volcano-watch-how-do-lava-flows-cool-and-how-long-does-it-take) — Surface crust appears early while inner lava remains incandescent.
04. [Pāhoehoe breakout video](https://www.usgs.gov/media/videos/pahoehoe-breakout-1) — Moving hot interior breaks, stretches and engulfs thin surface plates.
05. [Pāhoehoe lower East Rift Zone](https://www.usgs.gov/media/images/pahoehoe-kilauea-volcanos-lower-east-rift-zone) — Thin skin chills, stretches and sinks back into flowing lava.
06. [Pāhoehoe crack](https://www.usgs.gov/media/images/pahoehoe-crack) — Warm fractures traverse folded dark basalt.
07. [Wide lava channel](https://www.usgs.gov/media/images/kilauea-volcano-wide-lava-channel) — Wide open channels still develop broad darker ropy crust.
08. [Lava around channel islands](https://www.usgs.gov/media/images/kilauea-volcano-lava-flowing-around-channel-islands) — Lava wraps solid dark islands without replacing the rock itself.
09. [Braided lava channels](https://www.usgs.gov/media/images/kilauea-volcano-braided-lava-channels) — One vent can divide into several branching molten ribbons.
10. [Fissure 8 lava flow](https://www.usgs.gov/media/images/kilauea-volcano-lava-flows-fissure-8) — Bright channel contrasts with isolated patches of black cooled surface.

### B. Channels, spillovers and real flow (10)
11. [Drone over lava channel](https://www.usgs.gov/media/images/kilauea-volcano-drone-over-lava-channel) — Active channels and local overflows are legible in aerial views.
12. [Fissure 8 overflows](https://www.usgs.gov/media/images/kilauea-volcano-overflows) — Narrow incandescent fingers spill over established channel walls.
13. [Open lava channels](https://www.usgs.gov/media/images/kilauea-volcano-open-lava-channels) — Channel supply continues with intermittent small overflows.
14. [Lava channels](https://www.usgs.gov/media/images/kilauea-volcano-lava-channels) — Open molten streams briefly spill over their levees.
15. [Fissure 8 margin](https://www.usgs.gov/media/images/kilauea-volcano-fissure-8-lava-flow-1) — The margin is a genuine thick terrain/solid crust boundary.
16. [Channelized lava flow](https://www.usgs.gov/media/images/kilauea-volcano-channelized-lava-flow) — Long narrow molten ribbons exit actual fissures.
17. [Fissure 8 lava channel 3](https://www.usgs.gov/media/images/kilauea-volcano-fissure-8-lava-channel-3) — River-like incandescent texture tracks the channel, not random flicker.
18. [Annotated Fissure 8 channel](https://www.usgs.gov/media/images/kilauea-volcano-fissure-8-channel-annotated) — Use real channel geometry, head and bank structure.
19. [Lava channel from Fissure 8](https://www.usgs.gov/media/images/kilauea-volcano-lava-channel-fissure-8) — Some channels remain glowing along an extended downstream course.
20. [Kīlauea July 2016 chronology](https://www.usgs.gov/news/photo-and-video-chronology-kilauea-july-6-2016) — Semi-cooled surfaces wrinkle and fold as flow enters depressions.

### C. Crust plates, cracks and convection (10)
21. [Kīlauea June 2004 chronology](https://www.usgs.gov/news/photo-and-video-chronology-kilauea-june-25-2004) — Dark-crusted ‘a‘ā flow can disgorge fresh smooth molten tongues.
22. [Kīlauea October 2013 chronology](https://www.usgs.gov/news/photo-and-video-chronology-kilauea-october-23-2013) — Circulating lava lake carries separate thin dark crust plates.
23. [Kīlauea November 2017 chronology](https://www.usgs.gov/news/photo-and-video-chronology-kilauea-november-20-2017) — Crust plates have texture aligned to their origin and transport.
24. [Thermal lake motion sequence](https://www.usgs.gov/media/videos/thermal-image-sequence-summit-lava-lake-motion) — Genuine black plates separated by moving bright fracture zones.
25. [Radial fractures](https://www.usgs.gov/media/images/radial-fracture-patterns-halemaumaus-lava-lake-surface-kilauea-volcano-summit) — Bright zigzag cracks cut across a mostly black surface.
26. [January 2022 lava lake](https://www.usgs.gov/media/images/january-10-2022-kilauea-1) — Glowing plate boundaries create readable network-like seams.
27. [October 2021 lava lake](https://www.usgs.gov/media/images/kilauea-summit-eruption-october-17-2021-0) — Thin silver-grey crust rides on incandescent molten material.
28. [Lava spilling onto cooled crust](https://www.usgs.gov/media/images/lava-spills-cooled-crust) — Hot fluid creeps over already cooled plates.
29. [Lava moves under crust](https://www.usgs.gov/media/videos/lava-moves-rapidly-under-crust) — Surface crust can hide much faster hot interior transport.
30. [Lava flow footage](https://www.usgs.gov/media/videos/lava-flow-0) — A sliding crust sheet plows into hotter melt below.

### D. Motion, heat and light (10)
31. [2022 lava lake timelapse](https://www.usgs.gov/media/videos/august-18-2022-timelapse-lava-lake-motion-halemaumau-kilauea) — Plates advect downstream and disappear at cooler margins.
32. [Channelized flow video](https://www.usgs.gov/media/videos/swiftly-moving-lava-channelized-flow) — Actual channels can move swiftly despite viscous cold fronts.
33. [June 2023 crustal foundering](https://www.usgs.gov/media/images/june-12-2023-crustal-foundering-kilauea) — Dark surface crust grows then sinks, revealing hot orange beneath.
34. [Thermal cameras on lava](https://www.usgs.gov/news/volcano-watch-thermal-cameras-keep-a-cool-eye-hot-lava) — Semi-solid plates can circulate on molten lake surfaces.
35. [Kīlauea summit glow changes](https://www.usgs.gov/observatories/hvo/news/volcano-watch-kilaueas-summit-glow-comes-and-goes) — Reduced activity allows crust coverage and decreased surface motion.
36. [Measuring Kīlauea temperature](https://www.usgs.gov/news/volcano-watch-remotely-measuring-temperature-kilauea-lava) — Visible incandescence changes from red to orange/yellow with heat.
37. [As the Lava Churns](https://www.usgs.gov/media/videos/lava-churns) — Molten surfaces may churn and crust on very different timescales.
38. [Eight-year summit eruption watch](https://www.usgs.gov/news/volcano-watch-kilauea-volcanos-summit-eruption-halemaumau-crater-reaches-8th-anniversary) — Spattering and rockfall interrupt/reorient circulating plate motion.
39. [Thermal mapping of pahoehoe](https://www.usgs.gov/publications/thermal-mapping-a-pahoehoe-lava-flow-kilauea-volcano) — Breakout placement and heat pathways change over time.
40. [Shallow/deep controls on lake motion](https://www.usgs.gov/publications/shallow-and-deep-controls-lava-lake-surface-motion-kilauea-volcano) — Surface spatter/outgassing can drive localized motion.

### E. Cross-institution science and rheology (10)
41. [NPS basaltic lava flows](https://www.nps.gov/subjects/volcanoes/basaltic-lava-flows.htm) — Ropy, rubbly, inflated crust and fresh breakouts are distinct real states.
42. [NPS volcanic lava deposits](https://www.nps.gov/subjects/volcanoes/lava-flows-and-other-volcanic-deposits.htm) — Molten flow emerges from genuine vents and builds terrain.
43. [NASA Nyiragongo flows](https://science.nasa.gov/earth/earth-observatory/nyiragongo-lava-flows-2164/) — Long volcanic paths follow topography and source supply.
44. [NASA Nyiragongo eruption](https://science.nasa.gov/earth/earth-observatory/nyiragongo-volcano-erupts-in-the-congo-9164/) — Relatively low-viscosity lava can travel rapidly; do not equate all lava to tar.
45. [NASA Nyamuragira flow](https://science.nasa.gov/earth/earth-observatory/lava-flow-near-nyamuragira-volcano-76862/) — Thermal contrast isolates active hot regions of flowing material.
46. [Smithsonian Lava Flow image collection](https://a.cf11.si.edu/gallery/ImageCollection.cfm?gallery=HazProcLavaFlows) — Photographic references for lava toes, channels, crust, islands.
47. [Temperature-dependent viscosity study](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/jgrf.20111) — Cooling controls viscosity and makes channel-flow patterns evolve.
48. [Cumbre Vieja rheology experiments](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2022GL100970) — Cooling and crystallization slow lava and change its flow texture.
49. [Thermal camera accuracy study](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2005JB003829) — Emissivity and thermal view matter; do not turn every cell equally bright.
50. [Lava vs. water critical flow study](https://doi.org/10.1029/2022JF006666) — Gravity currents can form waves and jumps despite very different rheology.

## Source → engine boundary
- **Materials / Rendering:** nonuniform dark crust, glowing fractures, slow coherent advected features and close-up 10cm edge language; use shader module consumed by native depth-tested mesh only.
- **Fluid:** shared bounded conservative `ColumnFluidEngine(kind='lava')`, source rate and real slow inflow; no water-style cosmetics or arbitrary sinusoidal fluid displacements.
- **WorldGen & Voxel:** own true channel geometry and solid bank/rock/collision; renderer must not convert pixels into terrain.
- **Lighting:** existing bounded light field uses genuinely wet emissive cells; later LAVA-02 will integrate relative heat/emission gradients.
- **LAVA-03 separately:** physical solidification and actual basalt requires terrain-authoritative edit contract, not just dark drawing.
- **Mobile:** 34 ms observed p95 on screenshot. Each added material feature must be measured against real Wyrm Lair mobile-size WebGL; use a bounded number of integer pixel operations and avoid animated mesh reallocation.
