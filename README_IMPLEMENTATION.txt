Viewhall Layout — Fixed Frontend WOW Package
===========================================

Use ViewhallLayout.html as the main page.

Important files:
- assets/css/base.css       -> extracted original styling
- assets/css/ui-wow.css     -> premium UI polish and mobile WebView fixes
- assets/js/app.js          -> original map/search/route/3D/2D logic with small production fixes
- assets/js/ui-wow.js       -> frontend-only enhancement patch
- original-backup.html      -> your original uploaded file backup
- ViewhallLayout_single_file_wow.html -> same package in one HTML file for quick testing

Fixes in this version:
1. Removed Add to Favorite from UI.
2. Removed favorite star rendering on map/search.
3. Removed Start here / Go here buttons from detail popup.
4. Stall click now opens the detail popup directly.
5. Search suggestions are restored to original-style behavior:
   - search by stall number/company
   - suggestion list appears again
   - click suggestion closes sidebar/search sheet
   - selected stall gets focused/highlighted like before
6. Direction drawer no longer auto-hides after path creation, so clicking/reading steps is stable.
7. Clear Route now hard-clears 2D/3D path state and forces a redraw so the green START marker does not remain.
8. FPS stays hidden for normal users; use ?debug=1 for debugging.

AJAX URL note:
If you see 404 for GetSeachLayout, open assets/js/app.js and search:
Admin/SeatLayout.aspx/GetSeachLayout
Change it to the correct path for your server, for example:
/Admin/SeatLayout.aspx/GetSeachLayout
or ../Admin/SeatLayout.aspx/GetSeachLayout

Recommended test flow:
1. Load Hall 1.
2. Search a stall/company; suggestions should show.
3. Click suggestion; sidebar/search should close and the stall should highlight/focus.
4. Tap any stall; details popup should open directly.
5. Create route; drawer should remain open.
6. Click Prev/Next/steps; drawer should not disappear.
7. Clear route; green START marker/path should disappear.

URL DEEP-LINK HIGHLIGHT FIX
---------------------------
Updated: The UI now reads StallId/stallId/seatId/StallNo/stallNo from the URL after hall data loads, resolves it against SeatId or StallNo, then focuses/highlights that stall.
Example:
ViewhallLayout.html?HallId=23&StallId=14071407&hallName=HALL+6&from=H6-B11&to=H6-D9

Important: from/to route calculation works only when both stalls exist inside the currently loaded HallId data. If HallId=23 loads HALL 6 and to=H7-D9 belongs to Hall 7, route calculation cannot find that destination in HALL 6.


HIGHLIGHT FIX NOTES
-------------------
Deep-link highlight now matches multiple keys: SeatId, StallId, StallID, stallID, stallId, and StallNo.
Example URL supported:
ViewhallLayout.html?HallId=23&StallId=14071407&hallName=HALL%206

Important: deploy the full assets folder and use the updated ViewhallLayout.html because it includes cache-busting query strings on CSS/JS files.
If the browser still uses old JS from cache, highlight changes will not run.


PATCH v4 - Mobile Search + Smooth Pinch + Absolute API URL
----------------------------------------------------------
1. Mobile search sheet now opens below the header from the top, so suggestions stay visible above the mobile keyboard.
2. 2D pinch zoom now keeps the map point under the two-finger midpoint stable, reducing jump/scatter while zooming.
3. AJAX endpoint changed to:
   https://elecrama25.ngauge.co.in/Admin/SeatLayout.aspx/GetSeachLayout
4. Cache-busting version updated to mobile-pinch-fix-4.


ROUTE / AISLE FIX v5
====================
This build improves walking directions in 2D and 3D:

1. Route line no longer uses curved diagonal 3D smoothing.
   It now draws sharp straight segments so turns look like actual aisle turns.

2. 2D and 3D route lines are animated.
   2D has moving dashes/dots. 3D has moving white beads on the cyan path.

3. Route starts/ends at the stall entry side instead of the stall center.
   This prevents the route line from cutting through the booth.

4. Directions are simplified:
   - no fake "bear right" for tiny zigzags
   - U-turn appears only for a real long reversal
   - short/adjacent stalls show "on your left/right" where possible
   - most long sections say "Walk straight" until a real turn comes

5. Clear Route now fully removes:
   - 3D cyan route line
   - animated route dots
   - START/END pins
   - green/red route stall highlighting
   - dimmed focus mode

6. Backend aisle/walking boxes support:
   If backend sends SpaceData / utility rectangles whose text contains any of these words,
   the route engine will route only inside those walking boxes:
   AISLE, WALK, PATH, CORRIDOR, ENTRY, EXIT, FOYER, SPINE, PASSAGE

   Recommended backend setup:
   Create invisible/utility boxes in the middle of every walking aisle.
   Use text like "AISLE-A", "AISLE-B", "WALK-PATH-1".
   Make the box width/height cover the actual walking gap between stalls.
   The frontend will automatically prefer these boxes for routing.

7. If no aisle boxes are found, it falls back to automatic grid routing with inflated stall obstacles.
   This fallback is improved, but true production-perfect routing needs backend aisle boxes.

Updated files:
- ViewhallLayout.html
- assets/js/app.js
- ViewhallLayout_single_file_wow.html


ROUTE DIRECTION FIX v6
----------------------
1. Normal labels like AISLE A / ENTRY EXIT are no longer treated as walking path boxes.
   They were causing wrong long detours.
2. For backend walking boxes, use explicit names only:
   WALK-PATH-1, WALK-ZONE-1, ROUTE-ZONE-1, CORRIDOR-1, PATH-1.
3. Small gaps between backend walking boxes are auto-bridged up to ~44 map units.
4. A* tie-breaking now prefers movement toward destination first, so it avoids random outside L-shaped routes.
5. Direction text is simplified: mostly Walk straight, Turn left/right, Destination left/right.
6. U-turn is heavily restricted and should not appear unless route truly reverses.


ROUTE FIX V7 NOTES
------------------
1. Stalls are now always treated as obstacles; the route starts from the nearest aisle-side point, not through the stall body.
2. A soft edge-penalty pushes routes toward the middle of the aisle instead of hugging booth borders.
3. Route is reset automatically if From/To values are changed after a path is shown.
4. Selecting a different stall from search also clears the old route state before focusing the new stall.
5. 3D clear/reset rebuilds the stall layer to remove any lingering green/red route material.

For best accuracy, create backend invisible walkable rectangles named WALK-PATH-1, WALK-PATH-2, ROUTE-ZONE-1, CORRIDOR-1 etc. Keep them in the center of aisle gaps.



UPDATE v8 - Hall Change Full Reset
- Changing hall now clears route path, START/END markers, direction drawer, route inputs, search inputs, selected/highlighted stall, mobile search sheet, dialogs, and old 3D route materials.
- URL is updated to the new HallId/hallName and stale StallId/StallNo/from/to parameters are removed.
- This prevents previous hall route/highlight state from leaking into the newly selected hall.

V9 FIXES - 3D controls, route search, readable labels
------------------------------------------------------
1. 3D map now also shows plus / minus / reset controls.
   - Same controls work in both 2D and 3D.
   - Plus/minus zooms OrbitControls camera in/out.
   - Reset recenters the 3D map to the full hall.

2. Route From/To inputs now support:
   - Stall number, e.g. H6-A11
   - SeatId / StallId when available
   - Company name, exact or partial
   - Utility/area text

3. Route datalist now includes both stall numbers and company names.

4. 3D labels are larger and more visible.
   - Increased font size and minimum label scale.
   - Added light pill background for readability.

Cache version: route-company-3d-controls-fix-9
