namespace Wyrmforge.V2.Contracts;

/// <summary>
/// Host-neutral simulation port: consumes intentions, advances a fixed step and exposes immutable read models.
/// A fake or native/web adapter may implement this contract without referencing any engine implementation.
/// </summary>
public interface IHeadlessSession : IPlayerCommandSink, ISimulationSession
{
    /// <summary>Returns the authoritative session tick, counters and digest as an immutable read model.</summary>
    SessionStateSnapshot Capture();

    /// <summary>Returns a disconnected, immutable accepted-command journal for replay.</summary>
    IReadOnlyList<AcceptedPlayerCommand> CaptureJournal();
}

/// <summary>Replaceable destination for immutable session snapshots; it never owns canonical simulation state.</summary>
public interface ISessionSnapshotReceiver
{
    /// <summary>Observe the completed step; throwing does not roll back the already committed simulation tick.</summary>
    void Receive(SessionStateSnapshot snapshot);
}

/// <summary>Delivers one player intention at the beginning of a nominated simulation tick.</summary>
public readonly record struct ScheduledPlayerCommand(long DeliveryTick, PlayerCommand Command);
