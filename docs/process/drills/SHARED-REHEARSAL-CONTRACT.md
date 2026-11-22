# DRILL-002 — intentional overlapping ownership fixture

**REHEARSAL ONLY — DO NOT MERGE. THIS IS NOT GAME CODE.**

This fixture intentionally targets the **same repository path** as DRILL-001, with a different Markdown content blob.

- Synthetic owner: `DRILL-002`, branch `drill/handover-conflict-002`.
- Competing path: `docs/process/drills/SHARED-REHEARSAL-CONTRACT.md`.
- Expected receiver behaviour: compare both PR changed paths and their task ownership declarations, report the conflict, and do not modify or automatically merge either workstream.
- No actual concurrency in game source is required; the file overlap is test-only.
- **No engine, runtime, UI or tests have been implemented by this fixture.**
