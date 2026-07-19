# KartData — Project Tracker

## Session 2: Complete Feature Implementation

- [x] Project structure and all module files
- [x] `core/math.js` — computeSectors, computeGGDiagram, computeSlipChart, physics
- [x] `modules/charts.js` — G-G Friction Circle, Slip Chart (time delta), all 4 charts
- [x] `modules/mapping.js` — Leaflet map, track plotting, gate drawing, lap highlighting
- [x] `modules/video.js` — Video mounting, playback, seek, sync
- [x] `modules/ui/layout.js` — Panel container (CSS Grid, no Gridstack)
- [x] `modules/extractor.js` — CSV parsing, MP4 GPMD extraction, CSV generation
- [x] `index.html` — All 6 panels (map, timing, speed-dist, speed-time, GG, slip, video), mobile tab bar, collapse buttons, download progress bar
- [x] `styles/global.css` — CSS Grid layout (16 rows), mobile tabs, panel collapse, download progress, dark design system, responsive breakpoints
- [x] `app.js` — File handlers, gate drawing, timing tower with sector times, renderAllCharts, reference lap comparison, lap sort toggle, mobile tab switching, panel collapse, smoothing slider, keyboard shortcuts, drag & drop, download progress
- [x] Removed Gridstack dependency (CDN unreliable); replaced with pure CSS Grid
- [x] SVG favicon data URI (fixes 404)
- [x] Tailwind CDN fallback in CSS

## Known Issues
- ES modules require HTTP server (`python -m http.server 3000` from src/)
- Browser tracking prevention blocks some CDN scripts; CSS fallbacks added
- `computeSectors` finds closest point by distance tolerance — could be more precise
- MP4Box extraction depends on GPMD telemetry stream being present in video
