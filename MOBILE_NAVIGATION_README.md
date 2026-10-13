# Mobile Hall Navigation (13 October 2026)

## Mobile experience

When a visitor calculates a route, the directions open as a **compact bottom sheet** (rather than covering 76–80% of the map). The map, animated walking character and route remain visible above it. The compact sheet keeps:

- From → To, walking time and approximate distance
- **Listen / Voice on**
- The current navigation instruction
- **Preview walk / Pause / Replay**, restart and progress

Tap **Show all directions** or swipe up on its handle to expand a scrollable list of steps. Tap **Show map** or swipe down to collapse again, without ending the route or walkthrough. Desktop layout is unchanged.

The map hides duplicate floating controls while the mobile route sheet is shown, positions zoom buttons above the sheet, and respects the device safe-area inset.

## Camera behavior

For 2D routes the map initially frames the full path inside the usable area ABOVE the compact sheet. During a **playing** preview, the camera gently pans only when the avatar approaches an obscured edge, keeping the character visible without touching the A* route geometry or directions. Manual map panning is not overridden when paused. Resizing or expanding the sheet rechecks walker visibility.

The 3D avatar remains supported by the existing route-preview code, but this mobile camera framing improvement specifically applies to 2D.

## Implementation and tests

- `assets/css/mobile-navigation.css` — bottom sheet, mobile safe area, map controls
- `assets/js/mobile-navigation.js` — responsive sheet controls, route fitting, camera follow
- `ViewhallLayout.html` — accessible expand/collapse handle and current instruction
- `assets/js/app.js` — hooks to connect route updates and animated walker
- `tests/mobile-navigation.test.cjs` — phone viewport, camera, markup and control tests

```sh
node --check assets/js/mobile-navigation.js
node --test tests/mobile-navigation.test.cjs tests/route-avatar.test.cjs tests/directions.test.cjs tests/navigation-guide.test.cjs
```

**Release verification:** Check an actual Android phone and iPhone at roughly 360×640, 390×844, and landscape; test Hall 1 and Hall 12, long/short routes, voice availability, sheet gestures, and Pause/Restart. Automated tests are not a replacement for on-device visual checking. This is a simulated walker, not GPS/live location.
