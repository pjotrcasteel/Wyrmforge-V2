namespace Wyrmforge.V2.Contracts;

/// <summary>Actor-sized traversal constraints in 100 mm cells; creature identity is gameplay data.</summary>
public readonly record struct MovementCapabilities(
    int HeightMicrocells,
    int MaxStepUpMicrocells,
    int MaxDropMicrocells)
{
    /// <summary>Reject invalid actor geometry before querying the terrain.</summary>
    public void Validate()
    {
        if (HeightMicrocells <= 0 || MaxStepUpMicrocells < 0 || MaxDropMicrocells < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(HeightMicrocells), "Actor movement dimensions must be valid.");
        }
    }
}

/// <summary>Request one horizontal adjacent microcell step from the actor's physical feet.</summary>
public readonly record struct MoveRequest(
    MicroVoxel Feet,
    int DeltaX,
    int DeltaZ,
    MovementCapabilities Capabilities);

/// <summary>Physics-owned collision decision; applying the resulting transform belongs to the simulation.</summary>
public readonly record struct MoveResult(MicroVoxel Feet, bool Moved);

/// <summary>Physics query interface; accepts only read-only world occupancy, not a terrain writer.</summary>
public interface IMovementEngine
{
    /// <summary>Resolve an adjacent step without mutating world geometry.</summary>
    MoveResult TryMove(MoveRequest request, IWorldGeometry geometry);
}