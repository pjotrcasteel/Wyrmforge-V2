# Wyrmforge V2 — verified checkpoint and authorization ledger

> **This file is an INDEX, not authoritative runtime evidence.** Every future chat must compare the listed refs against real GitHub HEADs, PR states and test runs before relying on them. Never treat an old checkpoint as proof that the current repo is unchanged.

**Checkpoint captured:** 2026-11-22 (architecture review).  
**Authorized current task:** documentation of working rules, testing strategy **and proposed handover mechanism** only.  
**Engine implementation authorization:** **NOT GRANTED** for future stages by these requests; the handover design is documentation-only.  
**Active delivery milestone:** pre-N00 architecture/roadmap and process agreement.  
**Visual lock:** HEX colors and primitive shapes through N00–N07; N08 is final visual presentation.  
**Reference repo:** `pjotrcasteel/Wyrmforge` (V1 first-Hunt behaviour only).  
**Production repo:** `pjotrcasteel/Wyrmforge-V2`.

## GitHub baseline when this checkpoint was written

| Item | Fact to re-check next session |
| --- | --- |
| `main` | `a2d7713f91d046d374734ce638c297db8be086ad`; still original browser/JS tree at time of inspection |
| PR #439 | Draft/open, `architecture/native-mobile-engine-blueprint` -> `main`; head then `9959c71bbfc6673ae72f181947a2f5bdb5f6f9e1` |
| PR #440 | Draft/open, `feature/n00-physics-contract-and-hex-gates` -> architecture branch; prematurely started C# Physics implementation, **not approved/merged** |
| Current documentation | This separate docs-only branch targets the architecture branch and requires independent review/merge authorization |
| First-Hunt parity | V1 source/requirements inventoried; the complete new V2 C# Hunt is **not** implemented |
| Native iOS/Android | No verified installable native C# game apps or real device acceptance |
| Pages | Existing preview is a static primitive visualization, **not yet a compiled Blazor WASM C# playable Hunt** |
| New C# engines | The architecture branch includes independent project scaffolds and a tiny Voxel/WorldGen smoke implementation; do not treat scaffolding as accepted milestone |
| CI | Must check current exact-commit run; test status is not imported from a past chat and is **UNKNOWN** here |

## Governance

- The owner asked for **documentation**, then a **discussion about handovers**. This authorizes documentation changes only.
- No source coding, testing-driven implementation, merge, Pages deployment or native build is authorized by this checkpoint.
- Next deliverable in this chat: review the **proposed v1 GitHub handover standard** with the owner, clarify any unresolved choices, and treat approval as separate from code implementation authorization.
- Proposed docs: `docs/process/HANDOVER-STANDARD.md`, `HANDOVER-TEMPLATE.md`, and `CONTEXT-LOSS-RECOVERY.md`, added to documentation PR #441; no functioning automated/background service.
- The **abrupt-chat-limit solution is rolling task checkpoints written while the active task is being done**, not a handover at the end. Owner agreement and a no-code rehearsal remain pending.
- Next possible engineering milestone (only on fresh user authorization): N00 Contracts + simulation clock + automated Test Harness + cross-host feasibility proof.

## Updating this checkpoint

At every approved meaningful checkpoint, record exact branch/commit, task scope, PR link, CI evidence, test types with PASS/FAIL/NOT_RUN/BLOCKED, active parallel owners, unresolved blocker and one next task. Never claim "merged" or "device tested" based only on intention. If old facts become inaccurate, update them **in the owning branch** or point to the newer checkpoint; do not overwrite concurrent updates.