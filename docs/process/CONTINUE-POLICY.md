# Wyrmforge V2 — owner-approved `continue` semantics

**Decision date:** 2026-11-22. **Status: OWNER APPROVED.** This is a workflow instruction, **not** authorization to begin N00, merge PRs or edit another workstream.

## The simplest rule

**When the user says only `continue`, do the next useful action in the already authorized workstream, independently, if nothing requires owner input.**

The owner should not have to type a new prompt for every analysis, test, fix, evidence capture, commit or checkpoint. A "continue" message is an instruction to **make progress, not to ask whether to make progress**.

### Allowed within an existing authorization

Once the owner has explicitly approved a well-defined task or milestone, `continue` may include these activities when they are **within its authorized scope**:

- Read the latest files, reproduce the issue, design the limited correction, implement the next scheduled piece.
- Execute automated unit/contract/integration/replay/browser checks, read CI, fix failing tests caused by this work and repeat.
- Make scoped commits and update a draft PR and rolling checkpoint, provided that doing so is already allowed for the workstream.
- Proceed from one accepted **subtask to the next subtask inside the same explicitly authorized milestone** when the milestone approval covered that work and dependencies are proven.
- After finishing one step, select the next verifiable in-scope step rather than ending at an arbitrary point. The owner need not restate `continue` for every minor operation performed during the current response.

Do not treat `continue` as permission to do unrelated "nice to have" refactors, to silently select a new engine, or to bypass existing review/quality gates.

### Required pause / owner decision

Stop and ask **one specific question**, or report the blocker, only when:

1. There is no **active, verifiable, previously authorized** scope. E.g. N00 has not yet been authorized.
2. The next action requires starting a **new milestone/feature outside that scope**, changing locked architecture, or editing another chat's owned files.
3. A prohibited/approval-controlled action is needed, especially **merging/deploying** or selecting a native platform framework.
4. There are several possible active workstreams and the current chat/checkpoint does not uniquely identify which one to resume.
5. A mandatory human action is genuinely unavailable to automated tools (e.g. iOS signing/device decision, actual subjective gameplay assessment), or the task is blocked with no permitted workaround.
6. Source/branch ownership or evidence cannot be verified safely.

Do not ask for confirmation just because a test is ready, a small in-scope fix is obvious, or the previous command was short. A fix within an approved contract can be implemented and self-tested without asking again.

## New chat and abrupt recovery

If **exactly one** active workstream is uniquely and safely identifiable from the conversation or verified GitHub task checkpoint, `continue` means:

1. Read root `AGENTS.md` and its linked authoritative documents.
2. Verify live task branch/source SHA/checkpoint SHA/PR, CI, accepted and missing evidence, and parallel work ownership.
3. Resume that **same previously authorized scope** and provide concrete results. A prior checkpoint does not grant authorization for future scope.
4. If the checkpoint is stale, reconcile commits and tests before changing code. If unresolvable, stop and report the specific blocker.
5. If several tasks are equally plausible, ask the owner **which task**, rather than choosing based on recent activity or timestamps.

`continue` may be used repeatedly. Do not require a detailed new-chat prompt when one authorized task is uniquely identified and source verification succeeds.

## When a task finishes

If the next subtask is included in the **existing explicit milestone approval**, continue with it. If the authorized task/milestone is complete and the next work requires **fresh approval**, present a concise accepted-evidence report and a specific next recommended task. **Never claim that a recommendation is already approved.**

If the owner asks only for documentation/review (as during the current pre-N00 phase), `continue` allows only the next safe **documentation or verification** step; it does not start C# engine implementation.

## Technical limitations

This rule governs **what the assistant does when invoked**. It does not authorize background/asynchronous work after a message completes, does not override tool access/limitations and cannot guarantee that another model followed repository rules. Rolling GitHub checkpoints remain the durable recovery mechanism.

## Examples

| User message | Context | Correct behaviour |
| --- | --- | --- |
| `continue` | N01 milestone explicitly authorized, only one active workstream, unit test fails | Fix within N01, rerun tests, commit evidence/checkpoint. No confirmation request. |
| `continue` | N01 subtask accepted; N01 milestone approval covered next subtask | Proceed with next N01 subtask after checking dependencies and ownership. |
| `continue` | N01 approved task completed; N02 **not** authorized | Report completion and propose N02; do not implement N02. |
| `continue` | No engine implementation authorized; only process documentation requested | Continue documentation/read-only checks only. |
| `continue` | Fresh chat sees multiple active, competing workstreams | Ask which workstream; do not guess. |
