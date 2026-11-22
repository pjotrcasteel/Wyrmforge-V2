using Wyrmforge.V2.Contracts;

namespace Wyrmforge.V2.Engine.WorldGeneration;

/// <summary>
/// Deliberately simple generated ground for architecture and contract smoke tests.
/// Not an accepted Wyrmforge Hunt environment or mature procedural generator.
/// </summary>
public sealed class WorldGenerationEngine : IWorldGenerationEngine
{
    public SiteDefinition Generate(SiteRecipe recipe)
    {
        if (recipe.WidthBlocks is <= 0 or > 32)
        {
            throw new ArgumentOutOfRangeException(nameof(recipe), "Width must be between 1 and 32 blocks.");
        }

        if (recipe.DepthBlocks is <= 0 or > 32)
        {
            throw new ArgumentOutOfRangeException(nameof(recipe), "Depth must be between 1 and 32 blocks.");
        }

        var width = recipe.WidthBlocks * WorldUnits.MicrovoxelsPerBlockAxis;
        var depth = recipe.DepthBlocks * WorldUnits.MicrovoxelsPerBlockAxis;
        var mutations = new List<TerrainMutation>(width * depth);

        for (var x = 0; x < width; x++)
        {
            for (var z = 0; z < depth; z++)
            {
                var blockX = x / WorldUnits.MicrovoxelsPerBlockAxis;
                var blockZ = z / WorldUnits.MicrovoxelsPerBlockAxis;
                var signature = unchecked(blockX * 17 + blockZ * 31 + recipe.Seed);
                byte materialId = (signature & 15) == 0 ? (byte)2 : (byte)1;
                mutations.Add(new TerrainMutation(new MicroVoxel(x, 0, z), materialId));
            }
        }

        return new SiteDefinition(recipe.Seed, mutations);
    }
}
