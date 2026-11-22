using System.Numerics;
using Wyrmforge.V2.Contracts;
using Wyrmforge.V2.Engine.Terrain;
using Wyrmforge.V2.Engine.WorldGeneration;
using Wyrmforge.V2.Presentation.Contracts;

namespace Wyrmforge.V2.Host.Composition;

/// <summary>The only current composition root joining two concrete engine implementations.</summary>
public static class FoundationComposition
{
    public static ITerrainEngine BuildTerrain(SiteRecipe recipe)
    {
        IWorldGenerationEngine generator = new WorldGenerationEngine();
        ITerrainEngine terrain = new VoxelTerrainEngine();

        foreach (var mutation in generator.Generate(recipe).Mutations)
        {
            terrain.Apply(mutation);
        }

        return terrain;
    }

    /// <summary>Read-only, deliberately unoptimized primitive diagnostic, not a game renderer.</summary>
    public static PlaceholderScene CreatePlaceholderScene(TerrainSnapshot snapshot)
    {
        var pitch = 1f / WorldUnits.MicrovoxelsPerBlockAxis;
        var primitives = snapshot.SolidCells.Select(solid =>
            new PrimitiveVisual(
                $"{solid.Cell.X}:{solid.Cell.Y}:{solid.Cell.Z}",
                PrimitiveKind.Box,
                new Vector3(solid.Cell.X, solid.Cell.Y, solid.Cell.Z) * pitch,
                new Vector3(pitch, pitch, pitch),
                solid.MaterialId,
                solid.MaterialId == 2 ? PlaceholderPalette.Stone : PlaceholderPalette.Grass))
            .ToArray();

        return new PlaceholderScene(snapshot.Revision, Array.AsReadOnly(primitives));
    }
}
