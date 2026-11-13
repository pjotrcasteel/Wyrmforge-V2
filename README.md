# Wyrmforge V2 — clean-room voxel engine

An independent mobile-first **true-3D destructible terrain engine**, built for
the eventual **Wyrmforge Hunt** game. The long-term required deliverables are
stable mobile performance, destructible hills/cliffs/arches/overhangs,
authoritative character/projectile collision, **bounded structural gravity**,
pixel-readable 2.5D rendering and real integration into Wyrmforge.

**V1 protection:** no V1 runtime, engine code, shaders, material schemas,
internal contracts or assets are reused. The existing game remains playable
and unchanged during standalone engine development. Any future game-side
integration must use newly authored V2 contracts and a guarded rollout.

## Current task and playable-Hunt development

**[Delivery Tasks](docs/DELIVERY-TASKS.md)** is the version-controlled task backlog under the original V2.0–V2.10 milestone structure. Start with **H08-01 — Play Hunt movement**, then connected region travel, natural terrain, trees/boulders, exploration, enemies and extraction. Every task has a visible effect, technical owner, verification and mobile performance gates. Use the stable task ID in future chats and PRs; the backlog can evolve without making another competing roadmap.

## One authoritative roadmap

**[docs/ROADMAP.md](docs/ROADMAP.md)** is the single source of truth. It
preserves the original November 9 Work implementation handover's foundation
milestones **V2.0–V2.7**, incorporates the independent research, and names
the required outcomes beyond the first lab release:

- **V2.8:** first genuine Wyrmforge V2 Hunt terrain integration.
- **V2.9:** bounded hybrid structural gravity, falling clusters and settlement.
- **V2.10:** sustained full-game mobile acceptance and controlled production cutover.

Read [the gravity design](docs/VOXEL-GRAVITY-V2.md),
[architecture decisions](docs/ARCHITECTURE-DECISIONS.md), and
[current evidence / gaps](docs/PROGRESS.md) alongside that **same roadmap**.
Build numbers such as `0.0.024` are **laboratory increments**, not completed
roadmap milestones.

## Playable standalone V2 lab

https://pjotrcasteel.github.io/Wyrmforge-V2/

The lab currently exercises sparse signed-coordinate voxel terrain, WebGL2
exposed-face rendering, deterministic damage and replays, worker-based
meshing experiments, orthographic camera controls, and targeted projectile
terrain rays. **It is not yet the Wyrmforge Hunt renderer or finished engine**.

## Local V2 checks

```bash
node --test tests/*.test.mjs
python -m http.server 8000
```

Open http://localhost:8000/ to inspect the standalone lab.

## Device and production gates

A green GitHub CI result, a working iPhone demo and a Pages deployment are
**not** proof that the whole engine meets its performance goals. Require the
original Work thresholds as initial measured targets (including 60 FPS
supported-device baseline, ~2 ms/frame main-thread terrain budget,
<=100 ms typical edit-to-visible latency, and >=10-minute sustained sessions),
plus physical iPhone Safari **and** Android Chrome evidence under realistic
Hunt enemy, spell, gravity and destruction workloads. Hardware-specific
quality tiers and a slower-device fallback must be measured, not invented.

This repository deploys only the independent V2 lab. Actual Wyrmforge
integration is a required **future milestone**, with separate device and
production-safety acceptance and no automatic replacement of V1.
