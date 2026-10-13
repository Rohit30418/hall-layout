# Animated Walking Avatar — Route Preview

This feature displays a small animated person following the **actual route polyline** on the hall map. It does not estimate or detect anyone's real-world position.

## Visitor experience

1. Choose a starting stall and destination and calculate a walking route.
2. In the Walking Directions panel, press **Preview walk**.
3. The avatar walks along the blue route and rotates at each bend. The matching written direction is highlighted as the avatar advances.
4. Press **Pause walk** to stop, or the small circular-arrow button to restart.
5. At the end, press **Replay walk** to see the simulation again.
6. The optional **Listen / Voice on** button remains available. While voice is enabled, an instruction is spoken when the simulation enters a new step.

## Implementation

- `assets/js/route-avatar.js` is a pure, deterministic polyline sampler: it handles repeated vertices, path distances, heading, and direction-step lookup without external services.
- `assets/js/app.js` animates a lightweight canvas person in 2D and low-polygon mesh in 3D. It uses the existing render loops rather than creating a new animation loop.
- The preview lasts roughly 12–35 seconds. This is a **demo timeline**, not the estimated real walking time.
- The UI keeps the slim Voice toggle, walking instructions, Pause/Replay and progress indicator.
- The preview is user-initiated and stops when the directions panel closes. It is cleaned up when routes are cleared, the hall changes, or the view switches.
- No audio, geolocation or GPS permission is required for the visual simulation.

## Tests

Run:

```sh
node --check assets/js/route-avatar.js
node --check assets/js/app.js
node --test tests/directions.test.cjs tests/navigation-guide.test.cjs tests/route-avatar.test.cjs
```

GitHub Actions runs all of these checks on `main`.

## Manual review before release

Test one short route and one route with multiple sharp turns in Hall 1 and Hall 12. Check both 2D and 3D, Pause and Restart, and clearing a route mid-preview. Real hall routing still depends on the backend's walk zones and stall entrance metadata, and an actual on-site accuracy check is needed before relying on directions.
