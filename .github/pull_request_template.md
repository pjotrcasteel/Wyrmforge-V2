# Wyrmforge V2 — scope, ownership and evidence

> A checked box is a claim requiring a linked source, not evidence by itself. Planning and architectural PRs may mark implementation-specific items N/A. No PR is permission to merge.

## Authorization and scope

- **Task ID and explicit owner authorization:** 
- **Expected user/player outcome:** 
- **Allowed paths and owner engine:** 
- **Forbidden/out-of-scope changes:** 
- **Other active chat/PR collision check:** 
- [ ] No work beyond the explicitly authorized scope
- [ ] No V1/old JavaScript engine source imported/copied into the new C# implementation

## Architecture and presentation

- **Updated public contracts/versions and owning state:** 
- [ ] Engine implementations depend only on Contracts, not other concrete engines
- [ ] Only composition root wires concrete engines
- [ ] C# game state stays authoritative; frontends consume immutable snapshots
- [ ] Web is Blazor WASM/Pages development; native iOS and Android remain separate acceptance
- [ ] N00–N07 presentation is HEX colors / geometric shapes only

## Executed evidence (not promises)

| Gate | PASS / FAIL / NOT RUN / BLOCKED | Exact command, run link, seed or device |
| --- | --- | --- |
| C# unit and contract | | |
| Cross-engine with fake/real ports | | |
| Architecture checks | | |
| Replay, negative paths, seeded stress | | |
| Real browser WASM integration | | |
| Native iOS / Android | | |
| Perf / memory / thermal | | |

- **Exact commit SHA:** 
- **Known failures and unverified gates:** 
- **Why scope can or cannot be accepted now:** 
- **One next task (not automatically authorized):** 

Read: `AGENTS.md`, `docs/process/OPERATING-RULES.md`, `docs/architecture/IMPLEMENTATION-ROADMAP.md`, `docs/process/TEST-AND-EVIDENCE.md`, `docs/process/SESSION-PROTOCOL.md`.