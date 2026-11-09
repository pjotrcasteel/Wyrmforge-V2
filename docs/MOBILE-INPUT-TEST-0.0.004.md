# Voxel V2 0.0.004 — manual input acceptance

**Milestone:** V2.0 (still in progress, not accepted by automated tests alone)

**URL:** https://pjotrcasteel.github.io/Wyrmforge-V2/

**Prerequisite:** The header must show `v0.0.004` and a seven-character deployed commit SHA. If it shows an older version, do not score the test as a failure; first confirm Pages deployment has completed, then reload the page.

## On an iPhone (Safari)

- [ ] Open **Hill**, seed **7**. Confirm the header version and that the scene draws.
- [ ] Drag **one finger** left/right/up/down. The terrain follows the finger without jumping or moving the browser page.
- [ ] Spread **two fingers** apart slowly. The world zooms in near the midpoint. Bring the fingers together: it zooms out. The status shows the zoom factor and it stays between 0.55× and 2.50×.
- [ ] Pan with **two fingers together**. The view moves without dramatic scale changes.
- [ ] Lift one finger during a pinch, then drag the remaining finger. The image must not suddenly jump.
- [ ] Interrupt a gesture by switching to another tab/app and returning. A new drag must start normally (no stuck gesture).
- [ ] Rotate the device once, then pan and pinch again.
- [ ] Press **Reset** and **Carve sphere**. Both controls must continue to work.
- [ ] Select **Export benchmark**. Verify JSON includes `version`, `commit`, `scene`, `seed`, and `frames`.

## On Android (Chrome)

Repeat the single-finger pan, two-finger pinch, one-finger lift, app-switch recovery, Reset/Carve, and JSON-export checks above.

## On desktop (Chrome, Firefox or Edge)

- [ ] Mouse drag pans terrain.
- [ ] Mouse wheel zooms toward the cursor, not only the canvas center.
- [ ] Buttons, scene picker and numeric seed remain usable.

## Report

Send back **device/browser**, whether the version was `0.0.004`, and any failed step (prefer a short screen recording or screenshot if a gesture looks wrong). The downloaded benchmark JSON is especially useful for performance issues.

**Known limitation:** This is still a temporary Canvas2D, top-face-only diagnostic view. Do not judge final 2.5D pixel-art appearance or WebGL2 performance from this step. The final fixed 2.5D camera and renderer belong to V2.2.

**Research basis:** [MDN Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [MDN multi-touch interactions](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Multi-touch_interaction), [MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).
