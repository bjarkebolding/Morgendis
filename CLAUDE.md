# Morgendis - Project Guide

## Overview
Danish weather app for morgendis.dk. Built with Vite, deployed to GitHub Pages.

**Stack:** Open-Meteo API, RainViewer API, Leaflet.js, Chart.js (with date-fns adapter + annotation plugin). All state persisted via localStorage with `morgendis_` prefix.

## Project Structure

```
src/
  main.js                  # Entry point
  config/
    api.js                 # API endpoints, map defaults, cache duration, grid size
    cities.js              # Default cities (København, Aarhus)
    greetings.js           # Danish philosophical quotes
    models.js              # 26 forecast model options
    themes.js              # Background gradients + map tile styles
    variables.js           # 53+ weather variable definitions + defaults
    index.js               # Re-exports
  utils/
    dom.js                 # debounce, generateId, snapToGrid
    formatting.js          # formatTime, formatDateShort, getRandomGreeting
    storage.js             # localStorage wrapper (morgendis_ prefix)
    weather-icons.js       # WMO code → emoji
    wind.js                # Danish wind direction + arrows
    index.js               # Re-exports
  modules/
    app.js                 # Init + cross-module wiring
    panel-manager.js       # Draggable/resizable panels, layout save/restore
    city-cards.js          # Weather display, Chart.js forecasts
    city-search.js         # Geocoding search with keyboard nav
    map-module.js          # Leaflet maps + RainViewer radar
    moon-module.js         # Lunar phase, distance, events
    time-theme.js          # Auto time-based CSS themes
    weather-api.js         # Open-Meteo fetch with cache
  styles/
    main.css               # @import ordering
    _variables.css         # CSS custom properties + 5 theme overrides
    _base.css              # Body, backgrounds, animations
    _header.css            # Header brand, greeting
    _controls.css          # Form controls, search, buttons
    _panels.css            # Panel chrome, drag, resize, minimize
    _map.css               # Map controls, radar, markers
    _city-cards.css        # Current weather, variable selector
    _charts.css            # Forecast charts, y-labels, wind arrows
    _moon.css              # Moon display, events, distance chart
    _footer.css            # Footer layout, model selector
    _responsive.css        # Mobile/touch overrides
```

## Architecture

Modules are ES module object literals, decoupled via callback registration:

- **app.js** is the orchestrator — wires cross-module deps at init time
- **panel-manager.js** is generic — knows nothing about specific panel types
  - Uses `registerCloseHandler(type, fn)` for panel close actions
  - Uses `registerSummaryHandler(type, fn)` for minimize summaries
  - Uses `registerResizeHandler(fn)` for window resize callbacks
  - Uses `registerPanelFactory(type, fn)` for layout restore
  - Uses `registerDefaultLayoutFactory(fn)` for first-run layout
- **time-theme.js** uses `setMapModule(m)` to avoid circular import with MapModule
- **map-module.js** uses `setMapCityCards(cc)` to avoid circular import with CityCards

## Critical: Chart Alignment System

All charts must produce identical plot area widths so day-separator vertical lines align across stacked charts:

1. **Every chart has BOTH `yLeft` and `yRight` axes**, even non-dual-axis charts
2. Both axes use `afterFit: (axis) => { axis.width = fixedAxisWidth }` to force fixed width
3. Non-dual charts: right axis has `display: false` for ticks but still reserves width
4. **Every chart section in HTML** needs both `<span class="y-label">` and `<span class="y-label-right">`
5. Desktop: `fixedAxisWidth = 30`, labels 14px = 44px total per side
6. Mobile: `fixedAxisWidth = 20`, labels 10px = 30px total per side

**If you add a new chart type, you MUST follow this pattern or all charts will misalign.**

## Forecast Modes

- `'48h'` — now → now + 48 hours
- `'3-9d'` — now + 48h → now + 192h (9 days)
- API always fetches full 9 days; time window filtered in `renderDetailedForecast` and `createChart`

## localStorage Keys

All prefixed with `morgendis_`: `layout`, `selectedVariables`, `forecastMode`, `forecastModel`

## CSS Theming

Five time-based themes via `data-time-theme` on `<body>`:
- `night` (22-05), `dawn` (05-08), `morning` (08-12), `afternoon` (12-17), `evening` (17-22)
- All colors use CSS custom properties

## Common Gotchas

1. **`allTimes` vs `times`** — `allTimes` is the full array for chart labels. `times` is filtered by mode. `displayIndices` indexes into `allTimes`.
2. **Dual-axis check** — requires `.length > 0` not just truthy (empty arrays are truthy).
3. **Y-axis ticks** — `stepSize: 2`, `precision: 0` for integer-only.
4. **Double rAF** — Charts built inside `requestAnimationFrame(() => requestAnimationFrame(() => { ... }))`.
5. **Panel drag** — Absolute positioning with 20px grid snap, 12px edge snap.
6. **Mobile layout** — Panels stack vertically with up/down buttons. Check `pointer: coarse`.
7. **Wind direction** — Danish: N, NØ, Ø, SØ, S, SV, V, NV (Ø not E, V not W).

## Development

```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

## Deployment

Push to `main` branch triggers GitHub Actions → builds → deploys to GitHub Pages.
