# Straight aisle navigation update — 13 October 2026

- Reduced the wall proximity penalty so it cannot overwhelm the pathfinder turn cost.
- Increased the turn penalty to favour walking straight along a clear aisle.
- Added safe grid-validated removal of unnecessary small doglegs. A segment is replaced only if it remains orthogonal and every traversed cell is walkable.
- All route geometry is updated before the route is rendered or directions are generated, so the line and instruction steps remain synchronized.
- Added test cases for unobstructed straight aisles and required detours around obstacles.
- Updated the browser script cache query to v14.

Tested locally using Node.js syntax check and `node tests/directions.test.cjs`.
The original issue shown for Hall 1 / 10.13 to 10.03 still requires a live browser test with that hall API data. Fallback walking areas are inferred when the backend does not provide real walk zones.
