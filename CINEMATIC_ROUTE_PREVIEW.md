# Cinematic Route Preview

The route preview now uses a **map camera tour** without changing the underlying hall pathfinder.

## Visitor experience

1. Calculate a 2D or 3D route and click **Cinematic preview**.
2. The camera smoothly follows the moving route avatar and looks slightly ahead.
3. At real polyline bends (48° or sharper), the camera eases a little closer; near the destination it eases in again.
4. The destination receives a brief cyan highlight when the avatar reaches it.
5. **Pause preview** freezes the walkthrough and camera; **Replay preview** starts again at the origin.
6. **Listen** is opt-in: enabled spoken guidance reads the next direction as its segment begins. Without Listen, the experience stays silent.
7. Manual drag, pinch, scroll zoom, toolbar zoom, or 3D OrbitControls interaction suspends automatic camera follow. Pause/resume to reactivate cinematic tracking.

## Accessibility and performance

- `prefers-reduced-motion` disables camera interpolation (the route itself remains a user-initiated preview).
- Only existing canvas / WebGL animation loops are used, with no added timers or render loops.
- The mobile 2D viewport accounts for the compact bottom directions sheet so the route marker stays visible.
- Camera motion is purely visual; no GPS, live positioning, camera permissions, third-party requests, or new backend APIs.
- The 2D marker stays the existing round profile; the 3D representation remains a low-poly visitor.

## Files

- `assets/js/cinematic-preview.js`: pure geometry and interpolation math
- `assets/js/app.js`: integration with 2D, 3D, destination glow, and interaction handoff
- `ViewhallLayout.html`: script loading and updated button text
- `tests/cinematic-preview.test.cjs`: tests for route turns, camera framing, reduced motion, 3D dolly and controls

## Validation

GitHub Actions runs JavaScript syntax checks and the entire set of navigation regression tests on `main`.

Before production use, visually test a short route and one with multiple bends in both views on a real Android phone and desktop. Confirm that expanding mobile directions leaves the avatar visible, the camera does not fight dragging, and a route reset removes the destination glow. Browser visual and venue path accuracy checks remain necessary.
