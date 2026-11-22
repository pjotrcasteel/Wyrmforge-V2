# Placeholder-world rule — HEX colors and primitive shapes

**Owner instruction (2026-11-22): Until the engines and first Hunt are functionally complete, render the world with simple geometric primitives and explicit HEX color codes.** This is a product gate, not a temporary preference.

## Visual vocabulary

| Purpose | Primitive | #RRGGBB color |
| --- | --- | --- |
| Healthy forest ground | Box/plane | #527E50 |
| Dirt / excavated terrain | Box | #705038 |
| Stone / cliffs | Box or wedge | #6F7780 |
| River / water | Flat box / surface | #3A7EA4 |
| Lava | Flat box / surface | #E25A29 |
| Corrupted ground | Box/plane | #553750 |
| Wizard | Capsule or cylinder | #6575D9 |
| Hollowed | Capsule | #8A9B7A |
| Ashling | Capsule | #C3693B |
| Boss / Wyrm | Composed boxes and capsules | #982F37 |
| Interactable object | Box | #B19156 |
| Route / exit portal | Box and arch outline | #6EBAAC |

The **materials** are stable IDs in the C# world, not color values. The presenter maps material IDs / entity descriptors to placeholder shape and HEX palettes. These values are illustrative defaults, not locked art direction; visual swapping must not affect physics or game events.

## Banned before gameplay acceptance

- Texture atlases and procedural photo-textures.
- Creature-specific animations or detailed sprite pipelines.
- Complex GPU lighting, shadow polish, normals/roughness and expensive particles.
- Unapproved custom biome art that requires engine logic changes.
- Screen-space effects introduced merely to hide missing collisions or geometry.

## Required presentation mechanics

The frontend consumes versioned C# geometry and actor snapshots. It can perform camera transformation, interpolation and draw primitive shapes, but **must not infer or own physical terrain, collision, AI, spawning, status, rewards or fluid simulation**.

A missing visual feature must fall back to the corresponding solid-color primitive. All engines use the same presentation contracts; browser and native renders may differ stylistically, but share stable IDs, materials and transforms.

## Release gate

Do not relax this placeholder rule merely because an isolated renderer looks good. Only revisit visual polish after a complete V2 Fire Tier-I Hunt is playable and the core engines/portability/performance tests are accepted.
