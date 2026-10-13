Situm / ExpoFP style updates applied
====================================

Files changed:
- ViewhallLayout.html
- assets/js/app.js
- assets/js/ui-wow.js
- assets/css/ui-wow.css

What was updated:
1. Added map-product style floating UI:
   - Expo-style exhibitor/logo strip generated from live stall data.
   - Top quick chips for Directions, Fit map, Available, Booked, Total.
   - Compass-style lightweight control.

2. Improved 2D map feel:
   - Soft hall floor/background envelope.
   - Rounded stall drawing for smoother premium map look.
   - Lighter grid/background so large halls feel less heavy.

3. Improved route/navigation:
   - Route still uses existing aisle-safe A* grid pathfinding.
   - Path is now dark-blue dotted style like indoor-navigation examples.
   - Start/end markers and route summary bubble added on map.
   - Route panel moved to a Situm-like left floating card on desktop.
   - Step text now includes estimated distances: “Go forward 12 m”, “Turn left and go ahead for 9 m”.
   - Route summary shows estimated distance/time.

4. Data based behavior:
   - Exhibitor strip uses txtComName and StallNo from loaded backend data.
   - Search/highlight still prefers SeatId/StallId to avoid duplicate StallNo issues.
   - Distance estimate uses Dimension/dWidth/dHeight where possible, with safe fallback.

5. Performance kept lightweight:
   - No heavy textures or HD shadows added.
   - 3D remains Normal mode for WebView/mobile performance.
   - Extra UI is CSS/DOM only and does not change backend API calls.

Important:
For perfect navigation accuracy, backend/admin should add explicit walkable path boxes in SpaceData using names like:
WALK-PATH-1, WALK-ZONE-1, ROUTE-ZONE-1, CORRIDOR-1, PATH-1

Without those boxes, the fallback route engine avoids stalls using the stall bounding hull and inflated obstacles, but explicit aisle boxes will always be more accurate.
