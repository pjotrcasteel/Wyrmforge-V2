using Wyrmforge.V2.Application;
using Wyrmforge.V2.Contracts;

namespace Wyrmforge.V2.NativeProbe.Core;

/// <summary>Portable, deterministic proof result from the exact shared C# Application/Contracts assemblies.</summary>
public sealed record NativeProbeReceipt(
    long Tick,
    int AcceptedCommands,
    string CanonicalHash,
    uint RandomSample,
    string Status);

/// <summary>
/// Runs the same fixed-step C# command sequence as the N00 browser proof.
/// Contains no native UI code, no duplicated game rules and no platform-specific dependencies.
/// </summary>
public static class NativeSessionProof
{
    /// <summary>Version-one reference vector independently computed for the N00 C# session.</summary>
    public const string ExpectedHash = "99088D266569F833DC8E2B37A78209099F8DCB7AC3BD81B6B243D875F789E78B";

    /// <summary>Known PCG32 sample for seed seven and stream zero.</summary>
    public const uint ExpectedRandomSample = 4063834449U;

    private static readonly Guid SessionId = Guid.Parse("bbaee9bb-c5bd-42f1-a5b0-62183cccf5f8");

    /// <summary>
    /// Proves that a platform's installed .NET runtime can execute the shared session,
    /// commit an intention, replay its journal and reproduce the canonical hash and RNG.
    /// Any mismatch fails closed instead of displaying a synthetic PASS.
    /// </summary>
    public static NativeProbeReceipt Run()
    {
        var session = new FixedStepSimulationSession(SessionId, seed: 7);
        var observer = new CaptureReceiver();
        var runner = new HeadlessSessionRunner(session, observer);
        runner.RunUntil(2,
        [
            new ScheduledPlayerCommand(
                1,
                new PlayerCommand(SessionId, 1, PlayerActionKind.Move, 1, 0))
        ]);

        var actual = session.Capture();
        var replay = FixedStepSimulationSession.Replay(SessionId, 7, session.CaptureJournal(), actual.Tick);
        var random = new Pcg32Random(seed: 7, stream: 0).NextUInt32();

        if (actual.Tick != 2 ||
            actual.AcceptedCommandCount != 1 ||
            actual.PendingCommandCount != 0 ||
            actual.CanonicalStateHash != ExpectedHash ||
            replay.Capture().CanonicalStateHash != ExpectedHash ||
            observer.Last?.CanonicalStateHash != ExpectedHash ||
            observer.ReceivedCount != 2 ||
            random != ExpectedRandomSample)
        {
            throw new InvalidOperationException(
                $"Native C# parity mismatch: tick={actual.Tick}; accepted={actual.AcceptedCommandCount}; " +
                $"hash={actual.CanonicalStateHash}; random={random}; observed={observer.ReceivedCount}.");
        }

        return new NativeProbeReceipt(actual.Tick, actual.AcceptedCommandCount, actual.CanonicalStateHash, random, "PASS");
    }

    private sealed class CaptureReceiver : ISessionSnapshotReceiver
    {
        public SessionStateSnapshot? Last { get; private set; }

        public int ReceivedCount { get; private set; }

        public void Receive(SessionStateSnapshot snapshot)
        {
            Last = snapshot;
            ReceivedCount++;
        }
    }
}
