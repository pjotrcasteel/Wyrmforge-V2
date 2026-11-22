# N00-01 — deterministic fixed-step C# session contract

**Owner:** Application. **Shared data contract:** Contracts. **Status:** initial implementation submitted for exact-commit CI, not yet accepted. N00 is a broader milestone.

## Scope

- Each session has a stable nonempty GUID, explicit seed and monotonic fixed simulation tick.
- PlayerCommand is the existing host-neutral command type, unchanged for compatibility with the separate Physics PR #440.
- Sequence numbers begin at one; commands are held for missing predecessors and committed only in ascending order on a tick boundary. Identical retries have no effect; conflicting or foreign-session commands are errors.
- The accepted journal records the tick at which a command was committed. A digest is deterministically chained using SHA-256 over **versioned little-endian binary fields**: session ID (Guid.ToByteArray), seed and per-tick accepted sequence/action/X/Y. Every empty tick is also included.
- The journal and queue have explicit constructor bounds; their capacity is a **temporary N00 test harness policy**, not the final production command retention strategy. Default maximum accepted count is 100,000 and queued window is 1,024.
- An observer/presenter is not necessary for the core state hash. There is no browser, native frontend, physics, combat or render dependency. Recording an intent does **not** constitute physically moving an actor.

## Invariants / tests

1. Same seed, session ID, tick boundaries and intentions => same digest even if intentions are submitted out of order within the tick boundary.
2. Different seed or session ID, different number of ticks or different commands => different digest.
3. Duplicate (pending or accepted) commands are idempotent; conflicting content for a sequence is rejected.
4. Future sequence gaps remain queued, with a bounded window and capacity.
5. Replay from accepted journal + seed/session/ticks reproduces the exact digest and rejects noncanonical histories.
6. Unit tests execute through both IPlayerCommandSink and ISimulationSession interfaces; a later N00 task proves replaceable fake providers and real C# web/native host integration.
7. Build and test in an independent workflow on the N00 feature branch, without modifying the existing foundation workflow owned in part by PR #440.

## Deferred N00 gates

- Command schema revision/epoch protocol, explicit event publication/consumer reset, deterministic RNG isolation and standardized error receipts.
- Fake/real engine adapter integration, snapshot/delta feed and bounded replay/load testing.
- Compiled Blazor WebAssembly host with HEX-only presentation, browser E2E and early native iOS/Android execution feasibility.
- Architecture CI must remain green; neither a deterministic journal nor a static HTML fixture satisfies N00 milestone acceptance.

**Do not merge or deploy automatically.**
