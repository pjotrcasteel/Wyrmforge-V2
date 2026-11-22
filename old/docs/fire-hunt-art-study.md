# Fire Hunt art study

This shortlist of 50 distinct sources includes developer references, technique documentation, visual examples, and geological references. Source assets are used as references only.

- **Pixel size and cadence.** At the Hunt camera, a voxel occupies 16 CSS pixels horizontally. The lava texture uses eight texels per voxel and advances in fixed steps at eight frames per second. Its palette and drawn motif make the hot ribbons readable as clusters.
- **Scene hierarchy.** Keep the strongest values in the hazard. Add a solid crossing and dark banks so hazard recognition has a shape and the scene gives the player somewhere to go. The original lab geometry still uses the same character scale and movement solver.
- **Volcanic structure.** A cooled skin forms around active lava. Translate that into subdued banks, a darker margin and a bright mobile center. The color placement borrows from this distinction, with no physical cooling or light simulation.
- **Boundaries.** Maintain runtime material IDs. Compare hard and blended exposed faces in the lab. Use world-space sampling so excavated edges do not shift the paint.

- **Forest progression.** Use the [exact Wet Forest prop artwork](../art/wet-forest/README.md) as the reviewed visual reference for the living canopy. Wyrm influence lowers the forest’s value, then breaks the canopy with charred silhouettes. The geometry stays stable for these comparisons. A one-microvoxel inset beside the grass casts a readable edge silhouette at the existing Hunt scale.

## Pixel-art craft and animation

- [GitHub - saint11/Saint11Tutorials · GitHub](https://github.com/saint11/Saint11Tutorials)
- [Pixel Art Tutorials - Saint11](https://saint11.org/blog/pixel-art-tutorials/)
- [Derek Yu](https://www.derekyu.com/extras.html)
- [Pixel Art: Where to Start](https://lospec.com/articles/pixel-art-where-to-start/)
- [Pixel Art Tutorials by Pedro Medeiros](https://lospec.com/pixel-art-tutorials/author/pedro-medeiros)
- [Pixel art blog — SLYNYRD](https://www.slynyrd.com/blog/)
- [My Tileset Workflow (Pixel Art & Gamedev Tutorial) - YouTube](https://www.youtube.com/watch?v=btnH0x7_1g8)
- [Pixel Art Class - Grassy Platform Tileset Tutorial - YouTube](https://www.youtube.com/watch?v=jQZ12jmwx7w)
- [Pixel Art Tileset Tutorial (Top Down Pixel Art) - YouTube](https://www.youtube.com/watch?v=gij7lpQv-qo)
- [PixelOver Tutorials - PixelOver Manual](https://docs.pixelover.io/tutorials/)
- [docs/animation.md at main · aseprite/docs · GitHub](https://github.com/aseprite/docs/blob/main/animation.md)
- [Aseprite - Docs - Tilemap](https://aseprite.org/docs/tilemap/)
- [Palette - Pico-8 Wiki](https://pico8wiki.com/index.php?title=Palette)
- [Palette List](https://lospec.com/palette-list/tag/magma)
- [Endesga 32 Palette](https://lospec.com/palette-list/endesga-32)

## Game art and gameplay readability

- [THE ART OF THE GAME - Yacht Club Games](https://www.yachtclubgames.com/blog/the-art-of-the-game/)
- [Art Direction & Visual Language: Celeste systems | Game Design Lab](https://teemo.dev/game-design/celeste/systems/art-direction-and-visual-language/)
- [Lava - Official Terraria Wiki](https://terraria.wiki.gg/wiki/Lava)
- [Resource pack | Minecraft Wiki](https://theminecraftwiki.com/wiki/resource-pack/)
- [The Dead Cells 3D to pixel-art pipeline, and how to copy it](https://pixor.art/learn/dead-cells-3d-pipeline/)
- [Eastward's creators share insights on making pixel art adventures](https://www.gamedeveloper.com/art/eastward-s-creators-share-insights-on-making-pixel-art-adventures)
- [Hyper Light Drifter Interview: Everything You Need To Know About Heart Machine’s 2D Action RPG](https://gamingbolt.com/hyper-light-drifter-interview-everything-you-need-to-know-about-heart-machines-2d-action-rpg)
- [Interview Game Dev The Game Kitchen share about “Blasphemous” and Onward – Readers Digested](https://www.readersdigested.com/interview-game-dev-the-game-kitchen-share-about-blasphemous-and-onward/)
- [Designing the background - Pixel Hero - itch.io](https://itch.io/devlog/1362461/designing-the-background.amp)
- [Diablo 3 Producer: 'Color is Your Friend' | Shacknews](https://www.shacknews.com/article/53431/diablo-3-producer-color-is)
- [GDC Vault - 'Diablo IV': The Art of Open World Sanctuary](https://gdcvault.com/play/1034222/-Diablo-IV-The-Art)
- [Visual Effects | Riot Games](https://www.riotgames.com/en/artedu/visual-effects)
- [Making games accessible - UWP applications | Microsoft Learn](https://learn.microsoft.com/en-us/windows/uwp/gaming/accessibility-for-games)
- [Illustrative Rendering in Team Fortress 2](https://cdn.steamstatic.com/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2.pdf)
- [How Was Octopath Traveler's Pixel Art Made in UE4? | Glasp](https://glasp.co/youtube/K6wW0pO08LE)

## Lava and tile examples

- [Tile-Based Platformer Assets | OpenGameArt.org](https://opengameart.org/content/tile-based-platformer-assets)
- [Seamless Lava Animated Tile | OpenGameArt.org](https://opengameart.org/content/seamless-lava-animated-tile)
- [New Platformer Pack · Kenney](https://kenney.nl/assets/new-platformer-pack)
- [Pixel Art Dungeon Tileset 16x16 - Animated Lava, Water, Props by TheAllBlu](https://theallblu.itch.io/dungeon-tileset-16x16)
- [Lava - Mega Man Maker - PC / Computer - The Spriters Resource](https://www.spriters-resource.com/pc_computer/megamanmaker/asset/527457/)
- [File:SMW Sprite Lava.png - Super Mario Wiki, the Mario encyclopedia](https://www.mariowiki.com/File%3ASMW_Sprite_Lava.png)

## Rendering and material technique

- [Viewport — Godot Engine (stable) documentation in English](https://docs.godotengine.org/en/stable/classes/class_viewport.html)
- [2d-pixel-perfect/Documentation/2D Pixel Perfect Camera.md at master · Unity-Technologies/2d-pixel-perfect · GitHub](https://github.com/Unity-Technologies/2d-pixel-perfect/blob/master/Documentation/2D%20Pixel%20Perfect%20Camera.md)
- [Texture filtering | Defold](https://defold.com/manuals/texture-filtering/)
- [# Future Work](https://advances.realtimerendering.com/s2010/Vlachos-Waterflow%28SIGGRAPH%202010%20Advanced%20RealTime%20Rendering%20Course%29.pdf)
- [Texture Distortion](https://catlikecoding.com/unity/tutorials/flow/texture-distortion/)
- [Landscape Materials | Unreal Engine 4.27 Documentation | Epic Developer Community](https://dev.epicgames.com/documentation/unreal-engine/landscape-materials?application_version=4.27&lang=en-US)
- [content/files/en-us/web/api/webgl_api/webgl_best_practices/index.md at main · mdn/content · GitHub](https://github.com/mdn/content/blob/main/files/en-us/web/api/webgl_api/webgl_best_practices/index.md)
- [Chapter 20. Texture Bombing | NVIDIA Developer](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-20-texture-bombing)
- [Height Blend | Adobe Substance 3D Designer](https://experienceleague.adobe.com/en/docs/substance-3d-designer/using/substance-graphs/nodes-reference-for-substance-graphs/node-library/material-filters/effects-material/height-blend)
- [Chapter 1. Generating Complex Procedural Terrains Using the GPU | NVIDIA Developer](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu)
- [glTF/extensions/2.0/Khronos/KHR_materials_emissive_strength/README.md at main · KhronosGroup/glTF · GitHub](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_emissive_strength/README.md?plain=1)

## Volcanic form and cooling

- [Pāhoehoe flow cooling, discharge, and coverage rates from thermal image chronometry | U.S. Geological Survey](https://www.usgs.gov/publications/pahoehoe-flow-cooling-discharge-and-coverage-rates-thermal-image-chronometry)
- [USGS: Volcano Hazards Program Glossary - PAHOEHOE](https://volcanoes.usgs.gov/vsc/glossary/pahoehoe.html)
- [Oceanic Hotspots - Geology (U.S. National Park Service)](https://www.nps.gov/subjects/geology/plate-tectonics-oceanic-hotspots.htm)

