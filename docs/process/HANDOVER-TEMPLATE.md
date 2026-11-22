# Wyrmforge V2 — task handover: <TASK-ID>

> **TEMPLATE ONLY — replace EVERY placeholder before publishing. This file is never evidence by itself.**  
> Save an actual handover on its owning branch at `docs/handovers/<TASK-ID>.md`, then commit it and copy the resulting immutable commit permalink into the PR/chat.  
> The `checkpoint_commit_sha` is filled *after* committing, in the PR or chat receipt; do not fabricate a future SHA in this file.

```yaml
schema_version: 1
project: pjotrcasteel/Wyrmforge-V2
task_id: Nxx-yy
milestone: Nxx
checkpoint_time_utc: YYYY-MM-DDTHH:MM:SSZ
source_branch: "<owner-task-branch>"
base_branch: "<verified-base>"
source_sha: "<40-digit final code/content commit SHA before checkpoint>"
base_sha: "<40-digit verified base SHA>"
pr_number: NOT_CREATED
owner_workstream: "<single PR/chat workstream label>"
transfer_intent: RESUME_SAME_TASK # RESUME_SAME_TASK|WAIT_FOR_REVIEW|BLOCKED|TASK_COMPLETE|STOP_ONLY
task_status: IN_PROGRESS # PLANNED|AUTHORIZED|IN_PROGRESS|IMPLEMENTED|NEEDS_PLAYER_REVIEW|ACCEPTED|BLOCKED|SUPERSEDED
implementation_authorization: "<specific prior user instruction, or NOT_AUTHORIZED>"
allowed_paths:
  - "<scoped path or module>"
forbidden_paths:
  - "<out-of-scope path/module>"
parallel_workstreams:
  - "<PR # / task ID / owned paths, or NONE_VERIFIED>"
next_action: "<one in-scope action or STOP>"
```

## Rolling checkpoint rule (even if this chat crashes)

This same file is created when the task starts and updated after each meaningful pushed code/test result. **Do not wait until the owner asks for a handover.** The latest copy records the most recent **source_sha**; the PR/branch history can recover additional commits if the chat ends abruptly. Only mark evidence actually checked; do not pretend a subsequent CI run already passed.

Record a `recovery_state` in the first section below as one of `CURRENT`, `MAY_BE_STALE`, or `UNKNOWN` when checking. The receiving chat must recompute that status against live branch HEAD.

See [CONTEXT-LOSS-RECOVERY.md](CONTEXT-LOSS-RECOVERY.md) for the no-final-message recovery workflow.

## A. What the owner wanted

**Requirement / player outcome:**  
**Explicit decision sources:** links to requirements, ADRs, user-approved task and first-Hunt acceptance where relevant.  
**What is not requested:** list forbidden scope, new features or milestones.

## B. Exact source / branches

| Evidence type | Verified current value | Link / observation |
| --- | --- | --- |
| Workstream branch and source commit | `<branch>` @ `<source_sha>` | `<GitHub commit permalink>` |
| Base branch and SHA | `<base>` @ `<base_sha>` | `<GitHub commit permalink>` |
| Owning PR | `#<number>` or NOT_CREATED | `<PR link>` |
| Relevant changed files | `<paths>` | `<diff permalink>` |
| Other PRs/owners checked | `<PRs / no overlaps found at verification time>` | `<links>` |

## C. What was actually implemented

Record concrete behavioural results with paths and commit links. **Do not describe plans/scaffolds as implemented.**

## D. Verification matrix (at SOURCE SHA)

| Gate | PASS / FAIL / NOT_RUN / BLOCKED | Exact evidence |
| --- | --- | --- |
| C# build and unit | | `<workflow run/command>` |
| Engine contract / fake replacement | | `<run and assertions>` |
| Cross-engine integration | | `<run and scenario>` |
| Deterministic replay / seeded stress | | `<run, seeds and failing seed if applicable>` |
| Web WASM / Pages interactive test | | `<real compiled build URL/test evidence>` |
| Native iOS build and physical device | | `<device/build SHA or BLOCKED>` |
| Native Android build and physical device | | `<device/build SHA or BLOCKED>` |
| CPU/GPU/memory/thermal | | `<real measurements or NOT_RUN>` |

**Verified conclusion:** distinguish implemented, tested and accepted. Do not infer native proof from browser or editor tests.

## E. Unfinished and broken work

**Unfinished parts of this task:**  
**Known defects / exact reproduction:** include seed, step/command, expected and observed output.  
**Blockers and unresolved decisions:**  
**Unpushed/unavailable work:** explicitly mark as NOT_VERIFIED, never imply it is in GitHub.  
**Rollback/recovery:** only relevant actions, never an unapproved code change.

## F. One next action

**Within existing authorized scope:** `<one actionable next step or STOP>`  
**Why this is next:**  
**Specific pass condition:**  
**New milestone idea (NOT AUTHORIZED):** `<optional one suggestion, never an action>`

## G. Chat restart receipt

After the handover commit is published, link its **immutable checkpoint commit SHA** and write:

`Resume Wyrmforge V2 task <TASK-ID> from PR <NUMBER>, checkpoint <FULL SHA>. Read AGENTS.md, compare source SHA/checkpoint SHA/live HEAD, check CI and other workstreams, then post a preflight. Do not expand scope or merge.`

If `transfer_intent` is not `RESUME_SAME_TASK`, the restart instruction must request **review/status only** rather than implementation.