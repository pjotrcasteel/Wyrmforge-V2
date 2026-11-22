# Wyrmforge V2 — new C# build rules

This is a **brand-new clean-room C#** implementation, not a rename, JS-to-C# translation or V1 code fork. Review README.md, docs/architecture/ENGINE-OWNERSHIP.md, FRONTEND-BOUNDARY.md and IMPLEMENTATION-ROADMAP.md before adding code.

- Keep exactly one authoritative owner for each mutable game concept.
- Engine implementation projects reference shared contracts, never other engine implementations.
- Cross-engine wiring is only in an explicit composition root (Host), via dependency injection.
- Frontend code may submit player intentions and render immutable snapshots; never resolve combat, collision, physics, AI, RNG, fluid simulation or gameplay rewards.
- The web frontend is a Blazor WASM + presentation adapter on Pages. The same C# game source must run inside actual native iOS and Android apps before native acceptance.
- Every new visible world element remains a **primitive shape with a literal HEX color (#RRGGBB)** until the playable Hunt and engine validation gates are met. Do not add textures, premium VFX, realistic sprites or lighting polish now.
- Source-reference V1's Hunt expectations and old V2's engineering lessons; **do not copy old implementation code**. Tests should describe outcomes, not mirror old internals.
- Each pull request specifies engine owner, contracts, dependencies, command/snapshot changes, compile/replay/integration tests, benchmark and actual device proof if applicable.
- Old sources in old/ are READ ONLY, not build inputs. No restore/test/publish pipeline may include old/.
- Do not declare a project DONE from a scaffold, green CI or static placeholder preview.
