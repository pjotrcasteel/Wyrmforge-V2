# Frontend adapters — read the root rules first

Read [root AGENTS.md](../AGENTS.md), [operating rules](../docs/process/OPERATING-RULES.md), [frontend contract](../docs/architecture/FRONTEND-BOUNDARY.md), and [HEX-only world rule](../docs/architecture/PLACEHOLDER-WORLD.md) before working here. This subfolder file does NOT authorize implementation.

- Frontends submit user **intent** to the C# simulation; never decide gameplay, voxel edits, damage, enemy AI, random rolls, drops, fluid flow or progression.
- Web: real C# simulation in Blazor WASM, served as static assets on GitHub Pages. A static SVG preview is not a playable C# game.
- Mobile: actual native iOS and Android application hosts with the same C# simulation. A WebView-only packaging is not accepted.
- Rendering is substitutable via stable scene/actor/material/light/telegraph/UI descriptors. Do not read another engine's private memory or rely on a DOM-specific C# core.
- Through N00–N07 use primitive geometry and literal #RRGGBB colors only. No texture imports, final sprites, costly lighting/VFX, or decorative animation work.
- Browser acceptance cannot satisfy native-device acceptance; verify separately. No frontend code changes or deployment without explicit owner approval.