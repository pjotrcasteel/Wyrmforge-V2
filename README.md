# Wyrmforge V2

A completely independent, mobile-first voxel engine laboratory. **No V1 runtime, source, assets, shaders, event contracts, terrain constants, or deployment artifacts.**

## Live site (once Pages is enabled and deployment succeeds)

https://pjotrcasteel.github.io/Wyrmforge-V2/

## Repository

- `src/voxel-world.mjs`: independently authored signed-coordinate, sparse 16³ voxel storage with snapshot copies.
- `main.mjs` and `index.html`: intentionally minimal Canvas2D foundation visualizer. **Not the final WebGL2 mesher or production engine.**
- `tests/voxel-world.test.mjs`: deterministic and isolation-oriented unit tests.
- `docs/ROADMAP.md`: V2.0–V2.7 implementation and acceptance plan.
- `docs/RESEARCH.md`: independent external technical research.
- `docs/ARCHITECTURE-DECISIONS.md`: initial design decisions.

## Run

```bash
node --test tests/*.test.mjs
python -m http.server 8000
```

Open http://localhost:8000/.

## Pages deployment

The workflow `.github/workflows/pages.yml` runs V2-only tests and deploys **this repository only**. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. This setting is controlled by the repository owner; a committed workflow does not itself prove Pages is enabled.

## Status

Initial standalone foundation committed. CI execution, Pages availability, and real iPhone/Android performance are **not yet verified**. The Canvas2D lab is a deliberately disposable diagnostic shell; it is not the final V2 rendering architecture.

## V1 protection

This repository never publishes to the V1 Pages site. It has no V1 code dependencies. Any future game integration requires a separately approved project.
