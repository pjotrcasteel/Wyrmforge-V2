# Wyrmforge V2 — verified checkpoint and authorization ledger

> **This file is an INDEX, not authoritative runtime evidence.** Every future chat must compare the listed refs against real GitHub HEADs, PR states and test runs before relying on them. Never treat an old checkpoint as proof that the current repo is unchanged.

**Checkpoint captured:** 2026-11-22 (architecture review).  
**Authorized current task:** **PRE-N00 step 2 COMPLETE**: PR #441 integrated into #439, combined CI PASS, and safe no-main-cutover strategy approved on 2026-11-22. **Next engineering milestone N00 remains NOT AUTHORIZED.**  
**Engine implementation authorization:** **NOT GRANTED** for N00 by the step-2/cutover agreement. The next task requires a specific owner start instruction.  
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
| Current documentation | **PR #441 MERGED into architecture branch** at `7c37882b6ed7900a4ded05aef3334834b4338f21`; the documentation is on PR #439, not yet on `main` |
| First-Hunt parity | V1 source/requirements inventoried; the complete new V2 C# Hunt is **not** implemented |
| Native iOS/Android | No verified installable native C# game apps or real device acceptance |
| Pages | Existing preview is a static primitive visualization, **not yet a compiled Blazor WASM C# playable Hunt** |
| New C# engines | The architecture branch includes independent project scaffolds and a tiny Voxel/WorldGen smoke implementation; do not treat scaffolding as accepted milestone |
| CI | Must check current exact-commit run; test status is not imported from a past chat and is **UNKNOWN** here |

## Latest integration checkpoint (2026-11-22)

**Task:** `PRE-N00-INTEGRATION` — [details and evidence](../handovers/PRE-N00-INTEGRATION.md).

- PR #441 **merged** into PR #439's architecture branch at **`7c37882b6ed7900a4ded05aef3334834b4338f21`**; documentation only (17 markdown files since the previous architecture HEAD).
- CI on that commit: **PASS** [PR run 45067457240](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/45067457240) and [push run 45067452104](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/45067452104). Engine source and `old/` were not altered by the docs merge.
- `main` still at `a2d7713f91d046d374734ce638c297db8be086ad` before this checkpoint; PR #439 remains open/draft.
- **OWNER DECISION 2026-11-22:** preserve the existing playable JS game on `main` and GitHub Pages. Do NOT merge #439 to `main` or deploy its static preview. A separate cutover will be reviewed only once a genuinely compiled and usable Blazor WASM C# game is available.
- **PARALLEL:** preserve open legacy Lava PR #432 and its history, with no merge/discard or silent port to C#. Physics PR #440 remains separately owned/unmerged; DRILL PR #442/#443 remain unchanged.
- **Step-2 closeout:** PASS on integration and CI. N00 may develop on a dedicated child feature branch of the architecture line **when specifically authorized**; keep `main`/Pages playable until a reviewed playable Blazor cutover. No automatic merge/deploy.

## Governance

- The owner subsequently authorized **step 2 pre-N00 integration**; PR #441 was merged into the architecture branch. This authorization does not permit replacing the live Pages game by an unrequested deployment or discarding parallel legacy PR #432.
- No **N00 implementation**, Pages deployment or native build is authorized by this checkpoint. PR #439 -> `main` has **not** been merged; its Pages workflow would replace the currently playable JS Pages artifact with a static HEX preview. Owner-approved strategy deliberately defers this.
- **Process gate DRILL-001: PASS**, documented in [`DRILL-001-RESULT.md`](DRILL-001-RESULT.md) after the owner supplied the separate-chat read-only audit and the GitHub history was independently verified. The synthetic DRILL-001 fixture itself remains `BLOCKED` as expected. **N00 still requires explicit authorization**, as do merges/deployments.
- Proposed docs: `docs/process/HANDOVER-STANDARD.md`, `HANDOVER-TEMPLATE.md`, and `CONTEXT-LOSS-RECOVERY.md`, added to documentation PR #441; no functioning automated/background service.
- **Owner decision on 2026-11-22: APPROVED.** GitHub-first handovers use rolling task checkpoints during authorized work, not a final chat message. **Two-chat read-only rehearsal DRILL-001 PASSED 2026-11-22**; actual platform cutoff/automatic checkpoint persistence was NOT TESTED.
- **Owner decision on 2026-11-22: APPROVED.** The one-word `continue` advances the unique, verified, already-authorized workstream without repeated checks with the user. It does not authorize an unapproved engine/milestone, merge or deployment. See `docs/process/CONTINUE-POLICY.md`.
- **Step-2 decision:** OWNER APPROVED 2026-11-22. Protect the existing playable JS `main` and Pages, preserve Lava PR #432, build C# N00 separately from architecture branch, and consider `main`/Pages migration only when playable Blazor WASM is ready and reviewed.
- Next possible engineering milestone (**requires explicit owner start authorization**): N00 Contracts + simulation clock + automated Test Harness + cross-host feasibility proof.

## Updating this checkpoint

At every approved meaningful checkpoint, record exact branch/commit, task scope, PR link, CI evidence, test types with PASS/FAIL/NOT_RUN/BLOCKED, active parallel owners, unresolved blocker and one next task. Never claim "merged" or "device tested" based only on intention. If old facts become inaccurate, update them **in the owning branch** or point to the newer checkpoint; do not overwrite concurrent updates.