using Microsoft.VisualStudio.TestTools.UnitTesting;
using Wyrmforge.V2.Contracts;
using Wyrmforge.V2.Engine.Terrain;
using Wyrmforge.V2.Engine.WorldGeneration;
using Wyrmforge.V2.Host.Composition;
using Wyrmforge.V2.Presentation.Contracts;

namespace Wyrmforge.V2.Foundation.Tests;

[TestClass]
public sealed class EngineFoundationTests
{
    [TestMethod]
    public void TerrainMustSupportSignedCoordinatesAndIdempotentEdits()
    {
        var terrain = new VoxelTerrainEngine();
        var position = new MicroVoxel(-17, 8, -29);
        Assert.IsTrue(terrain.Apply(new TerrainMutation(position, 3)));
        Assert.IsTrue(terrain.IsSolid(position));
        Assert.AreEqual(1L, terrain.Revision);
        Assert.IsFalse(terrain.Apply(new TerrainMutation(position, 3)));
        Assert.AreEqual(1L, terrain.Revision);
        Assert.IsTrue(terrain.Apply(new TerrainMutation(position, 0)));
        Assert.IsFalse(terrain.IsSolid(position));
        Assert.AreEqual(2L, terrain.Revision);
    }

    [TestMethod]
    public void WorldGeneratorIsSeedDeterministicAndDoesNotNeedVoxelImplementation()
    {
        IWorldGenerationEngine generator = new WorldGenerationEngine();
        var first = generator.Generate(new SiteRecipe(7, 2, 2));
        var second = generator.Generate(new SiteRecipe(7, 2, 2));
        CollectionAssert.AreEqual(first.Mutations.ToArray(), second.Mutations.ToArray());
        Assert.AreEqual(400, first.Mutations.Count);
        Assert.IsTrue(first.Mutations.All(item => item.Cell.Y == 0));
    }

    [TestMethod]
    public void TerrainProducesPlaceholderSceneWithoutHandingStateToRenderer()
    {
        var terrain = FoundationComposition.BuildTerrain(new SiteRecipe(7, 1, 1));
        var frame = FoundationComposition.CreatePlaceholderScene(terrain.Capture());
        Assert.AreEqual(100, frame.Primitives.Count);
        Assert.IsTrue(frame.Primitives.All(item => item.Kind == PrimitiveKind.Box));
        Assert.IsTrue(frame.Primitives.All(item => item.Color.Value.StartsWith('#')));
        Assert.AreEqual(terrain.Revision, frame.TerrainRevision);
    }

    [TestMethod]
    public void PlaceholderPaletteRejectsNonHexColors()
    {
        Assert.ThrowsExactly<ArgumentException>(() => new HexRgbColor("red"));
        Assert.ThrowsExactly<ArgumentException>(() => new HexRgbColor("#00GG11"));
        Assert.AreEqual("#527E50", PlaceholderPalette.Grass.Value);
    }
}
