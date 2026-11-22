# N00-02 — headless session runner and independent deterministic random streams

**Owner:** Application; host-neutral contracts in Contracts. **Upstream:** draft N00-01 PR #444. **Workstream:** draft N00-02 child PR. No frontend or Physics dependencies.

## Contracts

- `IHeadlessSession` extends existing input/tick contracts and returns immutable `SessionStateSnapshot` read models and disconnected journal captures.
- `ISessionSnapshotReceiver` receives completed tick snapshots. A receiver never owns canonical state and can be a fake, no-op, Blazor, or eventual native adapter.
- `ScheduledPlayerCommand` carries a **delivery tick** distinct from the accepted **commit tick** in the journal; this preserves accurate gap handling.
- `HeadlessSessionRunner` pre-validates the complete delivery-tick schedule (nondecreasing, future-only, not beyond target tick), submits intentions, advances exactly one tick at a time, then reports snapshots. A failing receiver does not roll back the already committed tick.
- `IDeterministicRandomStream` defines explicit unsigned 32-bit samples. `Pcg32Random` implements documented PCG XSH RR 32-bit output with the standard 64-bit LCG multiplier, `increment = 2 * stream + 1`, two-step initialization and unchecked arithmetic. No process-global static RNG.
- Engines must receive independently seeded streams from the future composition root. Replaying the same seed/stream IDs and command timing must yield the same decisions; never derive random state from frame rate, UI, platform clock or browser.

## Cross-host RNG reference

With `seed = 7` and `stream = 0`, the first six decimal uint32 outputs are:

`4063834449, 2143014202, 2740157135, 3385478207, 3546536764, 785995372`.

This is a **cross-runtime golden vector** and must not change casually; any future algorithm/version migration requires replay format versioning.

## Evidence to capture

- Real C# `FixedStepSimulationSession` through a fake snapshot receiver and a no-op receiver: hashes identical, each step published.
- Fake `IHeadlessSession` implementation can substitute without changing the runner.
- Invalid delivery ordering rejected before any tick advance.
- Deterministic RNG same seed/stream, distinct stream isolation, reference golden vector.
- Existing N00-01 and foundation tests still pass in the isolated `n00-session.yml` CI.
- Compiled Blazor WASM and native iOS/Android execution remain **NOT RUN**, outside this specific subtask and still required for N00 overall.

**No merges, code generation from V1/old, new Physics implementation, decoration or Pages deployment.**
