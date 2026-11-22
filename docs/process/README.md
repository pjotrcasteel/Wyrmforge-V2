# Process documentation — start here every chat

This folder holds the **execution agreement** for the new Wyrmforge V2 C# engine architecture, not a second roadmap.

Read in the order mandated by [root AGENTS.md](../../AGENTS.md):

1. [OPERATING-RULES.md](OPERATING-RULES.md) — explicit authorization, clean-room C# and no-drift boundaries.
2. [New C# roadmap](../architecture/IMPLEMENTATION-ROADMAP.md) — unique N00–N08 implementation/acceptance order.
3. [TEST-AND-EVIDENCE.md](TEST-AND-EVIDENCE.md) — assistant-owned self-testing, deterministic proof and device gates.
4. [SESSION-PROTOCOL.md](SESSION-PROTOCOL.md) — how new chats verify source state; minimum safe handover requirements.
5. [HANDOVER-STANDARD.md](HANDOVER-STANDARD.md) — proposed one-file-per-workstream protocol, including source/checkpoint SHA validation and authority transfer.
6. [CONTEXT-LOSS-RECOVERY.md](CONTEXT-LOSS-RECOVERY.md) — proposed rolling checkpoints that survive an abrupt, full-chat shutdown; includes the universal restart instruction.
7. [HANDOVER-TEMPLATE.md](HANDOVER-TEMPLATE.md) — complete checkpoint document (template is not evidence).
8. [WORK-STATE.md](WORK-STATE.md) — global navigation index, **not** a substitute for PR/commit/CI verification.

Important owner decisions: new and replaceable **C# engines**, interchangeable **Pages/Blazor and native iOS/Android presenters**, full V1 Fire Tier-I Hunt as a behaviour specification, only simple HEX colors and geometry until functional and platform gates are passed.

**This is a documentation-only change.** No next engine task becomes authorized merely because it appears in the roadmap. The v1 full handover format has now been **documented as a proposal for owner agreement**. Until approved, the mandatory read-only preflight and existing authorization rules remain in effect.

The PR template at [`.github/pull_request_template.md`](../../.github/pull_request_template.md) must be completed with real evidence for every future task.