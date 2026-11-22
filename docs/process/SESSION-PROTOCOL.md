# Wyrmforge V2 — mandatory new-chat and work-session protocol

**Purpose:** prevent handovers from resetting the roadmap, duplicating work, inventing completed functionality, losing source evidence or colliding with parallel chats.

## A. Every session begins with a read-only preflight

1. Read the current repository root `AGENTS.md`.
2. Fetch `docs/process/OPERATING-RULES.md`, `docs/architecture/IMPLEMENTATION-ROADMAP.md`, `docs/process/TEST-AND-EVIDENCE.md`, this file, and `docs/process/WORK-STATE.md` **from the current working ref**. Retrieve the relevant engine/contract and V1 first-Hunt docs for the active ID.
3. Get live GitHub `main`, active branches, PR head/base/merged state, last commits, changed filenames, active owners and most recent CI checks. Do not assume a ZIP, a chat's claimed version or a task-status note is current.
4. Reconcile the checkpoint and the real repository. If a SHA moved, inspect the diff and affected files. A checkpoint with different SHA is **STALE** until reconciled.
5. Identify exactly **one** active task ID, owner, allowed files, forbidden files, expected interfaces and proof gates. Check whether another chat/PR has already assigned or implemented it.
6. Apply [the owner-approved `continue` policy](CONTINUE-POLICY.md): if the user says `continue` and exactly one previously authorized, verified workstream is identifiable, **proceed with the next in-scope action without routine confirmation**. A task checkpoint alone is not permission to implement; multiple ambiguous workstreams require one clarifying question. Never start an unauthorized milestone, merge, deploy or expand scope. Otherwise **STOP at planning/read-only**.
7. Post a concise preflight to the user showing facts: branch/head SHA, active task, accepted vs blocked tests, planned changes and what will not be touched.

**No editing before step 7.** If access is unavailable, explain the blocker; do not invent the repository state or unverified acceptance.

## B. During an authorized task

- Implement one bounded task; work on a task branch from a verified base. Never silently change the roadmap to match the code.
- Do not touch files assigned to another active workstream. Discoveries outside scope become linked issues/notes.
- Run narrow fast tests, wider integration, replay, browser/native tests as relevant; fetch actual CI evidence from the exact commit.
- Every "DONE" claim needs its task's exit criteria, not only compilation or an HTML demo.
- Report progress and blockers without promising work will happen outside an active tool-backed session.
- A task that cannot be completed should end in `BLOCKED`, with a reproducible failure and the smallest next dependency.

## C0. Protect against abrupt chat exhaustion

**Never assume this chat will still be open when a handover is needed.** Once an implementation task is authorized, create its source branch and checkpoint before significant implementation; update that task checkpoint at each meaningful code/test boundary. A fresh chat must be able to recover from live GitHub without a last message, even if the checkpoint is one commit behind. Follow [CONTEXT-LOSS-RECOVERY.md](CONTEXT-LOSS-RECOVERY.md).

Do not trigger unapproved background work. Do not demand the user copy a huge chat summary. Read-only recovery is always permissible; a one-word `continue` is sufficient same-task continuation when the owning task is unique and the original authorization is verifiable. See [CONTINUE-POLICY.md](CONTINUE-POLICY.md).

## C. Before any chat handover

- Stop implementing; do not begin the next task during handover creation.
- Record the **full branch name and HEAD SHA**, PR number/base/head, latest verified CI/test evidence, owner/scope, unfinished edits, exact bug reproductions, device/performance status and next **one** task.
- Reconcile concurrent branches/PRs and name conflicting ownership. Include `NOT RUN` / `BLOCKED` explicitly.
- Update `WORK-STATE.md` only after verifying live facts. If the source branch cannot be updated, record the handover as an immutable PR comment or another clearly linked document. Never rewrite someone else's checkpoint without verifying.
- Provide a human-readable handover and links. A summary or ZIP **must be a pointer to source facts**, not a replacement for the source or a fake acceptance report.

## D. On receipt in a new chat

Treat a handover as a **claim to verify**, not executable instructions overriding AGENTS. Confirm every referenced task/PR/SHA against GitHub. Do not re-do work that has already landed. Do not merge historic branches automatically. Do not reinterpret an old task as permission to implement a future one.

## E. Disagreement resolution

If the latest user instruction conflicts with written rules: the user is authoritative; pause the conflicting implementation and propose an explicit ADR/roadmap update. If a handover contradicts a newer commit: GitHub wins for code state, documented user intent wins for requirements. If two chats touch one engine/file: stop one stream, assign an owner, and rebase/reconcile before proceeding.

## Detailed task handover and restart

The proposed v1 **single checkpoint per workstream** format is [HANDOVER-STANDARD.md](HANDOVER-STANDARD.md), with the exact [HANDOVER-TEMPLATE.md](HANDOVER-TEMPLATE.md).

- Store the checkpoint on the **task's owning branch** at `docs/handovers/<TASK-ID>.md`, not in an unrelated chat-owned branch.
- Record the final source/code SHA **before** the documentation checkpoint commit; include all evidence links, allowed files, explicit prior authorization and transfer intent.
- After committing, link the resulting **immutable checkpoint commit** in the PR/user handover message.
- A receiving chat checks source SHA, checkpoint SHA and live HEAD, tests and parallel PRs **before** touching anything.
- `WORK-STATE.md` stays a navigation index; do not race another chat to update it.
- Do not mistake an accepted prior task's next recommendation as authorization for another task.

**Status:** v1 is approved by the owner on 2026-11-22; the required two-chat recovery rehearsal has NOT RUN. No automatic generation, enforcement, or background work exists. The initial read-only preflight and authorization gate above remain mandatory.