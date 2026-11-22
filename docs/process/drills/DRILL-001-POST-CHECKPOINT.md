# DRILL-001 — deliberate post-checkpoint source change

**Synthetic evidence of an abrupt chat stop; NOT game code.**

This Markdown file was added **after** `docs/handovers/DRILL-001.md` was committed.

Intended verification by the receiving chat:
- Last recorded `source_sha` in DRILL-001 checkpoint points to the initial fixture commit, not the newest branch HEAD.
- Checkpoint-commit ancestry is intact; a subsequent Git commit exists and must be inspected.
- **Do not** claim the handover is CURRENT or all changes are fully verified.
- The required recovery/CI proof remains **NOT_RUN** and the future branch DRILL-002 may claim overlapping ownership.

This file proves only that an extra GitHub commit was published; no runtime tests or implementation changes took place.
