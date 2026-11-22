using Microsoft.VisualStudio.TestTools.UnitTesting;
using Wyrmforge.V2.Contracts;
using Wyrmforge.V2.Engine.Physics;
using Wyrmforge.V2.Engine.Terrain;

namespace Wyrmforge.V2.Foundation.Tests;

[TestClass]
public sealed class PhysicsMovementTests
{
    [TestMethod]
    public void OneMetreStoneLedgeBlocksLowStepActorButNotOneMetreJumper()
    {
        var geometry = new VoxelTerrainEngine();
        geometry.Apply(new TerrainMutation(new MicroVoxel(0, 0, 0), 1));
        geometry.Apply(new TerrainMutation(new MicroVoxel(1, 0, 0), 1));

        for (var y = 1; y <= WorldUnits.MicrovoxelsPerBlockAxis; y++)
        {
            geometry.Apply(new TerrainMutation(new MicroVoxel(1, y, 0), 3));
        }

        var movement = new GridMovementEngine();
        var from = new MicroVoxel(0, 1, 0);
        var lowStep = movement.TryMove(new MoveRequest(from, 1, 0, new MovementCapabilities(10, 3, 3)), geometry);
        var highJump = movement.TryMove(new MoveRequest(from, 1, 0, new MovementCapabilities(10, 10, 3)), geometry);

        Assert.IsFalse(lowStep.Moved);
        Assert.AreEqual(from, lowStep.Feet);
        Assert.IsTrue(highJump.Moved);
        Assert.AreEqual(new MicroVoxel(1, 11, 0), highJump.Feet);
    }

    [TestMethod]
    public void PhysicsUsesOnlyPublicReadOnlyGeometryAndSupportsNegativeCells()
    {
        IWorldGeometry fakeGeometry = new FlatGeometry();
        IMovementEngine movement = new GridMovementEngine();

        var result = movement.TryMove(
            new MoveRequest(new MicroVoxel(-2, 1, -2), 1, 0, new MovementCapabilities(10, 3, 3)),
            fakeGeometry);

        Assert.IsTrue(result.Moved);
        Assert.AreEqual(new MicroVoxel(-1, 1, -2), result.Feet);
    }

    [TestMethod]
    public void UnsupportedMoveDoesNotInventSupportOrPosition()
    {
        IWorldGeometry emptyWorld = new EmptyGeometry();
        var origin = new MicroVoxel(2, 1, 2);
        var result = new GridMovementEngine().TryMove(
            new MoveRequest(origin, 1, 0, new MovementCapabilities(10, 3, 3)),
            emptyWorld);

        Assert.IsFalse(result.Moved);
        Assert.AreEqual(origin, result.Feet);
    }

    [TestMethod]
    public void DiagonalAndInvalidActorDimensionsAreRejected()
    {
        var movement = new GridMovementEngine();
        IWorldGeometry world = new FlatGeometry();

        Assert.ThrowsExactly<ArgumentException>(() =>
            movement.TryMove(new MoveRequest(new MicroVoxel(0, 1, 0), 1, 1, new MovementCapabilities(10, 3, 3)), world));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() =>
            movement.TryMove(new MoveRequest(new MicroVoxel(0, 1, 0), 1, 0, new MovementCapabilities(0, 3, 3)), world));
    }

    private sealed class FlatGeometry : IWorldGeometry
    {
        public bool IsSolid(MicroVoxel cell)
        {
            return cell.Y == 0;
        }
    }

    private sealed class EmptyGeometry : IWorldGeometry
    {
        public bool IsSolid(MicroVoxel cell)
        {
            return false;
        }
    }
}