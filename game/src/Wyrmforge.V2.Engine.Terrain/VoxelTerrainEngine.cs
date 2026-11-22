using Wyrmforge.V2.Contracts;

namespace Wyrmforge.V2.Engine.Terrain;

/// <summary>
/// First clean-room C# terrain authority: signed, material-bearing 100 mm cells.
/// This is an intentionally unchunked correctness baseline, not the final performant store.
/// </summary>
public sealed class VoxelTerrainEngine : ITerrainEngine
{
    private readonly Dictionary<MicroVoxel, byte> solids = [];

    public long Revision { get; private set; }

    public bool IsSolid(MicroVoxel cell)
    {
        return solids.ContainsKey(cell);
    }

    public bool Apply(TerrainMutation mutation)
    {
        if (mutation.IsSolid)
        {
            if (solids.TryGetValue(mutation.Cell, out var existing) &&
                existing == mutation.MaterialId)
            {
                return false;
            }

            solids[mutation.Cell] = mutation.MaterialId;
        }
        else if (!solids.Remove(mutation.Cell))
        {
            return false;
        }

        Revision++;
        return true;
    }

    public TerrainSnapshot Capture()
    {
        var cells = solids
            .Select(pair => new SolidVoxel(pair.Key, pair.Value))
            .OrderBy(cell => cell.Cell.X)
            .ThenBy(cell => cell.Cell.Y)
            .ThenBy(cell => cell.Cell.Z)
            .ToArray();

        return new TerrainSnapshot(Revision, cells);
    }
}
