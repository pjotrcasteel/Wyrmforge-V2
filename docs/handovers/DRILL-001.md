# Wyrmforge V2 — DRILL-001 synthetic recovery checkpoint

> **TEST FIXTURE ONLY.** Never merge into production. No engine implementation authorized. This checkpoint intentionally contains **missing evidence** and may become stale after a simulated abrupt stop. Its claims are not proof; verify against GitHub.

```yaml
schema_version: 1
project: pjotrcasteel/Wyrmforge-V2
task_id: DRILL-001
milestone: PRE-N00-PROCESS-REHEARSAL
checkpoint_time_utc: "2026-11-22T20:28:10.148Z"
source_branch: "drill/handover-crash-recovery-001"
base_branch: "docs/engineering-rules-and-chat-continuity"
source_sha: "f9beb8a52a8da764ac53180c2c26538dad71f691"
base_sha: "0a1f52b8730e795e6ab6344e81a38fab51e9da1e"
pr_number: 442
owner_workstream: "DRILL-001 / PR #442"
transfer_intent: BLOCKED
task_status: BLOCKED
recovery_state: CURRENT
implementation_authorization: "Owner explicitly approved only preparatory handover rehearsal step 1 on 2026-11-22; NO engine work"
allowed_paths:
  - "docs/handovers/DRILL-001.md"
  - "docs/process/drills/SHARED-REHEARSAL-CONTRACT.md"
  - "docs/process/drills/DRILL-001-POST-CHECKPOINT.md"
forbidden_paths:
  - "game/"
  - "frontends/"
  - "old/"
  - "main"
  - "docs/process/WORK-STATE.md"
parallel_workstreams:
  - "DRILL-002 (separate draft PR expected; inspect live GitHub for ownership overlap)"
next_action: "Read-only new-chat verification of PR #442, source-to-checkpoint-to-live HEAD, absent test evidence, and DRILL-002 collision; DO NOT CHANGE ANYTHING"
```

## A. Authorized purpose

Demonstrate recovery from an abrupt full chat without relying on a farewell message. Verify: missing test proof remains NOT_RUN, code/source changed after last checkpoint is discovered as STALE, and a second workstream's ownership conflict is detected.

**This drill may create only isolated Markdown fixtures and draft test PRs.** It cannot start N00, update engines, merge PRs, or deploy.

## B. Exact source and claim to verify

| Evidence | Recorded at checkpoint | Link |
| --- | --- | --- |
| Task source state BEFORE checkpoint | `f9beb8a52a8da764ac53180c2c26538dad71f691` | https://github.com/pjotrcasteel/Wyrmforge-V2/commit/f9beb8a52a8da764ac53180c2c26538dad71f691 |
| Branch | `drill/handover-crash-recovery-001` | https://github.com/pjotrcasteel/Wyrmforge-V2/tree/drill/handover-crash-recovery-001 |
| Base branch SHA | `0a1f52b8730e795e6ab6344e81a38fab51e9da1e` | https://github.com/pjotrcasteel/Wyrmforge-V2/commit/0a1f52b8730e795e6ab6344e81a38fab51e9da1e |
| PR | `#442` | https://github.com/pjotrcasteel/Wyrmforge-V2/pull/442 |
| Owned path | `docs/process/drills/SHARED-REHEARSAL-CONTRACT.md` | Inspect both DRILL PR diffs |

**The later checkpoint commit SHA is deliberately not predicted here; find it in this file's Git history / PR.** Check branch HEAD, verify source ancestry, inspect later commits; do not assume the checkpoint remains current.

## C. What is implemented

Only one synthetic Markdown file. **No game functionality.** Nothing marked IMPLEMENTED or ACCEPTED.

## D. Test evidence at source_sha

| Gate | Status | Proof |
| --- | --- | --- |
| Markdown fixture exists at source_sha | PASS | Git blob at the source commit above |
| C# build and unit | NOT_RUN | Deliberately not executed for drill |
| Engine contracts / fake replacement | NOT_RUN | No engine work |
| Cross-engine integration | NOT_RUN | No engine work |
| Deterministic replay / stress | NOT_RUN | No engine work |
| Browser/Pages | NOT_RUN | No web app involved |
| Native iOS/Android | NOT_RUN | No device testing |
| Performance | NOT_RUN | No measurements |
| Two-chat recovery test | NOT_RUN | Must be verified in a new conversation |

## E. Known simulated problems

- **Missing proof:** no CI success or native evidence exists for this drill; never call it PASS.
- **Stale-checkpoint scenario:** a later documentation commit may exist beyond this checkpoint; reconstruct what changed rather than pretending the source SHA equals live HEAD.
- **Parallel owner collision:** DRILL-002 may claim the exact same shared fixture path. Check actual PR diffs/branch state.
- **No production blocker:** this is a controlled rehearsal; it must not trigger engine development or force merges.

## F. One next action

Read-only receipt in a new chat: check all rules, then verify PR #442 and any concurrent DRILL PR, prove whether the checkpoint is stale, flag the missing evidence, and report safe next step **STOP**. Do not mutate repository files or mark drill accepted in this branch.

## G. Restart

`Test Wyrmforge V2 herstel: DRILL-001, PR #442. Lees AGENTS.md en het checkpoint op de eigen branch. Verifieer source/checkpoint/HEAD, testbewijs en eigendomsconflict via GitHub. Alleen rapporteren, niets wijzigen.`
