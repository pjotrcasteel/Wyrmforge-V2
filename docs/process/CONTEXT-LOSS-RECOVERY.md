# Wyrmforge V2 — context-limit / abrupt-chat-loss recovery

**Status:** OWNER APPROVED on 2026-11-22 as the Wyrmforge V2 handover and emergency recovery policy. **Practical two-chat rehearsal: PENDING.** Documentation only; not an automated service.

## The problem

Chats can hit a conversation/context limit without warning. The previous chat may not be able to accept a final "create handover" command. Therefore **a handover that exists only at the end of a chat is not a safe handover strategy**. The process must remain recoverable when the final response never happens.

We cannot reliably predict, increase or reset a platform chat limit from a repository. We also cannot promise that an assistant will automatically execute work while a chat is closed. We can make the GitHub state durable **as work proceeds**, so the final goodbye is optional.

## Agreed fix: incremental checkpoints while an authorized task is underway

### 1. Create a recovery pointer *before* coding

At the start of a newly authorized task (not just when planning it), create a single owning task branch and task document at `docs/handovers/<TASK-ID>.md` using `HANDOVER-TEMPLATE.md`. It must initially say `IN_PROGRESS` or `AUTHORIZED`, not `ACCEPTED`.

Record: explicit user authorization, task ID, branch, owner/path lock, permitted/forbidden files, task outcome, first planned acceptance check and exact starting SHA.

Create or update the **owning PR** as soon as it is useful and permitted, linking the checkpoint. A PR can remain **draft**. If no PR exists, the branch and checkpoint file are sufficient. A new chat can discover it from GitHub without a last message.

### 2. Save a checkpoint during work; never wait for the final chat message

Update the same checkpoint at these **durable boundaries**:

- After each meaningful pushed **code commit** or test-fix commit, when new source is safely in GitHub.
- After each CI/evidence cycle that changes the confirmed task status (PASS, FAIL, BLOCKED), including failing seeds and run URLs.
- Immediately before and after a high-risk change: public contract change, large refactor, engine boundary crossing, migration, rebasing or handover of file ownership.
- When a task is paused, a blocker is discovered, or a session becomes lengthy/unstable—even if no formal handover was requested.

Each checkpoint should be a **small documentation-only follow-up commit**: source SHA of the last code commit, evidence, current precise next action, and one transfer intent. It should take less work to update than to rebuild the entire task context. Do not generate a huge full-history report every time.

**Reliability goal:** no verified/pushed meaningful implementation step is left undocumented for more than one following checkpoint operation. This is a workflow discipline, not a guaranteed atomic transaction; a tool failure can still interrupt it. The exact Git commits remain independently recoverable.

The checkpoint's own commit SHA is learned **after commit**. Put the immutable checkpoint URL in the owning PR description/comment when possible; don't attempt to put its unknown SHA into the file beforehand.

### 3. Keep a simple project entry point

`AGENTS.md` always points to this protocol, and the owning PR/task record points to the latest checkpoint. `WORK-STATE.md` is **only** a navigation index and should not be updated on every engine commit by multiple chats.

A new chat starts with the stable repository name `pjotrcasteel/Wyrmforge-V2`, scans live open workstream PRs/branches and reads the checkpoint on the relevant task branch. It does not need the old chat to send anything at the end.

When multiple workstreams are active and none is named in the restart request, the receiver must ask which one to resume. It must not guess based on last-updated time.

### 4. Crash recovery when the chat ends with NO handover message

1. User opens a brand-new chat and sends the universal restart instruction below; **no ZIP, conversation summary or old chat reply is required**.
2. The new chat first reads root `AGENTS.md` from the proper ref and all required rules; then checks `main`, open PR heads, task branches, and per-task checkpoint paths.
3. Select the **explicitly named** task. If unspecified and exactly one active authorized task exists, identify it for confirmation; if multiple, ask the user which. Do not use unrelated branch guesses.
4. Compare recorded `source_sha`, checkpoint commit SHA, current branch HEAD, PR diffs and actual CI runs. If the code HEAD is newer than the latest checkpoint, reconstruct missing steps from the Git commits and tests and mark the gap **UNVERIFIED** until checked.
5. Report a **recovery receipt**: task, exact HEAD, what is known/unknown, last proven outcome, one in-scope next step, protected files and current authorization.
6. A single `continue` counts as explicit continuation of the **uniquely identified, previously authorized** task after verified preflight, without asking for routine reapproval. A checkpoint alone is not permission; no new task, merge or deployment. See [CONTINUE-POLICY.md](CONTINUE-POLICY.md).
7. If the source branch is missing, use GitHub PR/commit history to locate source; do not claim that an archived chat or deleted branch is restored if it isn't.

### 5. One universal restart message

For a fresh chat after an abrupt limit (even with NO handover or PR link):

> **Wyrmforge V2 emergency recovery.** Read the current `AGENTS.md` and the GitHub handover/recovery rules. Find the active task checkpoints and open PRs in `pjotrcasteel/Wyrmforge-V2`. Verify live branch SHAs and CI before suggesting changes. Report the exact recoverable task, the missing/unverified work, and the next safe action. Do not implement or merge anything until I explicitly tell you which task to resume.

For a known task, append:

> **Task:** `Nxx-yy` / **PR:** `#number`. After the preflight, resume *only* this already-authorized task when I say continue.

This works without uploading files, asking the previous chat to produce a final message, or recreating the V1/V2 project history.

### 6. Who writes the updates?

**The current active assistant writes them while carrying out the user's authorized task**; the owner should not have to remember a "handover" command or maintain the state manually. GitHub writes must be made using real available tools. There is **no automatic timer, background service or guarantee of activity after the chat closes**.

A task can continue on a one-word `continue` within the owner's original explicitly approved scope; see [CONTINUE-POLICY.md](CONTINUE-POLICY.md). When a task is DONE or at a review gate, record `TASK_COMPLETE` / `WAIT_FOR_REVIEW` and do not silently start a successor.

### 7. Acceptance rehearsal before depending on it

- Begin a non-implementation dry run with a dummy task branch and a checkpoint identifying exact SHA and a deliberately missing test.
- In a separate new chat **without a conventional handover**, send only the universal restart instruction.
- Verify that the second chat identifies the correct task, checks GitHub commits/PR/CI, notices missing evidence, and **does not** implement without approval.
- Make one more test commit without updating the checkpoint to simulate an abrupt stop. Verify the receiver detects the stale checkpoint and reconstructs progress instead of declaring it complete.
- Test two simultaneous workstreams and verify the receiver does not seize another chat's ownership.

**Status:** owner has approved the process. The two-chat rehearsal has **NOT** been executed and is a required gate before N00 engine development; until it passes, do not claim proven cross-chat recovery. A documentation agreement alone cannot force unattended checkpoint writes or override platform limits.