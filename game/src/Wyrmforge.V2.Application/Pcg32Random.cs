using Wyrmforge.V2.Contracts;

namespace Wyrmforge.V2.Application;

/// <summary>
/// Cross-host PCG-XSH-RR 32-bit random stream with explicit seed and stream discriminator.
/// Seeded separately per authoritative engine; never shared as a process-wide singleton.
/// </summary>
public sealed class Pcg32Random : IDeterministicRandomStream
{
    private const ulong Multiplier = 6364136223846793005UL;
    private readonly ulong increment;
    private ulong state;

    /// <summary>Constructs a reproducible PCG stream; stream IDs isolate independent engine owners.</summary>
    public Pcg32Random(int seed, ulong stream = 0)
    {
        increment = unchecked((stream << 1) | 1UL);
        state = 0UL;
        NextUInt32();
        state = unchecked(state + (uint)seed);
        NextUInt32();
    }

    /// <inheritdoc />
    public uint NextUInt32()
    {
        var oldState = state;
        state = unchecked(oldState * Multiplier + increment);
        var xorshifted = (uint)(((oldState >> 18) ^ oldState) >> 27);
        var rotation = (int)(oldState >> 59);
        return (xorshifted >> rotation) | (xorshifted << ((-rotation) & 31));
    }
}
