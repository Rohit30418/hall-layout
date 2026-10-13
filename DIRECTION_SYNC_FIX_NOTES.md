# Direction ↔ map line synchronization (13 October 2026)

- 2D/3D route lines and turn-by-turn instructions use identical route vertices.
- A* now includes the incoming direction in its search state and penalizes unnecessary changes in heading. Routes still use walkable cells only.
- Selecting a direction highlights the matching 2D map segment in cyan, with a marker at the turn and an arrow on longer segments.
- Collinear route normalization preserves real reversals and avoids hiding required turns.
- All instruction steps include matching route point indices.
- The main HTML's app.js query version was incremented to avoid stale cached code.

## Checks
- JavaScript syntax checked.
- Regression tests cover real short 90-degree bends, U-turn preservation, path↔instruction indices, open-grid routing and obstacle avoidance.

## Limits
Real hall data has not been available for end-to-end browser validation; verify Hall 1, from 10.13 to 10.03 after pulling. Fallback aisle routing uses approximate walkability and distance depends on calibrated stall dimension data.
