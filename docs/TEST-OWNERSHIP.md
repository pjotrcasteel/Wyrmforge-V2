# Test ownership and owner workload

The default workflow is that the assistant changes source, authors and fixes automated tests, verifies CI, and produces the playable Pages evidence without asking the owner to run repetitive commands.

- Every engine PR includes deterministic and negative-path tests, mock/substitute contract tests and at least one real cross-engine integration fixture.
- Use a CI architecture check to enforce one-way project references; no browser code inside C# authorities.
- While N00–N04 is open, the frontend contains only HEX colors and geometric shapes; automated checks reject texture files.
- Claims are scoped to tests actually run; failing or unavailable CI is reported as such.
- Physical iOS/Android device, signing and subjective gameplay acceptance remain the small unavoidable owner responsibilities.

For the new N00 physics slice, the required tests are recorded in `game/tests/Wyrmforge.V2.Foundation.Tests/PhysicsMovementTests.cs`. They run through the existing `csharp-foundation.yml` GitHub workflow.