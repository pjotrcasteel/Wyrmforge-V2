using System.Security.Cryptography;
using System.Text;
using Wyrmforge.V2.Contracts;

namespace Wyrmforge.V2.Application;

/// <summary>
/// Owns a bounded, ordered command journal and a fixed simulation tick.
/// This N00 foundation intentionally does not simulate physics, combat or rendering.
/// </summary>
public sealed class FixedStepSimulationSession : ISimulationSession, IPlayerCommandSink
{
    private const int HashContractVersion = 1;
    private readonly SortedDictionary<long, PlayerCommand> pending = [];
    private readonly List<AcceptedPlayerCommand> journal = [];
    private readonly Dictionary<long, PlayerCommand> acceptedBySequence = [];
    private readonly int maxPendingCommands;
    private readonly int maxAcceptedCommands;
    private byte[] digest;

    /// <summary>Creates an isolated session with explicit bounds and a stable replay seed.</summary>
    public FixedStepSimulationSession(
        Guid sessionId,
        int seed,
        int maxPendingCommands = 1024,
        int maxAcceptedCommands = 100_000)
    {
        if (sessionId == Guid.Empty)
        {
            throw new ArgumentException("A nonempty session ID is required.", nameof(sessionId));
        }

        if (maxPendingCommands <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxPendingCommands));
        }

        if (maxAcceptedCommands <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxAcceptedCommands));
        }

        SessionId = sessionId;
        Seed = seed;
        this.maxPendingCommands = maxPendingCommands;
        this.maxAcceptedCommands = maxAcceptedCommands;
        digest = ComputeInitialDigest(sessionId, seed);
    }

    /// <summary>Unique identity of this simulation; cross-session commands are rejected.</summary>
    public Guid SessionId { get; }

    /// <summary>Seed recorded for deterministic replay; no implicit random source is used.</summary>
    public int Seed { get; }

    /// <inheritdoc />
    public long Tick { get; private set; }

    /// <summary>Next contiguous command sequence that may be committed.</summary>
    public long NextSequence { get; private set; } = 1;

    /// <summary>Number of not-yet-committed commands, bounded by the constructor limit.</summary>
    public int PendingCommandCount => pending.Count;

    /// <summary>Number of committed commands, bounded by the constructor limit.</summary>
    public int AcceptedCommandCount => journal.Count;

    /// <inheritdoc />
    public void Submit(PlayerCommand command)
    {
        if (command.SessionId != SessionId)
        {
            throw new ArgumentException("The command belongs to another session.", nameof(command));
        }

        if (command.Sequence <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(command), "Sequence numbers start at one.");
        }

        if (!Enum.IsDefined(command.Action))
        {
            throw new ArgumentOutOfRangeException(nameof(command), "Unknown player action.");
        }

        if (command.Sequence < NextSequence)
        {
            if (acceptedBySequence.TryGetValue(command.Sequence, out var previous) && previous == command)
            {
                return;
            }

            throw new InvalidOperationException("A committed command sequence cannot be changed.");
        }

        if (pending.TryGetValue(command.Sequence, out var queued))
        {
            if (queued == command)
            {
                return;
            }

            throw new InvalidOperationException("A queued command sequence cannot be changed.");
        }

        if (command.Sequence - NextSequence >= maxPendingCommands)
        {
            throw new InvalidOperationException("The command exceeds the bounded sequence window.");
        }

        if (pending.Count >= maxPendingCommands || pending.Count + journal.Count >= maxAcceptedCommands)
        {
            throw new InvalidOperationException("The bounded command journal is full.");
        }

        pending.Add(command.Sequence, command);
    }

    /// <inheritdoc />
    public void AdvanceTick()
    {
        if (Tick == long.MaxValue)
        {
            throw new InvalidOperationException("The simulation tick limit has been reached.");
        }

        Tick++;
        var committed = new List<AcceptedPlayerCommand>();
        while (pending.TryGetValue(NextSequence, out var command))
        {
            pending.Remove(NextSequence);
            var accepted = new AcceptedPlayerCommand(Tick, command);
            journal.Add(accepted);
            acceptedBySequence.Add(NextSequence, command);
            committed.Add(accepted);
            NextSequence++;
        }

        digest = ComputeNextDigest(digest, Tick, committed);
    }

    /// <summary>Captures a read-only snapshot; the digest includes every tick, even empty ticks.</summary>
    public SessionStateSnapshot Capture()
    {
        return new SessionStateSnapshot(
            SessionId,
            Seed,
            Tick,
            NextSequence - 1,
            journal.Count,
            pending.Count,
            Convert.ToHexString(digest));
    }

    /// <summary>Returns an isolated immutable copy of the accepted facts for deterministic replay.</summary>
    public IReadOnlyList<AcceptedPlayerCommand> CaptureJournal()
    {
        return Array.AsReadOnly(journal.ToArray());
    }

    /// <summary>
    /// Reconstructs an accepted journal from a known session ID, seed and total tick count.
    /// Entries must be ordered by tick and command sequence; no game engine or presenter is involved.
    /// </summary>
    public static FixedStepSimulationSession Replay(
        Guid sessionId,
        int seed,
        IReadOnlyList<AcceptedPlayerCommand> acceptedCommands,
        long totalTicks,
        int maxPendingCommands = 1024,
        int maxAcceptedCommands = 100_000)
    {
        ArgumentNullException.ThrowIfNull(acceptedCommands);

        if (totalTicks < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(totalTicks));
        }

        var session = new FixedStepSimulationSession(sessionId, seed, maxPendingCommands, maxAcceptedCommands);
        var index = 0;
        for (long tick = 1; tick <= totalTicks; tick++)
        {
            while (index < acceptedCommands.Count && acceptedCommands[index].Tick == tick)
            {
                session.Submit(acceptedCommands[index].Command);
                index++;
            }

            session.AdvanceTick();
        }

        if (index != acceptedCommands.Count || !session.journal.SequenceEqual(acceptedCommands))
        {
            throw new ArgumentException("The supplied journal is not a canonical accepted-command history.", nameof(acceptedCommands));
        }

        return session;
    }

    private static byte[] ComputeInitialDigest(Guid sessionId, int seed)
    {
        using var stream = new MemoryStream();
        using (var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true))
        {
            writer.Write(HashContractVersion);
            writer.Write(seed);
            writer.Write(sessionId.ToByteArray());
        }

        return SHA256.HashData(stream.ToArray());
    }

    private static byte[] ComputeNextDigest(
        byte[] previousDigest,
        long tick,
        IReadOnlyList<AcceptedPlayerCommand> acceptedCommands)
    {
        using var stream = new MemoryStream();
        using (var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true))
        {
            writer.Write(previousDigest);
            writer.Write(tick);
            writer.Write(acceptedCommands.Count);
            foreach (var accepted in acceptedCommands)
            {
                writer.Write(accepted.Command.Sequence);
                writer.Write((int)accepted.Command.Action);
                writer.Write(accepted.Command.X);
                writer.Write(accepted.Command.Y);
            }
        }

        return SHA256.HashData(stream.ToArray());
    }
}
