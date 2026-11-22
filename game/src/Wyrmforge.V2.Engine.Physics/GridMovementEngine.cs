using Wyrmforge.V2.Contracts;

namespace Wyrmforge.V2.Engine.Physics;

/// <summary>
/// N00 grid-step reference resolver. It correctly checks ground support and full actor headroom
/// against signed 100 mm voxels. Swept collision, gravity and multiplayer are not implemented.
/// </summary>
public sealed class GridMovementEngine : IMovementEngine
{
    /// <inheritdoc />
    public MoveResult TryMove(MoveRequest request, IWorldGeometry geometry)
    {
        ArgumentNullException.ThrowIfNull(geometry);
        request.Capabilities.Validate();

        var movesAlongX = (request.DeltaX is -1 or 1) && request.DeltaZ == 0;
        var movesAlongZ = (request.DeltaZ is -1 or 1) && request.DeltaX == 0;
        if (!movesAlongX && !movesAlongZ)
        {
            throw new ArgumentException("Expected exactly one adjacent horizontal microcell step.", nameof(request));
        }

        var targetX = checked(request.Feet.X + request.DeltaX);
        var targetZ = checked(request.Feet.Z + request.DeltaZ);

        for (var rise = 0; rise <= request.Capabilities.MaxStepUpMicrocells; rise++)
        {
            var candidate = new MicroVoxel(targetX, checked(request.Feet.Y + rise), targetZ);
            if (IsSupportedAndClear(candidate, request.Capabilities.HeightMicrocells, geometry))
            {
                return new MoveResult(candidate, true);
            }
        }

        for (var fall = 1; fall <= request.Capabilities.MaxDropMicrocells; fall++)
        {
            var candidate = new MicroVoxel(targetX, checked(request.Feet.Y - fall), targetZ);
            if (IsSupportedAndClear(candidate, request.Capabilities.HeightMicrocells, geometry))
            {
                return new MoveResult(candidate, true);
            }
        }

        return new MoveResult(request.Feet, false);
    }

    private static bool IsSupportedAndClear(MicroVoxel feet, int height, IWorldGeometry geometry)
    {
        var support = new MicroVoxel(feet.X, checked(feet.Y - 1), feet.Z);
        if (!geometry.IsSolid(support))
        {
            return false;
        }

        for (var offset = 0; offset < height; offset++)
        {
            if (geometry.IsSolid(new MicroVoxel(feet.X, checked(feet.Y + offset), feet.Z)))
            {
                return false;
            }
        }

        return true;
    }
}