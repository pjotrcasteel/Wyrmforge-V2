# Wyrmforge V2 — GitHub-first chat handover standard (v1)

**Status:** OWNER APPROVED 2026-11-22. Two-chat recovery rehearsal **PENDING**. This is an agreed manual/work-session procedure, not an automated background workflow.  
**Scope:** any workstream that may move between chats, contributors or work sessions.  
**Non-goal:** handovers do not start a new task, run code, merge a PR, deploy, or create a scheduled/background process.

## Emergency recovery does NOT require a final handover

The problem with a traditional handover is that a chat may suddenly become full, leaving no opportunity to ask for one. **Do not rely on a last-message handover.** During an authorized task, keep an incremental GitHub checkpoint updated at meaningful code/test milestones; a new chat can reconstruct the rest from commits and CI. The agreed detailed procedure and one universal no-context restart prompt are in [CONTEXT-LOSS-RECOVERY.md](CONTEXT-LOSS-RECOVERY.md).

This is **owner-approved** working policy, not a background monitor or automatic service. The normal freeze-and-handover steps below remain useful when possible, but are **not required for recovery**.

## 1. Goal and the five invariants

A handover must let a fresh chat **reconstruct the real state without trusting the old chat** and continue exactly one previously authorized task, without task drift or conflicts.

1. **One active workstream = one task ID, one source branch, one owning PR, one checkpoint file.**
2. **No handover without source proof.** Snapshot claims link to an exact known source SHA and verified CI/device evidence; no fabricated results.
3. **No cross-chat write collisions.** An engine/path owner remains assigned until explicitly transferred; another chat cannot assume it from inactivity.
4. **Resume the same scope or stop.** A transfer cannot authorize a new milestone, engine, framework choice, merge or unrelated fix.
5. **GitHub facts outrank chat summaries** for code, while the latest explicit owner instruction governs product intent.

ZIPs, transcripts, screenshots and chat memories may be supplemental references but **never** replace GitHub PRs, exact commits or test records.

## 2. Canonical locations — simple, reviewable and versioned

| Place | Role | Authoritative for |
| --- | --- | --- |
| `AGENTS.md` + `docs/process/OPERATING-RULES.md` | Rules to read at the start | Process and scope boundaries |
| `docs/architecture/IMPLEMENTATION-ROADMAP.md` | One delivery sequence N00–N08 | Planned work and acceptance gates |
| `docs/process/WORK-STATE.md` | Human-friendly navigation index; may lag PR heads | **Pointers only**, not live completion |
| **`docs/handovers/<TASK-ID>.md`** on the owning workstream branch | One current checkpoint per workstream; Git history retains older versions | Last recorded task intent and evidence pointers |
| **Owning GitHub PR** (body or checkpoint comment) | Link to the exact checkpoint commit and latest source revision | Reviewable workstream ownership, state and cross-chat discoverability |
| Git commits / PR changed files / GitHub Actions | Reality check | What actually changed, passed, failed or remains unverified |

No automatic cross-branch consolidation is assumed. Never have two chats edit `WORK-STATE.md` or the same task checkpoint concurrently. The checkpoint is saved to the **task's own branch**. The index is updated by a designated coordinator in a separate reviewed change when necessary, not by every chat racing to edit it.

A handover may be fully documented before a PR is opened; when there is no PR yet, link the task branch and clearly mark `pr: NOT_CREATED`. Create a PR only when the authorized scope permits that action.

### Immutable snapshot versus changing HEAD

A checkpoint is often its own documentation commit. Therefore it must store **`source_sha`**, the final **engine/code** commit being handed over, *not* claim to know its own future commit SHA. After committing the checkpoint, supply the resulting **`checkpoint_commit_sha`** and permanent GitHub permalink to the user / owning PR.

At receiving time:
- Resolve the live branch HEAD and inspect the checkpoint's exact permalink.
- Require the source SHA to be in history; compare source SHA, checkpoint commit and live HEAD.
- If later commits changed code or a conflicting PR has landed, mark the handover **STALE** and reconcile before changing anything.
- A checkpoint commit should only touch the checkpoint and explicitly relevant process docs. If implementation code was modified during the handover itself, freeze again and produce a corrected checkpoint.

GitHub can provide immutable history, but a narrative checkpoint is still only a claim about the source. Tests and native evidence must be inspected separately.

## 3. Handover lifecycle

### Step A — Freeze

1. Finish or stop the **currently authorized** task; do not start the next one.
2. Identify one task ID, workstream branch, owning PR (if any), assigned engine/files, exact source SHA, and permitted/forbidden scope.
3. Fetch live branch/PR state, changes, relevant closed/open issues, workflows and source links.
4. Verify the tests **for that exact SHA**. Report `PASS`, `FAIL`, `NOT_RUN` or `BLOCKED` separately for unit, contract, integration, replay, browser, iOS, Android and performance. No screenshots-only proof.
5. Check for parallel ownership, overlapping PR paths, unpushed work and regression risks. Unpushed edits cannot be handed over as proven GitHub source.

### Step B — Write and publish a single checkpoint

1. Fill [HANDOVER-TEMPLATE.md](HANDOVER-TEMPLATE.md) as `docs/handovers/<TASK-ID>.md` **on the owning branch**. Replace all placeholders; no fictional statuses or evidence.
2. Record owner intent and known decisions **separately from what the code does**. Include exact repro and why a bug matters if anything is blocked.
3. Record `transfer_intent` as one of:
   - `RESUME_SAME_TASK` — existing authorized scope remains unfinished, wait for the user's "continue this task".
   - `WAIT_FOR_REVIEW` — implementation paused for owner review or approval.
   - `BLOCKED` — continuation requires a specific dependency/evidence/permission.
   - `TASK_COMPLETE` — accepted task has no further work authorized; next task is a **recommendation only**.
   - `STOP_ONLY` — no work should resume without new authorization.
4. Commit this **documentation-only checkpoint**, verify the resulting exact commit and tree change list.
5. Place the immutable checkpoint permalink in the owning PR description/comment or provide it in the handover message. Update `WORK-STATE.md` only when specifically coordinating the global index.
6. Produce one short restart instruction pointing to task ID, owning PR and checkpoint commit. Do not require the user to attach a ZIP.

### Step C — Receive in a new chat (read-only preflight)

1. Fetch live **root `AGENTS.md`** and follow its mandated reading order.
2. Locate the **named** task/PR checkpoint. If several workstreams exist and the user says just "continue", **do not guess which**; identify the options and ask for the intended task.
3. Verify full SHA values, source-to-checkpoint ancestry, latest PR state, changed files, conflicts, checks and any later merged work. Treat mismatches as stale until explained.
4. Confirm the exact user-authorized scope, transfer intent, owned files and remaining acceptance criteria.
5. Produce an **evidence-based restart receipt** showing:
   - task ID and branch/PR,
   - source SHA, checkpoint SHA, live HEAD,
   - implemented vs verified vs accepted,
   - last test pass/fail/not-run and blockers,
   - next one action inside existing scope,
   - explicit things **not** being changed.
6. **Only after the user asks to resume the same task** may implementation restart. A handover link alone is not approval to start writing code.
7. Never change another chat's files, merge or deploy under a general "continue" instruction.

## 4. What must be included in every checkpoint

The [single-file template](HANDOVER-TEMPLATE.md) is Markdown for humans with a small YAML metadata block for future validation, plus factual sections:
- identity and source provenance (repository, task, branch, PR, source SHA, base SHA, checkpoint time);
- explicit authorization and transfer intent, named owning engine and allowed/forbidden files;
- **why** the task exists, desired behaviour and immutable design decisions;
- exact completed work and *separate* checks/evidence for each platform;
- current outcome, incomplete work, known failures, minimal repro and artifacts;
- pending dependencies and other concurrent workstreams/PRs;
- one next action within scope, plus optional next milestone **unapproved**;
- recovery/rollback guidance when relevant;
- evidence link ledger with typed `PASS/FAIL/NOT_RUN/BLOCKED` (missing link cannot count as verified).

Never put credentials, tokens, sensitive user data, private device identifiers or personal file paths into a public repository checkpoint.

## 5. Parallel work ownership and task priority

- A task is owned by one workstream. Record `owner: <workstream/PR>` and the `allowed_paths` in the checkpoint and PR.
- Paths touched by multiple workstreams require an explicit coordinator or review before another writer proceeds. A source PR closed/merged does **not** automatically authorize the next milestone.
- If branch changes are unrelated and safely isolated, report them but do not cherry-pick them as part of a handover.
- When another chat has already implemented the next task, do not duplicate it; verify its evidence and continue the approved roadmap.
- `WORK-STATE.md` is an overview only; the active PR and task checkpoint are the detailed record.

## 6. Stop conditions

**Do not write implementation code** when any of the following applies:

- no current explicit authorization for the named task or the new chat only received a handover link;
- the handover names another engine, different task ID, or the user asked for discussion only;
- branch / source SHA / checkpoint SHA cannot be verified;
- CI claims do not match the exact source commit or required device gates are missing;
- unresolved conflicting PR/engine ownership exists;
- the handover says `WAIT_FOR_REVIEW`, `STOP_ONLY`, `TASK_COMPLETE` or `BLOCKED` without resolution;
- a summary claims a feature is complete but GitHub sources/tests show otherwise;
- the only evidence of "native" support is a browser demo or WebView.

If a blocker is fixable **within the already-authorized task**, report and request continuation; never silently expand authority to another engine.

## 7. Two kinds of handover outcomes

**In-flight / mid-task:** resume from a known failing or next test after verifying source; do not restart implementation, run Add-first equivalents, or rewrite an already implemented engine.

**Accepted milestone:** preserve exact evidence/decision and stop. Recommend **one next task**, mark it `NOT_AUTHORIZED`; an explicit new task approval is needed.

## 8. What is deliberately not automated yet

The written procedure can be followed with current GitHub access. It is **not** an automated cross-chat system, does not force another model to read files, and cannot detect an unpushed local change or the private activity of another conversation. Code-side enforcement can later add: checkpoint YAML validation, project dependency checks, PR evidence requirements, branch protection, duplicate file ownership warnings, CI artifact collection, and a bot-updated index. That work requires **separate explicit authorization**.

## 9. Acceptance test for the handover system itself

Before calling the process reliable, stage a **no-code rehearsal** after PR merge/approval:
1. Create a checkpoint for a bounded test-only workstream with an exact known SHA and one intentionally incomplete proof.
2. Open a fresh chat with the restart line from the checkpoint and no copied transcript or ZIP.
3. Check that the receiving chat reads root rules, retrieves the checkpoint, verifies live HEAD/PR/CI, reports the incomplete proof and **does not start an unapproved task**.
4. Introduce a later change to the task branch; verify the receiver detects the stale checkpoint rather than using the old SHA.
5. Simulate a second workstream owning the same files; verify it reports the collision and stops.

This rehearsal is **approved and required before the first engine-implementation milestone**. It has **not been run**. Record its outcome with actual new-chat verification evidence and do not claim it passed prematurely.

## 10. One-line restart instruction

`Resume Wyrmforge V2 task <TASK-ID> from PR <NUMBER>, checkpoint <FULL COMMIT SHA>. Read AGENTS.md, verify live GitHub and tests first. Continue only the previously authorized task after your preflight; do not start another engine or merge anything.`

If the task is not currently authorized, replace "Continue" with "Review the handover and report status only".