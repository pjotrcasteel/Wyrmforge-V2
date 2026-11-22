# Process documentation — start here every chat

This folder holds the **execution agreement** for the new Wyrmforge V2 C# engine architecture, not a second roadmap.

Read in the order mandated by [root AGENTS.md](../../AGENTS.md):

1. [OPERATING-RULES.md](OPERATING-RULES.md) — explicit authorization, clean-room C# and no-drift boundaries.
2. [New C# roadmap](../architecture/IMPLEMENTATION-ROADMAP.md) — unique N00–N08 implementation/acceptance order.
3. [TEST-AND-EVIDENCE.md](TEST-AND-EVIDENCE.md) — assistant-owned self-testing, deterministic proof and device gates.
4. [SESSION-PROTOCOL.md](SESSION-PROTOCOL.md) — how new chats verify source state; minimum safe handover requirements.
5. [WORK-STATE.md](WORK-STATE.md) — latest checkpoint, **not** a substitute for GitHub HEAD/PR/CI verification.

Important owner decisions: new and replaceable **C# engines**, interchangeable **Pages/Blazor and native iOS/Android presenters**, full V1 Fire Tier-I Hunt as a behaviour specification, only simple HEX colors and geometry until functional and platform gates are passed.

**This is a documentation-only change.** No next engine task becomes authorized merely because it appears in the roadmap. The final long-form handover format is to be discussed with the owner separately.

The PR template at [`.github/pull_request_template.md`](../../.github/pull_request_template.md) must be completed with real evidence for every future task.