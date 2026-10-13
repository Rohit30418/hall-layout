# Premium smart directions (13 October 2026)

This is a **deterministic, offline-friendly navigation UX**, not an LLM-generated route. The existing A* route and entrance/walkability checks remain authoritative.

## New behavior
- Display fewer, easier directions by combining only 1–3 metre approaches with the next maneuver, **explicitly retaining both actions and both turns**.
- Preserve the original polyline. Every combined instruction keeps its original `pathStartIndex` and `pathEndIndex`. Selecting it highlights **the full corresponding section**, including corners, in cyan.
- Render forward-pointing blue arrows on long visible parts of the 2D route.
- Offer opt-in **Listen** voice navigation, automatic playback on user-selected Next/Prev steps when enabled, and a **Replay** button. Speech uses browser `SpeechSynthesis` and never requires a paid model or API key.
- Limit nearby-stall landmarks to physically close geometry from backend-provided stall numbers.
- Build displayed direction text safely with DOM `textContent` to avoid interpreting external company/stall names as HTML.

## Important limitations
- The user must tap **Next**; the app does not know their real-time indoor location.
- The browser must support speech synthesis. Some embedded Android WebViews may not.
- 2D guidance shows highlighted steps and arrows; the 3D view retains its existing route rendering and shares the improved instructions.
- Walking paths and open entrances still depend on actual backend layout data. Without explicit walk zones, the fallback grid infers aisles, so the route needs an on-site safety/accuracy check.

## Tests
```sh
node --check assets/js/app.js
node --check assets/js/navigation-guide.js
node --test tests/navigation-guide.test.cjs tests/directions.test.cjs
```

Suggested manual check: Hall 1, start 10.13 → destination 10.03, advance the instruction card step by step, confirm the cyan overlay follows the exact blue path and voice calls the same action, then repeat on mobile/Android WebView.
