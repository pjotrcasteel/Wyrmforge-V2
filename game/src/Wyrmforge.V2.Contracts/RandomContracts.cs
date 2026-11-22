namespace Wyrmforge.V2.Contracts;

/// <summary>
/// Explicit, instance-local random stream. Each owning engine receives a separate seeded instance;
/// no implicit system RNG, global singleton or frontend clock may influence authoritative decisions.
/// </summary>
public interface IDeterministicRandomStream
{
    /// <summary>Returns the next unsigned 32-bit sample, deterministically for the same seed and stream.</summary>
    uint NextUInt32();
}
