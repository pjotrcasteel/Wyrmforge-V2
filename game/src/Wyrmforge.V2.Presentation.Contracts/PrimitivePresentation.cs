using System.Numerics;

namespace Wyrmforge.V2.Presentation.Contracts;

/// <summary>Validated #RRGGBB placeholder color. It is never a physical material ID.</summary>
public readonly record struct HexRgbColor
{
    public HexRgbColor(string value)
    {
        if (value is null || value.Length != 7 || value[0] != '#' ||
            !value.AsSpan(1).ToString().All(Uri.IsHexDigit))
        {
            throw new ArgumentException("Expected an explicit #RRGGBB HEX color.", nameof(value));
        }

        Value = value.ToUpperInvariant();
    }

    public string Value { get; }
}

/// <summary>Temporary visual shapes, not simulation geometry or collision.</summary>
public enum PrimitiveKind
{
    Box,
    Plane,
    Capsule,
    Sphere,
    Cylinder,
    Wedge
}

/// <summary>Scene presentation record in metres; physics uses integer microvoxels.</summary>
public readonly record struct PrimitiveVisual(
    string Id,
    PrimitiveKind Kind,
    Vector3 PositionMetres,
    Vector3 SizeMetres,
    byte MaterialId,
    HexRgbColor Color);

/// <summary>Immutable placeholder frame from canonical engine state.</summary>
public sealed record PlaceholderScene(long TerrainRevision, IReadOnlyList<PrimitiveVisual> Primitives);

/// <summary>Named colors belong to presentation, never the authoritative terrain store.</summary>
public static class PlaceholderPalette
{
    public static HexRgbColor Grass => new("#527E50");
    public static HexRgbColor Dirt => new("#705038");
    public static HexRgbColor Stone => new("#6F7780");
    public static HexRgbColor Water => new("#3A7EA4");
    public static HexRgbColor Lava => new("#E25A29");
    public static HexRgbColor Corruption => new("#553750");
    public static HexRgbColor Wizard => new("#6575D9");
    public static HexRgbColor Hollowed => new("#8A9B7A");
    public static HexRgbColor Ashling => new("#C3693B");
    public static HexRgbColor Wyrm => new("#982F37");
}
