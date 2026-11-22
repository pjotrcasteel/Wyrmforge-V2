namespace Wyrmforge.V2.Contracts;

/// <summary>A single 100 mm terrain cell, addressed on signed world axes.</summary>
public readonly record struct MicroVoxel(int X, int Y, int Z);

/// <summary>Canonical one-way terrain command. Material zero removes solidity.</summary>
public readonly record struct TerrainMutation(MicroVoxel Cell, byte MaterialId)
{
    public bool IsSolid => MaterialId != 0;
}

/// <summary>A committed solid microvoxel. Its material ID has no renderer meaning.</summary>
public readonly record struct SolidVoxel(MicroVoxel Cell, byte MaterialId);

/// <summary>Read-only capture of a terrain revision.</summary>
public sealed record TerrainSnapshot(long Revision, IReadOnlyList<SolidVoxel> SolidCells);

/// <summary>Owns authoritative terrain occupancy, independent of every renderer.</summary>
public interface ITerrainEngine
{
    long Revision { get; }

    bool IsSolid(MicroVoxel cell);

    bool Apply(TerrainMutation mutation);

    TerrainSnapshot Capture();
}

/// <summary>Seed and bounded footprint for a diagnostic world generator.</summary>
public readonly record struct SiteRecipe(int Seed, int WidthBlocks, int DepthBlocks);

/// <summary>Portable terrain-initialization intent, not a loaded terrain engine.</summary>
public sealed record SiteDefinition(int Seed, IReadOnlyList<TerrainMutation> Mutations);

/// <summary>Returns initial terrain descriptions without directly writing any engine.</summary>
public interface IWorldGenerationEngine
{
    SiteDefinition Generate(SiteRecipe recipe);
}
