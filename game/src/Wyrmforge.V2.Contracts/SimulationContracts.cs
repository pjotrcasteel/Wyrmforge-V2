namespace Wyrmforge.V2.Contracts;

/// <summary>Physical world uses ten microcells along each one-metre block axis.</summary>
public static class WorldUnits
{
    public const int MicrovoxelsPerBlockAxis = 10;
    public const int MillimetresPerMicrovoxel = 100;
}

/// <summary>Player intentions are requests, never direct mutations of game state.</summary>
public enum PlayerActionKind
{
    Move,
    Aim,
    CastPrimary,
    Interact,
    SelectHuntRoute
}

/// <summary>Versioned, ordered command input shared by every frontend.</summary>
public readonly record struct PlayerCommand(
    Guid SessionId,
    long Sequence,
    PlayerActionKind Action,
    int X = 0,
    int Y = 0);

/// <summary>Only the game backend accepts user commands.</summary>
public interface IPlayerCommandSink
{
    void Submit(PlayerCommand command);
}

/// <summary>Only the C# coordinator advances canonical simulation time.</summary>
public interface ISimulationSession
{
    long Tick { get; }

    void AdvanceTick();
}
