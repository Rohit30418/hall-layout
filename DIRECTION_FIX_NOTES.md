# Direction routing changes — 13 October 2026

Updated `assets/js/app.js`:

- Keep all genuine route corners, even when their preceding/following aisle is short; only collinear intermediate points are removed.
- Never suppress a required left/right/U-turn merely because a route leg is shorter than 34 map units.
- Never silently substitute an undeclared stall entrance when the backend declares an open side. If that side is blocked or outside the approved walking region, return no route rather than displaying a misleading path.
- For stalls without any side metadata, continue best-effort aisle-side selection.
- Keep short final approach instructions instead of silently skipping them.

## Testing / backend requirements

Static JavaScript syntax and focused direction-geometry tests passed. Actual visual route testing against individual hall data is still required. Backend walk zones/aisles and stall `Positions` / `OpenSide` / `SideOpen` values must match the physical venue. The fallback occupancy grid cannot prove that all non-stall spaces are public walking aisles. Distance is estimated, not surveyed metres.

If routing stops for a stall previously routed successfully, inspect its declared entrance side and ensure an accessible walkway exists at that side. This is intentional: better no directions than directions to a closed wall.
