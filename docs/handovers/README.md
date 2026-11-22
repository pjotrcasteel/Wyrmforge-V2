# Wyrmforge V2 — per-task handover directory

One active workstream = one task ID + one owning branch/PR + **one current handover Markdown file**:

`docs/handovers/<TASK-ID>.md`

Update that file **only** on the owning branch during an explicit handover; Git history preserves immutable previous versions. Do not copy every conversation into the repository. The owning PR should link the immutable checkpoint commit, and the short `docs/process/WORK-STATE.md` index may point to the relevant workstream(s).

Read [handover standard](../process/HANDOVER-STANDARD.md) and [template](../process/HANDOVER-TEMPLATE.md). A checkpoint must be derived from live GitHub HEAD/PR/test evidence. A checkpoint does not authorize new work.

This directory contains instructions only until an actual task is handed over. **No engine tasks are accepted by the presence of this file.**