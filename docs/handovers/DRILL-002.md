# Wyrmforge V2 — DRILL-002 synthetic competing checkpoint

> **READ-ONLY PROCESS REHEARSAL. DO NOT MERGE.** This document deliberately describes conflicting ownership with DRILL-001, and authorizes no engine work.

```yaml
schema_version: 1
project: pjotrcasteel/Wyrmforge-V2
task_id: DRILL-002
milestone: PRE-N00-PROCESS-REHEARSAL
checkpoint_time_utc: "2026-11-22T20:28:47.835Z"
source_branch: "drill/handover-conflict-002"
base_branch: "docs/engineering-rules-and-chat-continuity"
source_sha: "e890e8594ae5121cdee8a029a24f4611e7c91da0"
base_sha: "0a1f52b8730e795e6ab6344e81a38fab51e9da1e"
pr_number: 443
owner_workstream: "DRILL-002 / PR #443"
transfer_intent: BLOCKED
task_status: BLOCKED
recovery_state: CURRENT
implementation_authorization: "Owner authorized the isolated pre-N00 handover dry run only; no production change"
allowed_paths:
  - "docs/handovers/DRILL-002.md"
  - "docs/process/drills/SHARED-REHEARSAL-CONTRACT.md"
forbidden_paths:
  - "game/"
  - "frontends/"
  - "old/"
  - "main"
parallel_workstreams:
  - "DRILL-001 / PR #442 owns docs/process/drills/SHARED-REHEARSAL-CONTRACT.md"
next_action: "Report ownership collision from live PR diff, then STOP; do not merge or edit"
```

## A. Intent

This second controlled draft PR intentionally declares the **same exact owned path** as DRILL-001. It demonstrates that a receiving chat must check live PR diff/ownership, not assume it has exclusive access to a file.

## B. Source

- Source fixture commit: [`e890e8594ae5121cdee8a029a24f4611e7c91da0`](https://github.com/pjotrcasteel/Wyrmforge-V2/commit/e890e8594ae5121cdee8a029a24f4611e7c91da0)
- Branch: [`drill/handover-conflict-002`](https://github.com/pjotrcasteel/Wyrmforge-V2/tree/drill/handover-conflict-002)
- PR: [#443](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/443)
- Base: [`0a1f52b8730e795e6ab6344e81a38fab51e9da1e`](https://github.com/pjotrcasteel/Wyrmforge-V2/commit/0a1f52b8730e795e6ab6344e81a38fab51e9da1e)
- Conflicting primary workstream: [#442](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/442)
- Shared file: `docs/process/drills/SHARED-REHEARSAL-CONTRACT.md`, intentionally different on each branch.

## C. What is implemented

One **synthetic Markdown fixture** and this checkpoint only. No engine functionality; no test implementation.

## D. Evidence matrix

| Category | Status | Proof |
| --- | --- | --- |
| This fixture in GitHub at source SHA | PASS | Source commit above |
| Actual competing path in other draft PR | UNKNOWN UNTIL VERIFIED | Receiver must inspect PR #442 changed filenames |
| Source C# tests | NOT_RUN | Not relevant to synthetic docs |
| Contract or integration tests | NOT_RUN | No engine change |
| Replay/browser/native tests | NOT_RUN | No game implementation |
| Recovery-test outcome | NOT_RUN | Must be exercised by a distinct new chat |

## E. Blocker

Two workstreams claim one path. **Neither may mutate it further or merge it without a coordinator decision.** This simulated ownership collision is expected and has no effect on production source code.

## F. One next action

**STOP**: receiving chat reads both PRs and reports the ownership collision with real path-level evidence. The current user approval covers only documentation fixture setup and read-only recovery verification.
