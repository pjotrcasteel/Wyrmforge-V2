# Replaceable web frontend (planned)

The first real frontend will run the same new C# Application/Domain/engine code inside Blazor WebAssembly, statically hosted from GitHub Pages. WebGL/Canvas/HTML is a *renderer only*; no combat, AI, voxel, movement or reward logic in JavaScript.

No new Blazor WebAssembly host has been implemented yet. Until full gameplay parity, the world uses rectangles, solid boxes, capsule actors, basic portal outlines and explicit HEX colors. See docs/architecture/PLACEHOLDER-WORLD.md.

The static visual layout at preview/index.html is **not a playable Hunt** and not connected to the backend. Do not present it as engine proof.
