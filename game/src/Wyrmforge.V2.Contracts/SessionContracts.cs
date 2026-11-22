namespace Wyrmforge.V2.Contracts;

/// <summary>An immutable fact that the session accepted a player intention at a particular simulation tick.</summary>
public readonly record struct AcceptedPlayerCommand(long Tick, PlayerCommand Command);

/// <summary>Host-neutral immutable read model of the deterministic session, not a scene or gameplay state owner.</summary>
public sealed record SessionStateSnapshot(
    Guid SessionId,
    int Seed,
    long Tick,
    long LastAcceptedSequence,
    int AcceptedCommandCount,
    int PendingCommandCount,
    string CanonicalStateHash);
