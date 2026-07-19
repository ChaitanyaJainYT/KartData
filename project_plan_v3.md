# KartData: Zero-Ambiguity Architectural Blueprint (project_plan_v3.md)

> This document supersedes project_plan.md and project_plan_v2.md. It incorporates every feature from gokart_analysis_v5.html (all 43 functions, every state variable, all DOM elements, and all CSS behaviors) plus all requirements from the earlier plans and the GX018336_demo_Telemetry.csv schema. Nothing is assumed; everything is specified.

---

## Table of Contents
- 0. Project Management
- 1. Project Context & Constraints
- 2. Exact Tech Stack & Versions
- 3. Data Models & In-Memory State Schema
- 4. Complete State Variable Registry
- 5. Complete DOM Element Registry
- 6. Complete Function Registry (43 Functions) — Behavior, Inputs, Outputs, Edge Cases
- 7. Event Listener Wiring Map
- 8. Architecture & File Structure
- 9. Core Features & User Flows (Step-by-Step)
- 10. Design System & UI/UX Rules
- 11. Color Palette (Exact Hex Codes)
- 12. Typography
- 13. Component Behaviors & Responsiveness
- 14. Security & Permissions
- 15. CSS Class & Behavior Registry
- 16. CSV Schema (GX018336_demo_Telemetry.csv Matched)
- 17. UX Enhancement Backlog (Phase 1.5 — All Improvements)
- Appendix A: Error Handling Matrix
- Appendix B: Keyboard Shortcut Map
- Appendix C: Plotly Configuration
- Appendix D: VideoElement Object Structure
- Appendix E: Playback Constants

---

## 0. Project Management

Create a `todo.md` at the project root before any implementation. It must track every task, link to the relevant section in this plan, and be updated as work progresses. Each session begins by reading `todo.md` and resumes where it left off.

---

## 1. Project Context & Constraints

| Property | Value |
|---|---|
| **Core Problem** | Replace expensive desktop motorsport telemetry software (Motec, McLaren ATLAS) with a browser-based, interactive dashboard enabling karting and track-day drivers to analyze runs from GoPro/GPS data. |
| **Target Audience** | Motorsport enthusiasts, power users. Requires high data density, tabular precision, professional visual paradigms. |
| **Zero Server Backend** | 100% client-side. All file parsing, physics calculations, video rendering in browser memory. No data transmitted externally. |
| **Single Page Application** | Never reloads after initial boot. |
| **No Loading Screens (Post-Boot)** | File processing uses background workers or non-blocking UI. Progress feedback via spinner/status text only — never a full blocking overlay. |
| **Responsive Modularity** | UI panels must be resizable, show/hide-able. Desktop: grid layout. Mobile (<768px): vertical accordion or tabbed interface. |
| **No Third-Party UI Libraries** | Only the libraries listed in Tech Stack. No React, Vue, Angular, or UI kits. Vanilla JS only. |
| **All Calculations Client-Side** | Physics (LatG/LonG, smoothing, distance) computed on-the-fly in JS. No server-side processing. |

---

## 2. Exact Tech Stack & Versions

| Domain | Technology | Version / CDN URL | Purpose |
|---|---|---|---|
| **Markup** | HTML5 | — | Semantic DOM structure |
| **Styling** | CSS3 + Tailwind CSS | https://cdn.tailwindcss.com (v3.x) | Utility-first dark-mode styling |
| **Scripting** | Vanilla JavaScript | ES6+ (no transpilation) | All application logic |
| **Mapping** | Leaflet.js | https://unpkg.com/leaflet@1.9.4/dist/leaflet.js | Interactive track map |
| **Map Tiles (Dark)** | CartoDB Dark Matter | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` | Default tile layer |
| **Map Tiles (Light)** | OpenStreetMap | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | Light mode tile layer |
| **Charting** | Plotly.js | https://cdn.plot.ly/plotly-2.27.0.min.js | WebGL-accelerated telemetry charts |
| **CSV Parsing** | PapaParse | https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js | CSV → JSON |
| **Video Metadata Extraction** | mp4box.js | https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js | GPMD track extraction from MP4 |
| **Video Playback** | Native HTML5 `<video>` | Browser-native | H.265/HEVC via browser APIs |
| **Icons** | Phosphor Icons | https://unpkg.com/@phosphor-icons/web@latest | Vector icon set |
| **Fonts** | Google Fonts (Inter, JetBrains Mono) | Via CSS `@import` or `<link>` | Typography |

---

## 3. Data Models & In-Memory State Schema

### 3.1 TelemetryPoint (Normalized Row)

This is the canonical in-memory representation of one CSV row after `processIncomingCSV()`.

| Field | Type | Source CSV Column | Description |
|---|---|---|---|
| `index` | integer | — | Zero-based row index in original CSV |
| `lat` | float | `GPS (Lat.) [deg]` | Latitude decimal degrees |
| `lon` | float | `GPS (Long.) [deg]` | Longitude decimal degrees |
| `speed` | float | `GPS (2D) [m/s]` or `GPS (3D) [m/s]` | Converted to km/h (`* 3.6` if input is m/s) |
| `speedMS` | float | `GPS (2D) [m/s]` | Speed in meters/second (for video rate calc) |
| `time` | float | `cts` or `date` | Normalized timestamp in **seconds**, relative to session start |
| `totalDistance` | float | — | Cumulative Haversine distance from start in **meters** |
| `lap` | integer | — | Assigned lap number (1-based, set during lap split) |
| `lapDistance` | float | — | Distance within current lap in **meters** |
| `rowId` | integer | — | Same as `index`; used for Plotly hover lookup |

**Behavior for missing GPS rows** (rows 1-51 of demo CSV have interleaved ACCL/GYRO data without GPS):  
- Points missing lat/lon are **skipped** during CSV processing (line 815: `if (isNaN(lat) || isNaN(lon)) continue;`).
- Only rows with valid lat/lon enter `rawData`.

### 3.2 Lap (Sliced TelemetryPoint Array)

Each `Lap` is an **Array** of `TelemetryPoint` objects with additional properties on the array itself:

| Property | Type | Description |
|---|---|---|
| `lap[i]` | TelemetryPoint | Point within the lap |
| `.duration` | float | `lastPoint.time - firstPoint.time` in seconds |
| `.maxDistance` | float | `lastPoint.totalDistance - firstPoint.totalDistance` in meters |

### 3.3 Sensor Data (Raw from MP4Box Extraction)

Stored in `sensors` object with keys: `ACCL`, `GYRO`, `GPS9`, `GRAV`, `CORI`. Each is an array of:

**ACCL** `{ ts: float, x: float, y: float, z: float, temp: float|null }`  
**GYRO** `{ ts: float, x: float, y: float, z: float, temp: float|null }`  
**GRAV** `{ ts: float, x: float, y: float, z: float }`  
**CORI** `{ ts: float, w: float, x: float, y: float, z: float }`  
**GPS9** `{ ts: float, lat: float, lon: float, alt: float, speed2d: float, speed3d: float, days: uint32, secs: float, dop: float, fix: uint16, altSys: string }`

---

## 4. Complete State Variable Registry

All global variables with their initial values, types, and purpose. Every variable must be reset exactly as specified.

| Variable | Type | Initial Value | Purpose / When Modified |
|---|---|---|---|
| `rawData` | `TelemetryPoint[]` | `[]` | All parsed and normalized telemetry points (valid GPS only). Set by `processIncomingCSV()` |
| `lapsData` | `Lap[]` | `[]` | Array of lap arrays. Set by `calculateDefaultSingleLap()` or `calculateLapsWithGate()` |
| `map` | `L.Map` | `null` | Leaflet map instance. Set by `initMap()` |
| `tileLayer` | `L.TileLayer` | `null` | Current map tile layer. Set/replaced by `toggleTheme()` |
| `lapMarkers` | `Object<number, L.CircleMarker>` | `{}` | Per-lap start position circle markers. Keyed by lap index. Set by `renderMap()` |
| `polylineLayerGroup` | `L.LayerGroup` | `null` | Layer group for all track polylines. Set by `initMap()` |
| `selectedLapIndices` | `Set<number\|string>` | `new Set(['all'])` | Which lap indices to display. `'all'` is a sentinel. Modified by `handleFilterChange()` |
| `currentVideoSize` | `integer` | `350` | Video card width in pixels (200-800). Set by video size slider |
| `isDarkMode` | `boolean` | `false` | Current theme. Toggled by `toggleTheme()` |
| `currentSmoothing` | `integer` | `0` | Moving average window size (0-20). Set by smoothing slider |
| `isRelayouting` | `boolean` | `false` | Guards against recursive Plotly relayout during zoom sync |
| `currentPositionMarker` | `L.CircleMarker` | `null` | Yellow dot on map showing current playback position. Set by `renderMap()` |
| `sortLapsByTime` | `boolean` | `false` | Lap list sort toggle. Modified by sort checkbox |
| `gatePoints` | `L.LatLng[]` | `[]` | Start/Finish gate endpoints (max 2). Set by `handleMapClick()` |
| `gateLayer` | `L.Polyline` | `null` | Visual gate line on map. Set by `handleMapClick()` |
| `ghostLayer` | `L.Polyline` | `null` | Dashed ghost line while drawing gate (1st point set, 2nd pending). Set by `handleMapMouseMove()` |
| `isDrawingGate` | `boolean` | `false` | Whether gate drawing mode is active. Set by `toggleGateDrawingMode()` / `handleMapClick()` / `resetGate()` |
| `videoBlobUrl` | `string` | `null` | Blob URL for uploaded video file. Set by `handleVideoUpload()` |
| `videoElements` | `VideoElement[]` | `[]` | Array of `{ lapIndex: number, element: HTMLVideoElement, lapData: Lap, lastIndex: number }`. Set by `renderVideoMonitorGrid()` |
| `telemetryCsvText` | `string` | `""` | Raw CSV text for download. Set by `handleFileUpload()` or `buildCombinedTelemetryCsv()` |
| `isUploadingVideo` | `boolean` | `false` | Prevents re-entrant video upload. Set by `setVideoUploadState()` |
| `telemetryDownloadName` | `string` | `"telemetry.csv"` | Download filename. Set by `handleFileUpload()` or `extractTelemetryFromVideo()` |
| `telemetrySource` | `string` | `null` | `'csv'` or `'video'` depending on origin. Set by `handleFileUpload()` or `extractTelemetryFromVideo()` |
| `extractMetadataEnabled` | `boolean` | `true` | Whether to auto-extract telemetry from video. Toggled by extract checkbox |
| `currentPlaybackTime` | `float` | `0` | (Legacy from plan v1/v2 — kept for backward compat if referenced elsewhere. In v5 this is `playbackState.currentValue`) |
| `playbackState` | `Object` | (see below) | All playback state |

### playbackState Structure

| Property | Type | Initial | Description |
|---|---|---|---|
| `isPlaying` | boolean | `false` | Whether playback loop is running |
| `mode` | `'distance'` \| `'time'` | `'distance'` | Scrubber/chart domain |
| `currentValue` | float | `0` | Current scrubber position in current mode's units |
| `maxValue` | float | `0` | Maximum scrubber position. Set by `updateScrubberScalingBoundaries()` |
| `animFrameId` | integer | `null` | `requestAnimationFrame` ID for playback loop |
| `lastFrameTime` | float | `0` | `performance.now()` timestamp of last frame for delta calculation |
| `baseSpeed` | float | `1.0` | Playback speed multiplier from speed selector |
| `distanceSimSpeed` | float | `25.0` | Simulated speed in m/s for distance mode playback (≈90 km/h). **Hardcoded.** |

### COLORS Array

```js
const COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16',
  '#f97316', '#6366f1', '#10b981', '#f43f5e', '#8b5cf6', '#d946ef', '#14b8a6', '#eab308'
];
```
Blue, Red, Green, Yellow, Purple, Cyan, Pink, Lime, Orange, Indigo, Emerald, Rose, Violet, Fuchsia, Teal, Amber. Exactly 16 colors; lap index `% 16` selects.

---

## 5. Complete DOM Element Registry

Every element accessed via `getElementById()` (or equivalent), its type, and its role.

### 5.1 Header

| ID | Tag | Role |
|---|---|---|
| `file-info` | `<div>` | Visibility toggled. Shows filename + lap count after data load |
| `filename-display` | `<span>` | Displays current file name (truncated to 150px via CSS `max-width: 150px; truncate`) |
| `lap-count-display` | `<span>` | Displays e.g. "3 Laps" |
| `video-upload` | `<input type="file" accept="video/*">` | Hidden file input for video |
| `video-upload-label` | `<label>` | Clickable label for video upload (shows spinner state) |
| `video-upload-icon` | `<i>` | Icon inside video label (swaps to spinner during upload) |
| `video-btn-text` | `<span>` | Text inside video label (shows filename during upload, "Add Video" otherwise) |
| `csv-upload` | `<input type="file" accept=".csv">` | Hidden file input for CSV |
| `extract-telemetry-toggle` | `<input type="checkbox">` | Checked = extract telemetry from video even if no CSV loaded |
| `download-csv-btn` | `<button>` | Hidden until telemetry exists. Downloads CSV blob |
| `theme-toggle` | `<button>` | Toggles dark/light mode. Shows moon icon in light, sun icon in dark |
| `new-session-btn` | `<button>` | (NEW) Clears all data and returns to empty state. Shows confirmation toast. |
| `sidebar-toggle-btn` | `<button>` | (NEW) Hamburger icon to collapse/expand sidebar. Hidden on mobile. |
| `fullscreen-btn` | `<button>` | (NEW) On map corner. Toggles map container to fullscreen. |
| `ab-loop-a-btn` | `<button>` | (NEW) Sets marker A at current playback position |
| `ab-loop-b-btn` | `<button>` | (NEW) Sets marker B at current playback position |
| `ab-loop-toggle` | `<button>` | (NEW) Enables/disables A-B loop. Active state highlighted. |
| `toast-container` | `<div>` | (NEW) Fixed-position container for toast notifications, bottom-right |
| `hud-overlay` | `<div>` | (NEW) Telemetry HUD overlay on the primary video player |
| `rh-sidebar` | `<div>` | (NEW) Vertical resize handle between sidebar and main area |
| `rh-map-charts` | `<div>` | (NEW) Vertical resize handle between map and charts column |
| `rh-video` | `<div>` | (NEW) Horizontal resize handle between main content and video section |
| `toggle-map-btn` | `<button>` | (NEW) Chevron `⟩` button on right edge of map panel to hide/show map |
| `toggle-charts-btn` | `<button>` | (NEW) Chevron `⟨` button on left edge of charts column to hide/show charts |
| `toggle-video-btn` | `<button>` | (NEW) Chevron `▽` button on top edge of video section to hide/show video |
| `main-area` | `<div>` | (NEW) Container for map + charts + video, adjacent to sidebar |
| `map-panel` | `<div>` | (NEW) Wrapper div around `#map` for resize handling |
| `charts-column` | `<div>` | (NEW) Wrapper div around chart cards for resize handling |
| `main-content-area` | `<div>` | (NEW) Container for map + charts (above video resize handle) |

### 5.2 Sidebar

| ID | Tag | Role |
|---|---|---|
| `app-sidebar` | `<aside>` | Hidden until data loaded. Width: 320px (`w-80`) |
| `live-speed` | `<span>` | Live speed display during playback (km/h, one decimal) |
| `live-time` | `<span>` | Live timestamp during playback (mm:ss.ms) |
| `live-lap` | `<span>` | Current lap number during playback |
| `stepText` | `<div>` | Instructional text for gate drawing. Shows state-dependent messages |
| `draw-gate-btn` | `<button>` | "Set Gate" — enters gate drawing mode. Disabled until rawData has data |
| `clear-gate-btn` | `<button>` | "Reset" — clears gate, reverts to single lap |
| `sort-laps-toggle` | `<input type="checkbox">` | When checked, lap list sorted by duration ascending |
| `smoothing-slider` | `<input type="range" min="0" max="20" value="0" step="1">` | Data smoothing window |
| `smoothing-value` | `<span>` | Displays current smoothing value |
| `sidebar-lap-list` | `<div>` | Scrollable lap checkbox list. Populated by `renderLapList()` |

### 5.3 Main Area

| ID | Tag | Role |
|---|---|---|
| `empty-state` | `<div>` | Visible when no data loaded. Shows checkered flag icon, title, upload prompt |
| `dashboard-content` | `<div>` | Hidden until data loaded. Contains map + charts + video |
| `map` | `<div>` | Leaflet map container. Full height of left column |
| `chart-speed-dist` | `<div>` | Plotly container for Speed vs Distance chart |
| `chart-speed-time` | `<div>` | Plotly container for Speed vs Time chart |
| `video-section` | `<div>` | Hidden until video loaded. Bottom bar with video cards |
| `video-grid` | `<div>` | Horizontal scrollable container for video cards |
| `video-size-slider` | `<input type="range" min="200" max="800" value="350">` | Controls video card pixel width |

### 5.4 Footer / Playback Bar

| ID | Tag | Role |
|---|---|---|
| `playback-bar` | `<footer>` | Hidden until data loaded. Bottom bar with playback controls |
| `prev-frame-btn` | `<button>` | Step back 0.04s |
| `play-btn` | `<button>` | Play/Pause toggle. Shows play icon or pause icon |
| `next-frame-btn` | `<button>` | Step forward 0.04s |
| `main-scrubber` | `<input type="range" min="0" max="100" value="0" step="0.01">` | Global position scrubber |
| `scrubber-current` | `<span>` | Current position label (meters or mm:ss.ms) |
| `scrubber-total` | `<span>` | Total range label (meters or mm:ss.ms) |
| `mode-dist` | `<button>` | "Distance" mode button (active class by default) |
| `mode-time` | `<button>` | "Time" mode button (inactive by default) |
| `playback-speed` | `<select>` | Speed options: 0.25x, 0.5x, 1.0x, 2.0x, 4.0x, 8.0x |

---

## 6. Complete Function Registry (43 Functions) — Behavior, Inputs, Outputs, Edge Cases

### Group A: Utility Functions (5)

#### A1. `getDistanceFromLatLonInM(lat1, lon1, lat2, lon2)`
- **Inputs:** `lat1: number, lon1: number, lat2: number, lon2: number` — decimal degrees
- **Output:** `number` — Haversine distance in meters (Earth radius 6371000 m)
- **Formula:** Standard Haversine. `dLat = deg2rad(lat2-lat1)`, `dLon = deg2rad(lon2-lon1)`, `a = sin²(dLat/2) + cos(lat1)*cos(lat2)*sin²(dLon/2)`, `c = 2*atan2(√a, √(1-a))`, `return R * c`
- **Edge Cases:** Identical points → 0. Antipodal points → ~20015 km (half circumference). NaN inputs → NaN.

#### A2. `deg2rad(deg)`
- **Inputs:** `deg: number`
- **Output:** `number` — `deg * (Math.PI / 180)`

#### A3. `formatTime(seconds)`
- **Inputs:** `seconds: number|null`
- **Output:** `string` — Format: `"M:SS.mmm"`. Null/NaN → `"--:--.---"`
- **Logic:** `m = floor/60`, `s = floor%60`, `ms = floor(frac*1000)`. Zero-pad s and ms.
- **Edge Cases:** Negative → e.g. `"0:-1.000"` (callers should prevent negative). Very large → multi-minute output.

#### A4. `smoothData(data, windowSize)`
- **Inputs:** `data: number[]`, `windowSize: integer` (0-20)
- **Output:** `number[]` — same length as input
- **Logic:** Moving average. For each index i, average elements from `i-windowSize` to `i+windowSize` inclusive, clamped to array bounds.
- **Edge Cases:** windowSize ≤ 0 → returns copy of `data`. windowSize > data.length/2 → effectively box filter of entire array. Single-element input → identity.

#### A5. `intersects(a, b, c, d, p, q, r, s)`
- **Inputs:** Segment 1: `(a,b)-(c,d)`, Segment 2: `(p,q)-(r,s)` — all numbers (lon, lat pairs)
- **Output:** `boolean` — true if segments intersect (excluding endpoints touching)
- **Logic:** Standard 2D line intersection using determinant. Returns true when `0 < lambda < 1` AND `0 < gamma < 1`.
- **Edge Cases:** Parallel segments → false. Collinear overlapping → false (degenerate). Zero-length segment → false (det=0).

### Group B: Initialization & Setup (2)

#### B1. `DOMContentLoaded` listener (line 366)
- **Behavior:** Calls `initMap()`, `setupEventListeners()`, checks `prefers-color-scheme: dark` and auto-toggles theme if dark.
- **Runs once** on page load.

#### B2. `setupEventListeners()` (line 414)
- **Behavior:** Wires ALL event listeners (see Section 7 for complete map). Called once at DOMContentLoaded.
- **Non-obvious wiring:** The `sizeSlider` `input` event recalculates video section height as `Math.round(currentVideoSize * 9 / 16) + 60`. The `window.resize` listener calls `Plotly.Plots.resize()` on both charts.

#### B3. `initMap()` (line 473)
- **Behavior:**
  1. Create map on `'map'` div: `L.map('map', { zoomControl: false }).setView([0, 0], 2)`
  2. Add zoom control to bottom-right: `L.control.zoom({ position: 'bottomright' })`
  3. Add CartoDB Dark Matter tile layer
  4. Create `polylineLayerGroup = L.layerGroup().addTo(map)`
  5. Bind `mousemove` → `handleMapMouseMove`, `click` → `handleMapClick`

### Group C: Gate / S-F Line (4)

#### C1. `toggleGateDrawingMode()` (line 485)
- **Guard:** If `rawData.length === 0`, return early (button should be disabled anyway).
- **Behavior:** Sets `isDrawingGate = true`, clears `gatePoints`, removes existing `gateLayer` and `ghostLayer` from map, updates `stepText` to: `"<span class='text-brand-600 dark:text-brand-400 font-bold flex items-center gap-2 animate-pulse'><i class='ph ph-crosshair text-lg'></i> Click map for Gate START point</span>"`

#### C2. `handleMapMouseMove(e)` (line 494)
- **Guard:** Only active if `isDrawingGate === true` AND `gatePoints.length === 1`.
- **Behavior:** Removes existing `ghostLayer`, creates new dashed red polyline from `gatePoints[0]` to `e.latlng` with `{ color: '#ef4444', weight: 3, dashArray: '6,6', opacity: 0.8 }`.

#### C3. `handleMapClick(e)` (line 503)
- **Guard:** If `!isDrawingGate || rawData.length === 0` → return.
- **Two States:**
  - **First click** (`gatePoints.length === 0`): Push `e.latlng` to `gatePoints`. Update `stepText` to END prompt.
  - **Second click** (`gatePoints.length === 1`): Push `e.latlng`, set `isDrawingGate = false`, remove `ghostLayer`, create solid red `gateLayer` (weight 5, opacity 1), update `stepText` to gate locked message, call `calculateLapsWithGate()`.
- **Edge Case:** User clicks same point twice → gate is zero-length line → `intersects` returns false everywhere → single lap result.

#### C4. `resetGate()` (line 521)
- **Behavior:** Clears `gatePoints`, `isDrawingGate`, removes `gateLayer` and `ghostLayer` from map. Resets `stepText` to default instruction. If `rawData.length > 0`, calls `calculateDefaultSingleLap()`.

### Group D: File Handling (6)

#### D1. `handleFileUpload(event)` (line 533)
- **Triggers:** `csv-upload` `change` event.
- **Behavior:**
  1. Get `file` from `event.target.files[0]`. Guard: `if (!file) return`.
  2. Set `telemetrySource = 'csv'`, derive `telemetryDownloadName` from filename (strip extension, add `_telemetry.csv`).
  3. Set `telemetryCsvText = ""`, hide download button.
  4. `FileReader.readAsText(file)`. On `reader.onload`: store `telemetryCsvText = e.target.result`, show download button, call `Papa.parse(file, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: processIncomingCSV, error: alert })`.
- **Edge Cases:** Empty file → PapaParse returns empty data → `processIncomingCSV` returns early. Malformed CSV → PapaParse errors logged to console but partial data still processed.

#### D2. `downloadTelemetryCsv()` (line 559)
- **Behavior:** If `telemetryCsvText` is empty, return. Create `Blob([telemetryCsvText], { type: 'text/csv;charset=utf-8;' })`, generate object URL, create temporary `<a>` element, programmatically click it, revoke URL.
- **Edge Cases:** Very large CSV → OK for memory (already in string). Special characters → UTF-8 handled by Blob type.

#### D3. `extractTelemetryFromVideo(file)` (line 570)
- **Triggers:** `handleVideoUpload()` when no CSV loaded AND `extractMetadataEnabled` is true.
- **Guard:** If `!window.MP4Box`, alert and return.
- **Async Behavior:**
  1. Initialize `sensors` object: `{ ACCL: [], GYRO: [], GPS9: [], GRAV: [], CORI: [] }`
  2. Create `MP4Box.createFile()` instance
  3. `onReady`: Find GPMD track via `info.tracks.find(t => t.codec === 'gpmd')`. Set `gpmdTrackId` and `timescale`. Call `mp4box.setExtractionOptions(gpmdTrackId)`, `mp4box.start()`.
  4. `onSamples`: Compute `ctsMs = (sample.cts / timescale) * 1000`, `durMs = (sample.duration / timescale) * 1000`, call `parseGPMD(sample.data, ctsMs, durMs, sensors)`.
  5. Read file via `file.stream().getReader()` in chunks, append to mp4box, call `mp4box.flush()` on EOF.
  6. On success: `telemetryCsvText = buildCombinedTelemetryCsv(sensors, fileNameBase)`. Set source to `'video'`, download name. Show download button. Parse CSV text with PapaParse → `processIncomingCSV()`.
  7. On error: console.error, alert.
- **Edge Cases:** No GPMD track → reject with "No GPMD track found". Read error → catch and reject. Empty samples → telemetryCsvText will be just headers, parse will produce empty data.

#### D4. `parseGPMD(data, baseCts, duration, sensors)` (line 652)
- **Inputs:** `data: ArrayBuffer` (raw sample data), `baseCts: float` (CTS in ms), `duration: float` (sample duration in ms), `sensors: Object` (the accumulators).
- **Behavior:** Recursive KLV (Key-Length-Value) parser.
  - Read 8-byte header: 4-byte `fourcc` (ASCII), 1-byte `type` char, 1-byte `size`, 2-byte `count` (big-endian uint16).
  - Compute payload size: `pSize = size * count`
  - **DEVC / STRM**: Recurse into payload.
  - **TAMP**: Read 2-byte signed int16 at payload offset → divide by 100 → `currentTemp`.
  - **ACCL**: If type `'f'` → 12 bytes/sample (3× float32). Else → 6 bytes/sample (3× int16 / 100). Iterate `samples = floor(pSize / bytesPerSample)`. Push `{ ts, x, y, z, temp }`.
  - **GYRO**: Same as ACCL but int16 divisor is 1000.
  - **GRAV**: Same structure, int16 divisor is 4096.
  - **CORI**: If type `'f'` → 16 bytes/sample (4× float32). Else → 8 bytes/sample (4× int16 / 32767). Push `{ ts, w, x, y, z }`.
  - **GPS9**: Fixed 32 bytes/sample. `lat: int32/1e7`, `lon: int32/1e7`, `alt: int32/1000`, `speed2d: int32/1000`, `speed3d: int32/1000`, `days: uint32`, `secs: uint32/1000`, `dop: uint16/100`, `fix: uint16`, `altSys: 'MSLV'`. Push `{ ts, lat, lon, alt, speed2d, speed3d, days, secs, dop, fix, altSys }`.
  - Advance `i` by `8 + ceil(pSize / 4) * 4` (4-byte aligned).
- **Edge Cases:** Unknown fourcc → silently skip (length used to advance). Partial last sample → truncated (floor division). Empty/zero-length fourcc → loop ends.

#### D5. `buildCombinedTelemetryCsv(sensors, selectedFileName)` (line 753)
- **Inputs:** `sensors: Object` (5 arrays), `selectedFileName: string` (unused, for future use).
- **Output:** `string` — full CSV text.
- **Behavior:**
  1. Collect all unique timestamps from all 5 sensor arrays: `new Set(...)` → merge → sort numerically.
  2. For each sensor type, build `Map<ts_string, point>` for O(1) lookup.
  3. Iterate sorted timestamps. For each, combine data from all 5 maps (missing fields → empty string).
  4. Compute `date` from GPS `days`+`secs` using reference date `2000-01-01T00:00:00Z`. Track `currentDateStr` (carries forward if GPS not present in current row).
  5. Build CSV row matching the exact 27-column schema from Section 16.
  6. Return concatenated CSV string.
- **Edge Cases:** Sensor with no data → empty map → all fields empty in output. GPS row without GPS data → date carries from last GPS row. Timestamps with slight floating-point differences → `toFixed(6)` used for matching key.

#### D6. `processIncomingCSV(data)` (line 795)
- **Inputs:** `data: Object[]` — PapaParse output array of row objects.
- **Output:** Sets `rawData` globally. No return value.
- **Behavior:**
  1. Guard: if `data.length === 0` return.
  2. Auto-detect column names by scanning keys of first row:
     - `latKey`: key containing `"lat"` (case-insensitive)
     - `lonKey`: key containing `"lon"` or `"long"` (case-insensitive)
     - `speedKey`: key containing `"2D"` or `"speed"` or `"3D"` (case-insensitive)
     - `timeKey`: key containing `"date"` or `"cts"` or `"time"` (case-insensitive)
  3. Guard: if `!latKey || !lonKey` return (no GPS data).
  4. Iterate rows:
     - Parse `lat`, `lon` as floats. If NaN, `continue` (skip row).
     - Parse speed: if `speedKey` exists, parse float → multiply by 3.6 if not already km/h (check string for "km/h"). Store both `speed` (km/h) and `speedMS` (m/s).
     - Parse timestamp: if `timeKey` value is numeric AND > 100000, treat as epoch ms. If ISO date string, use `new Date(value).getTime()`. Otherwise use row index * 0.1 as fallback. Normalize to seconds relative to first row.
     - Compute cumulative Haversine distance from previous point.
     - Push `{ index, lat, lon, speed, speedMS, time, totalDistance, rowId }` to `clean`.
  5. Set `rawData = clean`.
  6. Enable `draw-gate-btn` (remove `disabled`).
  7. Call `calculateDefaultSingleLap()`.
- **Edge Cases:** All GPS rows invalid → `clean` is empty → return early without setting rawData. Single GPS point → no distance (totalDistance=0). Timestamp parsing fails → fallback to index*0.1.

### Group E: Lap Calculation (3)

#### E1. `calculateDefaultSingleLap()` (line 856)
- **Behavior:**
  1. Guard: if `rawData.length === 0` return.
  2. Create single lap: map each rawData point, adding `lap: 1`, `lapDistance: p.totalDistance`.
  3. Set `lapsData[0].duration = last.time - first.time`, `lapsData[0].maxDistance = last.totalDistance`.
  4. Reset `selectedLapIndices = new Set(['all'])`.
  5. Call `updateUIState()`, `updateVisualization()`.
- **Called by:** `processIncomingCSV()`, `resetGate()` (when rawData exists).

#### E2. `calculateLapsWithGate()` (line 870)
- **Guard:** If `gatePoints.length < 2 || rawData.length === 0` return.
- **Behavior:**
  1. Loop `i = 1` to `rawData.length - 1`. For each adjacent pair `(rawData[i-1], rawData[i])`, test intersection with gate line via `intersects()` function.
  2. When intersection found, if `i - lastSplitIdx > 50` (minimum 50-point gap to avoid noise), slice `rawData[lastSplitIdx ... i+1]` as a new lap, set `lastSplitIdx = i`.
  3. If trailing points ≥ 10, add final lap.
  4. For each lap: normalize `lapDistance = p.totalDistance - baseDist`, compute `duration`, `maxDistance`.
  5. Set `selectedLapIndices = new Set(['all'])`.
  6. Call `updateUIState()`, `updateVisualization()`.
- **Edge Cases:** Gate drawn outside track → no intersections → single lap. Only one intersection → single lap. Noise gate crossings within 50 points → ignored. Gate at very first/last segment → very short first/last lap possible.

#### E3. `getSelectedLaps()` (line 1449)
- **Output:** `Array<{ lap: Lap, index: number }>` — sorted by index ascending.
- **Behavior:** If `selectedLapIndices.has('all')`, return all laps. Else iterate `selectedLapIndices` (must be numbers), push matching lap. Filter out undefined indices.
- **Edge Cases:** `selectedLapIndices` contains indices beyond `lapsData.length` → silently ignored. Empty set → empty array (but guard in `handleFilterChange` prevents this by re-adding 'all').

### Group F: UI Update & Rendering (7)

#### F1. `updateUIState()` (line 904)
- **Behavior:**
  1. Hide empty state: `empty-state.classList.add('hidden')`
  2. Show sidebar: `app-sidebar.classList.remove('hidden')`
  3. Show dashboard: `dashboard-content.classList.remove('hidden')`
  4. Show file info: `file-info.classList.remove('hidden')`, `file-info.classList.add('flex')`
  5. Show playback bar: `playback-bar.classList.remove('hidden')`
  6. Update lap count display: `lap-count-display.textContent = `${lapsData.length} Laps``
  7. Call `renderLapList()`
  8. `setTimeout(150ms)`: `map.invalidateSize()`, fit bounds to rawData, resize both Plotly charts.

#### F2. `renderLapList()` (line 927)
- **Behavior:**
  1. Clear `sidebar-lap-list` innerHTML.
  2. Create "All Laps" filter item at top (value='all', color '#3b82f6', no duration, no best indicator).
  3. Add separator (`<div class="h-px w-full bg-gray-200 dark:bg-gray-800 my-2">`).
  4. Build `lapsToDisplay` array from `lapsData` with indices.
  5. If `sortLapsByTime` is true: sort by `lap.duration` ascending (Infinity for undefined).
  6. Compute `bestTime = Math.min(...lapsData.map(l => l.duration).filter(d => d > 0))`.
  7. For each lap: checkbox checked if `selectedLapIndices.has(idx) || selectedLapIndices.has('all')`. Mark as best if duration === bestTime AND `lapsData.length > 1`.
  8. Append `createFilterItem(...)` for each.
- **Edge Cases:** Empty lapsData → only "All Laps" shown. All same duration → all marked as best (if more than 1 lap).

#### F3. `createFilterItem(label, value, checked, color, duration, isBest)` (line 956)
- **Inputs:** See parameters.
- **Output:** `<label>` DOM element.
- **HTML Structure:**
  ```html
  <label class="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700 select-none">
      <input type="checkbox" value="..." class="lap-checkbox focus:ring-0" [checked]>
      <div class="w-3 h-3 rounded-full shadow-sm flex-shrink-0" style="background-color: {color}"></div>
      <span class="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">{label}</span>
      {durationHtml}
  </label>
  ```
  - durationHtml: `formatTime(duration)` in monospace font. If isBest: green text with `<i class="ph-fill ph-trophy text-[10px]"></i>` prefix.
- **Event:** Binds `checkbox change` → `handleFilterChange(value, e.target.checked)`.

#### F4. `handleFilterChange(value, isChecked)` (line 978)
- **Complex selection logic:**
  - **value === 'all':**
    - If checking: uncheck all others, set `selectedLapIndices = new Set(['all'])`.
    - If unchecking: if no others checked, re-check 'all'. Otherwise just remove 'all'.
  - **value !== 'all':**
    - If checking: remove 'all' from set (if present), uncheck 'all' checkbox, add this index.
    - If unchecking: remove this index. If set becomes empty, re-add 'all', re-check 'all' checkbox.
- **After all changes:** Call `updateVisualization()`.
- **Edge Cases:** User checks individual lap while 'all' is checked → 'all' gets unchecked. User unchecks last individual lap → 'all' gets rechecked.

#### F5. `toggleTheme()` (line 1006)
- **Behavior:**
  1. Toggle `isDarkMode`.
  2. Toggle `document.documentElement.classList.toggle('dark')`.
  3. **Map tiles:** Remove old tileLayer. In dark mode: CartoDB Dark Matter. In light mode: OpenStreetMap standard tiles. Re-add polylineLayerGroup.
  4. If `lapsData.length > 0`: call `updateVisualization()` to re-render charts with new theme colors.

#### F6. `renderMap(lapsToRender)` (line 1018)
- **Inputs:** `lapsToRender: Array<{ lap: Lap, index: number }>`
- **Behavior:**
  1. Clear `polylineLayerGroup` (all polylines).
  2. Remove all existing `lapMarkers` from map, reset `lapMarkers = {}`.
  3. For each lap: create `L.polyline(latlngs, { color: COLORS[index % 16], weight: 4, opacity: 0.85 })` → add to layer group. Create start circle marker: `L.circleMarker([startPt.lat, startPt.lon], { radius: 5, color: '#fff', weight: 2, fillColor: COLORS[index], fillOpacity: 1 })` → store in `lapMarkers[index]`.
  4. **Current position marker:** If no `currentPositionMarker`, create yellow dot: `L.circleMarker(firstPt, { radius: 8, color: '#fff', fillColor: '#facc15', fillOpacity: 1, weight: 2, className: 'drop-shadow-md' })`. Else update latlng.
- **Edge Cases:** Empty laps → nothing drawn, marker not created. Single point lap → polyline is a dot.

#### F7. `renderCharts(lapsToRender)` (line 1051)
- **Two Plotly charts created:**
  - `chart-speed-dist`: Speed (km/h) vs Lap Distance (m)
  - `chart-speed-time`: Speed (km/h) vs Time (s) — time relative to lap start
- **Layout:**
  - Theme-aware: `bg: "transparent"`, `fontColor: isDarkMode ? "#cbd5e1" : "#475569"`, `gridColor: isDarkMode ? "#334155" : "#e2e8f0"`
  - Axis font: `{ family: 'Inter, sans-serif', size: 11, color: fontColor }`
  - Margins: `{ t: 30, r: 20, l: 40, b: 35 }`
  - Legend: horizontal, top-right
  - Hovermode: 'closest'
  - `hoverlabel.bgcolor`: theme-aware (dark: #1e293b, light: #ffffff)
  - `yaxis.fixedrange: false` (allows zoom)
- **Data per lap:** One trace per selected lap, with smoothed speed (via `smoothData` with `currentSmoothing`). Line width: 2.5. Color: `COLORS[index % 16]`.
- **Cursor tracker trace:** Empty `{ x: [], y: [], mode: 'markers', type: 'scatter' }` appended to each chart. Updated during playback with restyle.
- **After creation:** Call `setupInteractionProfiles('chart-speed-dist', 'chart-speed-time')` and `setupZoomSyncEngine(...)`.
- **Edge Cases:** 0 laps selected → warning logged by Plotly but no visible chart. All data points identical → flat line.

### Group G: Chart Interaction (2)

#### G1. `setupZoomSyncEngine(id1, id2)` (line 1098)
- **Behavior:** Binds `plotly_relayout` events on both charts. When one chart zooms, the other chart's X/Y axes are synchronized:
  - **Y-axis:** Directly copy `yaxis.range[0/1]` or `yaxis.autorange`.
  - **X-axis:** Map distance ↔ time using the first (index 0) lap as reference. For dist→time: find point with matching lapDistance, use its relative time. For time→dist: find point with matching relative time, use its lapDistance.
- **Guard:** `isRelayouting` flag prevents infinite loop.
- **Edge Cases:** Zoom beyond data bounds → clamped to min/max. No laps selected → return early.

#### G2. `setupInteractionProfiles(id1, id2)` (line 1149)
- **Click (plotly_click):** Pause playback. If `customdata` (rowId) is available, get `rawData[rowId]`. If mode is 'distance', `manualSeek(dataPoint.lapDistance)`. If 'time', `manualSeek(dataPoint.time - matchedLap[0].time)`.
- **Hover (plotly_hover):** If `customdata` available, move `currentPositionMarker` to `[pt.lat, pt.lon]`.
- **Edge Cases:** Click on legend → no `customdata` → guard returns. Hover outside data → no points → guard returns.

### Group H: Video Handling (5)

#### H1. `setVideoUploadState(isLoading, labelText)` (line 1180)
- **Behavior:** Adds/removes visual loading state on video upload button. Toggles `opacity-80`, swaps icon between `ph-video-camera` and `ph-spinner-gap animate-spin`, changes text. If `labelText` provided, shows truncated filename.

#### H2. `handleVideoUpload(event)` (line 1200)
- **Triggers:** `video-upload` `change` event.
- **Behavior:**
  1. Get file, guard.
  2. Call `setVideoUploadState(true, truncatedName)`.
  3. Create `videoBlobUrl = URL.createObjectURL(file)`.
  4. Check if CSV already uploaded (`csv-upload.files.length > 0`). If not and `extractMetadataEnabled` is true, await `extractTelemetryFromVideo(file)`.
  5. `finally`: `setVideoUploadState(false)`.
  6. If `lapsData.length > 0`, call `updateVisualization()`.
- **Edge Cases:** Video upload fails → `extractTelemetryFromVideo` throws → finally block resets state. Video with no supported codec → blob URL created but `<video>` elements show error overlay.

#### H3. `renderVideoMonitorGrid(lapsToRender)` (line 1228)
- **Behavior:**
  1. Guard: if no `videoBlobUrl`, hide video section and return.
  2. Show video section. Clear `video-grid` innerHTML. Reset `videoElements = []`.
  3. If `selectedLapIndices.has('all')` and laps > 4, show only first 4 and display alert message.
  4. For each lap to show:
     - Create `<div class="video-card ...">` with `borderColor = COLORS[index%16]`, dimensions from `currentVideoSize` (width × height = 16:9 ratio).
     - Create `<video>` element: `src = videoBlobUrl`, `muted = true`, `preload = "auto"`, `playsInline = true`, `controls = false`.
     - Bind `loadeddata` event: if `video.videoWidth === 0`, add `has-error` class.
     - Bind `error` event: add `has-error` class.
     - Create error overlay div (hidden by default, shown via `.has-error .error-overlay`).
     - Create lap label overlay (top-left, black semi-transparent background, color dot + "Lap N").
     - Append to grid. Push `{ lapIndex: index, element: video, lapData: lap, lastIndex: 0 }` to `videoElements`.
  5. Call `syncVideosToStateTimeline(true)`.
- **Edge Cases:** No video URL → section stays hidden. All videos show same source but at different currentTime positions.

#### H4. `updateVideoPlaybackRates()` (line 1295)
- **Behavior:** Only active when `playbackState.isPlaying === true`.
  - **Time mode:** Set `vObj.element.playbackRate = playbackState.baseSpeed` for all videos.
  - **Distance mode:** For each video, find the data point where `lap[i].lapDistance >= playbackState.currentValue`. If found and `pt.speedMS > 0.5`, compute `rate = (distanceSimSpeed * baseSpeed) / pt.speedMS`. Clamp rate to [0.15, 5.0]. If outside clamp, use 1.0.
- **Edge Cases:** Speed = 0 → rate would be infinity → falls into `> 5.0` clamp → uses 1.0. No matching point found → `pt` is null → uses 1.0.

#### H5. `syncVideosToStateTimeline(forceSeek)` (line 1316)
- **Core synchronization function.** Called every frame during playback and on manual seek.
- **Behavior:**
  1. Update `scrubber-current` label: if distance mode → `"N m"`, if time mode → `formatTime(currentValue)`.
  2. For each video element:
     - Compute `targetFileTime`:
       - **Distance mode:** Find point where `lapDistance >= currentValue`. Use that point's `.time`. If beyond max → use lap's last time.
       - **Time mode:** `targetFileTime = lap[0].time + currentValue`. Clamped to lap end.
     - If `forceSeek || diff > threshold` (0.15 for distance, 0.35 for time): set `vObj.element.currentTime = targetFileTime`.
  3. Update live telemetry panel (speed, time, lap) from first lap's matching point.
  4. Update lap markers on map to matching point lat/lon.
  5. Update `currentPositionMarker` on map.
  6. **Chart cursors:** Restyle the last trace (cursor) on both charts with matching points' positions.
- **Edge Cases:** No `videoElements` → video section skipped. No matching point → cursor not updated. `forceSeek` true → always seeks regardless of threshold.

### Group I: Playback Engine (6)

#### I1. `playbackLoop()` (line 1379)
- **rAF loop.**
- **Behavior:**
  1. If not playing, return.
  2. Compute delta time: `dt = (performance.now() - lastFrameTime) / 1000`.
  3. Update `currentValue`:
     - Time mode: `currentValue += dt * baseSpeed`
     - Distance mode: `currentValue += distanceSimSpeed * baseSpeed * dt`
  4. If `currentValue > maxValue`: reset to 0, reset all `lastIndex` to 0.
  5. Update scrubber value.
  6. Call `syncVideosToStateTimeline(false)`.
  7. Call `updateVideoPlaybackRates()`.
  8. `requestAnimationFrame(playbackLoop)`.
- **Edge Cases:** Tab hidden → `performance.now()` may return stale values → large dt → jump forward. Very small dt (<1ms) → smooth but may cause performance issues.

#### I2. `startPlayback()` (line 1398)
- **Behavior:** If already playing, return. If at end, reset to 0. Call `play()` on all videos (catch promise rejections silently). Set `isPlaying = true`, record `lastFrameTime`, update play button icon to pause, call `requestAnimationFrame(playbackLoop)`.

#### I3. `pausePlayback()` (line 1408)
- **Behavior:** Set `isPlaying = false`, cancel `animFrameId`, update play button icon to play, pause all videos.

#### I4. `togglePlayback()` (line 1415)
- **Behavior:** If playing → pause, else → start.

#### I5. `manualSeek(val)` (line 1419)
- **Behavior:** Set `playbackState.currentValue = val`. Reset all video `lastIndex = 0`. Call `syncVideosToStateTimeline(true)` with forceSeek.
- **Called by:** Scrubber input, chart click, mode switch + reset.

#### I6. `stepFrame(seconds)` (line 1423)
- **Behavior:** Pause playback. `currentValue += seconds`. Clamp to [0, maxValue]. Update scrubber value. `syncVideosToStateTimeline(true)`.
- **Called with:** `-0.04` (prev) or `+0.04` (next). 0.04s ≈ 25 fps.

### Group J: Playback Mode (1)

#### J1. `setPlaybackMode(mode)` (line 1432)
- **Behavior:**
  1. Set `playbackState.mode = mode` (`'distance'` or `'time'`, `'time'` as default).
  2. Toggle active/inactive classes on `mode-dist` and `mode-time` buttons.
  3. Pause playback.
  4. Call `updateScrubberScalingBoundaries(getSelectedLaps())` to recalculate max.
  5. Reset `currentValue = 0`, all `lastIndex = 0`.
  6. `syncVideosToStateTimeline(true)`.

### Group K: Playback Bar (4)

#### K1. `updateScrubberScalingBoundaries(lapsToRender)` (line 1279)
- **Behavior:**
  1. If no laps, return.
  2. Compute `maxVal`: distance mode → max of all `lap.maxDistance`. Time mode → max of all `lap.duration`.
  3. Update `scrubber-total` label: distance → `"N m"` (rounded), time → `formatTime(maxVal)`.
  4. Set `playbackState.maxValue = maxVal`.
  5. Set scrubber `max = maxVal`, `value = playbackState.currentValue`.

#### K2–K6: Playback controls
- `prev-frame-btn` click → `stepFrame(-0.04)`
- `play-btn` click → `togglePlayback()`
- `next-frame-btn` click → `stepFrame(0.04)`
- `main-scrubber input` → `manualSeek(parseFloat(value))`
- `main-scrubber mousedown` → `pausePlayback()`
- `playback-speed change` → `playbackState.baseSpeed = parseFloat(value)`, `updateVideoPlaybackRates()`

### Group L: Orchestrator (1)

#### L1. `updateVisualization()` (line 1220)
- **Behavior:** Calls in order:
  1. `getSelectedLaps()` → `lapsToRender`
  2. `renderCharts(lapsToRender)`
  3. `renderMap(lapsToRender)`
  4. `renderVideoMonitorGrid(lapsToRender)`
  5. `updateScrubberScalingBoundaries(lapsToRender)`

---

## 7. Event Listener Wiring Map

Every event listener in the application, its trigger element, event type, handler, and special behavior.

| # | Element ID | Event | Handler | Notes |
|---|---|---|---|---|
| 1 | `document` | `DOMContentLoaded` | Inline → `initMap()`, `setupEventListeners()`, auto-dark-check | Fires once |
| 2 | `csv-upload` | `change` | `handleFileUpload` | |
| 3 | `video-upload` | `change` | `handleVideoUpload` | |
| 4 | `extract-telemetry-toggle` | `change` | `(e) => extractMetadataEnabled = e.target.checked` | |
| 5 | `download-csv-btn` | `click` | `downloadTelemetryCsv` | |
| 6 | `smoothing-slider` | `input` | `(e) => { currentSmoothing = parseInt(e.target.value); update value display; if (lapsData.length > 0) renderCharts(getSelectedLaps()); }` | Smoothing triggers chart re-render |
| 7 | `sort-laps-toggle` | `change` | `(e) => { sortLapsByTime = e.target.checked; renderLapList(); }` | |
| 8 | `draw-gate-btn` | `click` | `toggleGateDrawingMode` | |
| 9 | `clear-gate-btn` | `click` | `resetGate` | |
| 10 | `theme-toggle` | `click` | `toggleTheme` | |
| 11 | `play-btn` | `click` | `togglePlayback` | |
| 12 | `mode-dist` | `click` | `() => setPlaybackMode('distance')` | |
| 13 | `mode-time` | `click` | `() => setPlaybackMode('time')` | |
| 14 | `playback-speed` | `change` | `(e) => { playbackState.baseSpeed = parseFloat(e.target.value); updateVideoPlaybackRates(); }` | |
| 15 | `prev-frame-btn` | `click` | `() => stepFrame(-0.04)` | |
| 16 | `next-frame-btn` | `click` | `() => stepFrame(0.04)` | |
| 17 | `main-scrubber` | `input` | `(e) => manualSeek(parseFloat(e.target.value))` | |
| 18 | `main-scrubber` | `mousedown` | `() => pausePlayback()` | Pause on drag start |
| 19 | `video-size-slider` | `input` | Resize all video cards + section height | |
| 20 | `window` | `resize` | `() => { Plotly.Plots.resize('chart-speed-dist'); Plotly.Plots.resize('chart-speed-time'); }` | Only if lapsData loaded |
| 21 | `map` | `mousemove` | `handleMapMouseMove` | Ghost gate line |
| 22 | `map` | `click` | `handleMapClick` | Set gate points |
| 23 | `chart-speed-dist` | `plotly_relayout` | Zoom sync → `chart-speed-time` | |
| 24 | `chart-speed-time` | `plotly_relayout` | Zoom sync → `chart-speed-dist` | |
| 25 | `chart-speed-dist` | `plotly_click` | `handlePlotClick` → pause + seek | |
| 26 | `chart-speed-time` | `plotly_click` | `handlePlotClick` → pause + seek | |
| 27 | `chart-speed-dist` | `plotly_hover` | `handlePlotHover` → move map marker | |
| 28 | `chart-speed-time` | `plotly_hover` | `handlePlotHover` → move map marker | |
| 29 | Per-video `<video>` | `loadeddata` | Check `videoWidth === 0` → add `has-error` | |
| 30 | Per-video `<video>` | `error` | Add `has-error` class | |
| 31 | Per-lap-checkbox (dynamic) | `change` | `handleFilterChange(value, checked)` | Created in `createFilterItem` |
| 32 | `document` | `keydown` | Keyboard shortcut dispatcher (see Appendix E) | Single handler, checks `document.activeElement` to avoid conflicts with input fields |
| 33 | `window` | `dragover` | `e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; body.classList.add('drag-over')` | Prevent default + visual highlight |
| 34 | `window` | `dragleave` | `body.classList.remove('drag-over')` | Remove visual highlight when drag leaves window |
| 35 | `window` | `drop` | `handleFileDrop(e)` — extracts files from `e.dataTransfer.files`, routes CSV to `handleFileUpload` and video to `handleVideoUpload` | Prevents default, removes drag-over class |
| 36 | `new-session-btn` | `click` | `resetAllData()` — clears all state, hides dashboard, shows empty state, revokes blob URLs | Shows confirmation toast with 5s undo option |
| 37 | `sidebar-toggle-btn` | `click` | Toggle `sidebar-collapsed` class on body, toggle icon between hamburger and close | Animates sidebar width |
| 38 | `fullscreen-btn` | `click` | `mapContainer.requestFullscreen()` or `exitFullscreen()` | Uses Fullscreen API |
| 39 | `ab-loop-a-btn` | `click` | Set `playbackState.markerA = playbackState.currentValue` | Visual indicator on scrubber |
| 40 | `ab-loop-b-btn` | `click` | Set `playbackState.markerB = playbackState.currentValue` | Visual indicator on scrubber |
| 41 | `ab-loop-toggle` | `click` | Toggle `playbackState.loopEnabled` and `playbackState.loopMode` between `'full'` and `'ab'` | If A/B not set, default to full loop |
| 42 | `chart-speed-dist` | `plotly_restyle` | (If legend click) update `selectedLapIndices` to match visible traces | Bidirectional sync between sidebar and chart legend |
| 43 | `chart-speed-time` | `plotly_restyle` | Same as above | |
| 44 | `map` | `dblclick` | If gate is set, allow repositioning nearest gate endpoint to click location | If no gate, treat as zoom (default) |
| 45 | `map` | `contextmenu` | (Right-click) — cancel gate drawing if active, or show context menu with "Set Gate Here" option | `e.preventDefault()` |
| 46 | `rh-sidebar`, `rh-map-charts`, `rh-video` | `mousedown` | `LayoutManager.onDragStart` | Start resize drag |
| 47 | `rh-sidebar`, `rh-map-charts`, `rh-video` | `touchstart` | `LayoutManager.onDragStart` (passive) | Touch resize start |
| 48 | `document` | `mousemove` | `LayoutManager.onDragMove` | During drag, update flex-basis |
| 49 | `document` | `touchmove` | `LayoutManager.onDragMove` (passive: false) | During drag, update flex-basis |
| 50 | `document` | `mouseup` | `LayoutManager.onDragEnd` | End drag, save layout |
| 51 | `document` | `touchend` | `LayoutManager.onDragEnd` | End drag, save layout |
| 52 | `toggle-map-btn` | `click` | `() => togglePanel('map-panel')` | Hide/show map |
| 53 | `toggle-charts-btn` | `click` | `() => togglePanel('charts-column')` | Hide/show charts column |
| 54 | `toggle-video-btn` | `click` | `() => togglePanel('video-section')` | Hide/show video section |
| 55 | `window` | `panelresize` | `(e) => { if map: invalidateSize; if charts: Plotly.Plots.resize }` | Triggered by resize/drag or hide/show |
| 56 | `document` | `keydown` | Handler for `M`, `C`, `V` shortcuts (map/charts/video toggle) | Part of keyboard shortcut dispatcher (Appendix B) |

---

## 8. Architecture & File Structure

### Directory Tree

```
/src
  /assets
    - fonts (linked via CDN, not local)
    - sample CSV (for testing)
  /styles
    - global.css       # Tailwind directives, custom scrollbar, range input, checkbox, video-card styles
  /core
    - state.js         # Global state manager (Pub/Sub for reactive UI updates)
    - math.js          # Physics Engine: Haversine, smoothing, gate intersection
  /modules
    /extractor
      - mp4box.js      # MP4Box initialization, GPMD extraction, KLV parser
      - csvBuilder.js  # buildCombinedTelemetryCsv — sensor → CSV text
      - parseCSV.js    # processIncomingCSV — normalize raw CSV → rawData
    /mapping
      - map.js         # Leaflet init, tile switching, polyline/marker rendering
      - gate.js        # Gate drawing mode, ghost line, intersection lap split
    /charts
      - plots.js       # Plotly setup, Speed-vs-Distance, Speed-vs-Time
      - sync.js        # Zoom sync engine, click/hover interaction profiles
    /video
      - uploader.js    # Video upload, blob URL management, loading state
      - player.js      # Video grid rendering, playback rate sync, frame seek
    /ui
      - layout.js      # LayoutManager class: resize handles, panel hide/show, state persistence
      - theme.js       # Dark/light mode toggle
      - playback.js    # Playback bar, scrubber, play/pause, mode switch
      - lapList.js     # Lap list rendering, filter logic, sort toggle
  - index.html         # Entry point — all DOM scaffolding
  - app.js             # Bootstrapper — imports, initMap, setupEventListeners
```

### Module Loading Strategy

For the initial build, use a single-file approach (all in one HTML) to match v5. For subsequent refactoring, split into separate JS files using ES6 modules (type="module" in script tag). No bundler is required; use `import`/`export` with `.js` extensions.

### Component Architecture

**Feature-based folders** (not atomic design). Each module folder contains:
- A primary file that exports initialization functions
- Any sub-logic files
- The module's specific DOM creation/manipulation

All modules access global state via the `state.js` Pub/Sub system, not by reading/writing globals directly.

---

## 9. Core Features & User Flows (Step-by-Step)

### Flow 1: Smart Data Ingestion (CSV Upload)

#### Method A: Click-to-Browse
1. User clicks "Upload CSV" button → hidden `<input type="file" accept=".csv">` triggers file picker.
2. `change` event fires → `handleFileUpload(event)`.

#### Method B: Drag-and-Drop (NEW)
1. User drags a `.csv` or video file from file explorer over the browser window.
2. `window dragover` → prevent default, set `dropEffect = 'copy'`, add `drag-over` class to `<body>` which shows a full-window dashed overlay with "Drop file to load telemetry" text.
3. `window dragleave` → remove `drag-over` class.
4. `window drop` → `handleFileDrop(e)`:
   - Extract files from `e.dataTransfer.files`.
   - Route `.csv` files to `handleFileUpload` logic, `video/*` files to `handleVideoUpload` logic.
   - Show success toast: "Loaded <filename>" for CSV or "Processing <filename>..." for video.
   - Remove `drag-over` class.

#### Processing (Shared)
3. **Validation:** File must exist. MIME type checked — reject non-CSV/non-video silently with toast: "Unsupported file type."
4. For large CSVs (>5MB or >50k rows): show progress via PapaParse `step` callback updating a toast: "Parsing row N of M..."
5. `FileReader.readAsText(file)` for CSV. On completion:
   - Store raw text in `telemetryCsvText` (for download).
   - Show `download-csv-btn`.
   - `Papa.parse(file, { header: true, dynamicTyping: true, skipEmptyLines: true, ... })`.
6. PapaParse `complete` callback → `processIncomingCSV(data)`.
7. Column auto-detection: Scan first row keys for lat/lon/speed/time keywords.
8. **Row processing loop:**
   - Skip rows with NaN lat/lon.
   - Parse speed, auto-detect m/s→km/h conversion by checking value for "km/h" string in original.
   - Parse timestamp: ISO date, epoch ms (>100000), or fallback row-index * 0.1.
   - Compute cumulative Haversine distance.
   - Build normalized `TelemetryPoint`.
9. `rawData` populated → `calculateDefaultSingleLap()` → `updateUIState()` → `updateVisualization()`.
10. Show success toast: "Loaded N data points across M laps."

### Flow 2: Smart Data Ingestion (Video MP4 Upload + Extraction)

1. User clicks "Add Video" → hidden `<input type="file" accept="video/*">` triggers file picker.
2. `change` event → `handleVideoUpload(event)`.
3. Button shows spinner with filename truncation.
4. `URL.createObjectURL(file)` → `videoBlobUrl`.
5. **If `extractMetadataEnabled` AND no CSV already loaded:**
   - `extractTelemetryFromVideo(file)`:
     - MP4Box async streaming append of file chunks.
     - `onReady`: Find GPMD track, set extraction options, start.
     - `onSamples`: Parse each sample via `parseGPMD()` → fill `sensors` object.
     - On complete: `buildCombinedTelemetryCsv(sensors, fileName)` → CSV text matching exact 27-column schema.
     - Reparse CSV with PapaParse → `processIncomingCSV()`.
6. `finally`: Reset button state.
7. If `lapsData.length > 0`: `updateVisualization()`.
8. **Error states (all use toast notification, never `alert()`):**
   - No GPMD track → toast error: "No GPMD telemetry track found in this video. Upload a CSV instead."
   - MP4Box unavailable → toast error: "MP4Box library failed to load. Try reloading the page."
   - Video codec unsupported → toast warning: "Video codec not supported in this browser." + `has-error` overlay on video card.
   - Extraction success → toast success: "Telemetry extracted: N data points."

### Flow 3: Track & Lap Initialization (Gate Drawing)

1. Map renders GPS polyline from all laps (or single lap).
2. **Gate drawing:**
   - User clicks "Set Gate" → `toggleGateDrawingMode()` → `isDrawingGate = true`, `stepText` shows START prompt + mode indicator badge appears on map: "Gate Drawing Mode — Esc to cancel".
   - User moves mouse → ghost dashed line from first point to cursor.
   - User clicks first point → `gatePoints[0]` set, `stepText` shows END prompt.
   - User clicks second point → `gatePoints[1]` set, `isDrawingGate = false`, solid red gate line drawn.
   - **Esc key** at any time during drawing → cancel, reset to default, toast: "Gate drawing cancelled."
   - **After gate is set:** Both endpoints have draggable handles (Leaflet `L.circleMarker` with `draggable: true`). Dragging an endpoint updates `gatePoints` and recalculates laps in real-time. Show "drag to adjust" hint on hover.
3. **Lap detection:**
   - `calculateLapsWithGate()` iterates all adjacent GPS point pairs.
   - For each pair, test intersection with gate line using `intersects()`.
   - Minimum 50-point gap between crossings (noise filter).
   - Each detected segment becomes a Lap object with normalized distance and duration.
4. **Results:**
   - Timing tower (lap list in sidebar) populates with lap times.
   - "All Laps" checked by default → map shows all lap polylines in different colors.
5. **Reset:** User clicks "Reset" → `resetGate()` → gate removed, single lap restored.

### Flow 4: Lap Selection, Statistics & Comparison (Enhanced)

1. User sees lap list in sidebar with checkboxes + color dots + lap times.
2. **"All Laps"** checkbox at top. When checked, all individual laps unchecked.
3. Toggling any individual lap unchecks "All Laps".
4. Unchecking last individual lap auto-rechecks "All Laps".
5. **Sort by Time:** Toggle → lap list sorts ascending by duration. Fastest lap gets green trophy icon.
6. **Filtering effect:** Only checked laps render on map, in charts, and as video monitors.

#### Lap Statistics Panel (NEW)
- Below the lap list, show a **Statistics Panel** with a collapsible header "Lap Statistics".
- For each lap, display in a compact table:
  - Lap number, time, avg speed, max speed, min speed, max lateral G, distance.
- **Best lap** row is highlighted with green accent. Delta column shows `+0.000` for best, `+1.234` for others.
- Sortable by clicking column headers (toggle ascending/descending).
- Data computed on-the-fly from `lapsData` (avg = total/timed points, max = Math.max of speed array, etc.).

#### Reference Lap & Delta Display (NEW)
- The fastest lap is **auto-marked as reference** (purple trace, `#b138ff` per color palette).
- In charts: other laps show as **semi-transparent** traces with a **delta overlay** (shaded region between reference and selected lap).
- In lap list: each non-reference lap shows delta time in red (`+1.234s`) or green (`-0.500s` — though fastest is ref so all deltas are positive).
- User can **manually set reference lap** by right-clicking a lap in the list → "Set as Reference" context menu item.

#### Sector Breakdown (NEW)
- Each lap is auto-divided into **3 equal-distance sectors** (33%, 66%, 100% of lap distance).
- Sector times displayed in lap list as expandable sub-rows: `S1 12.340 | S2 13.100 | S3 12.890`.
- **Best sector** across all laps is highlighted in purple (F1-style).
- Sector coloring on map: track polyline segments colored by sector (green/white/purple for best/neutral/worst relative to reference).

### Flow 5: Analysis, Data Smoothing & Multi-Chart Views

#### Core Analysis Charts (Enhanced)
1. Smoothing slider (0-20) controls moving average window.
2. Changing slider → render all charts with smoothed data. Use `Plotly.react()` instead of `Plotly.newPlot()` for performance (updates in place, no full re-render).
3. Speed curves become progressively smoother as window increases.

#### Additional Chart Types (NEW)
Beyond the 2 core speed charts, add these optional charts (collapsible sections below the primary charts):

4. **Altitude Chart:**
   - Y-axis: Altitude (m), X-axis: Lap Distance (m).
   - Shows elevation profile of each selected lap.
   - Useful for analyzing uphill/downhill sections.

5. **Lateral G Chart:**
   - Y-axis: Lateral Acceleration (G), X-axis: Lap Distance (m).
   - Computed from GPS path curvature and speed, or from raw ACCL/GRAV data if available.
   - Positive = left turns, Negative = right turns.

6. **Longitudinal G Chart:**
   - Y-axis: Longitudinal Acceleration (G), X-axis: Lap Distance (m).
   - Positive = acceleration, Negative = braking.
   - Helps identify braking points and corner exit traction.

7. **G-G Diagram (Friction Circle):**
   - Scatter plot: X = Lateral G, Y = Longitudinal G.
   - Each point colored by speed (warm = fast, cool = slow).
   - Circle overlay at 1.0G radius as reference.
   - Shows tire grip usage and driving smoothness.

#### Crosshair & Interaction Improvements (NEW)
8. **Vertical crosshair line** spanning all chart traces on mouse hover and during playback. Shows a unified tooltip with: Lap name, Speed, Distance, Time, Lat/Lon, G-forces.
9. **Clickable legend** on each chart to toggle individual lap visibility (bidirectional sync with sidebar checkboxes).
10. **Chart snapshot export:** Right-click chart → "Export as PNG" context menu or button in chart header. Uses `Plotly.toImage()` to download.

#### Zoom Sync (Existing)
11. Zoom-synced charts: Zooming Speed-vs-Distance auto-zooms Speed-vs-Time and vice versa.
12. Cross-domain zoom sync extended to additional charts (altitude, G-force) using the same first-lap mapping.
13. `isRelayouting` flag prevents infinite loop.

### Flow 6: Playback & Sync

1. **Playback bar** appears at bottom after data loaded.
2. **Keyboard shortcuts (global):**
   - `Space` → toggle play/pause
   - `←` / `→` → step frame -0.04s / +0.04s
   - `Shift+←` / `Shift+→` → step -0.5s / +0.5s (coarse step)
   - `Home` / `End` → seek to start / end
   - `F` → fullscreen map
   - `Esc` → cancel gate drawing / exit fullscreen
   - `S` → toggle sidebar
   - `R` → reset gate
   - `M` → toggle mute on all videos
   - `1`-`4` → set playback speed (1=0.25x, 2=0.5x, 3=1x, 4=2x)
   - **All shortcuts disabled when focus is on an input/select/textarea element.**
3. **Mode selection:** Distance (default) or Time.
   - Distance: scrubber units are meters, `distanceSimSpeed = 25 m/s` used for playback rate.
   - Time: scrubber units are seconds, video plays at `baseSpeed`.
4. **Play/Pause:** rAF loop advances scrubber position.
   - Distance mode: `currentValue += distanceSimSpeed * baseSpeed * dt`
   - Time mode: `currentValue += baseSpeed * dt`
   - **Delta time cap:** `dt = Math.min(dt, 0.1)` to prevent massive jumps after tab switch or UI blocking.
   - **Visibility detection:** If `document.hidden === true`, pause playback automatically. Resume when visible.
   - At end → auto-loop to 0 (or to marker A if A-B loop enabled).
5. **A-B Loop (NEW):**
   - User clicks "Set A" at current scrubber position → marker A placed (visual mark on scrubber track).
   - User clicks "Set B" → marker B placed.
   - Click "Loop A↔B" toggle → playback loops between marker A and marker B instead of full session.
   - `playbackState.loopMode`: `'full'` (default) or `'ab'`.
   - When `loopMode === 'ab'` and `currentValue >= markerB`: reset to markerA.
   - Visual indicator on scrubber rail: two vertical tick marks with "A" and "B" labels, shaded region between them.
6. **Scrubber:** Drag → `manualSeek()` → immediate sync. `mousedown` → pause.
7. **Frame stepping:** `-0.04s` / `+0.04s` buttons for precise analysis.
8. **Playback speed:** 0.25x to 8x.
9. **Video HUD Overlay (NEW):**
   - On the primary video player, overlay a translucent telemetry dashboard showing:
     - Speed (large, km/h)
     - Current lap time
     - Lateral G (bar or number)
     - Longitudinal G (bar or number)
     - Lap number
   - Styled like a racing game HUD: bottom-aligned, semi-transparent black background, JetBrains Mono font, brand-red accent for speed value.
   - Toggleable via a small button on the video card.
10. **Synchronization** (per frame):
    - `syncVideosToStateTimeline()`:
      - **Performance:** Use pre-computed binary search lookup tables per lap (distance→time, time→distance) instead of linear `find()`.
      - Compute `targetFileTime` for each video from current scrubber position using lookup tables.
      - Seek video if drift > threshold.
      - Update `currentPositionMarker` on map.
      - Update lap start markers (circleMarkers).
      - Update live telemetry panel (speed, time, lap number).
      - Update video HUD overlay.
      - Restyle chart cursor traces (colored markers at each lap's current position).
      - **Crosshair line:** Restyle a vertical line trace on all charts showing current playback position.
    - `updateVideoPlaybackRates()`:
      - In time mode: video `playbackRate = baseSpeed`.
      - In distance mode: compute rate from `distanceSimSpeed / actualSpeedMS`, clamped.

### Flow 7: Dark/Light Theme

1. Button click → `toggleTheme()`.
2. `document.documentElement.classList.toggle('dark')`.
3. Map tiles swap: CartoDB Dark Matter ↔ OpenStreetMap standard.
4. All Tailwind `dark:` classes activate/deactivate.
5. Charts re-render with new color scheme.
6. Auto-detects `prefers-color-scheme: dark` on initial load.

### Flow 8: Video Management

1. **Video upload** → `videoBlobUrl` created. **Revoke old `videoBlobUrl`** before creating new one to prevent memory leak.
2. **Primary video player (NEW approach):**
   - Instead of N copies of the same video, show **one primary video player** with a color-coded border indicating which lap is currently active.
   - Below the primary video, show **small thumbnail cards** for each selected lap (max 4) showing just the lap color dot, lap number, and current position indicator.
   - Clicking a thumbnail card switches the primary video's sync target to that lap.
   - This avoids the confusing UX of 4 identical videos at different positions.
3. **Video HUD overlay** on primary player (see Flow 6 item 9): telemetry dashboard overlaid on video.
4. **Size slider** (200-800px) controls primary player width (16:9 aspect).
5. **Error overlay:** If video codec unsupported (e.g., HEVC on some browsers), `has-error` class shows warning icon.
6. **Clicking charts** seeks video to that point.
7. **Memory cleanup:** When uploading a new video or clearing session, call `URL.revokeObjectURL(videoBlobUrl)`, pause and remove all `<video>` elements.

---

## 10. Design System & UI/UX Rules

### Layout Hierarchy

#### Core Principle: All panels are resizable and hidable

Every major content panel (sidebar, map, charts container, video player, individual chart cards) has:
- A **resize handle** (draggable divider) to adjust its size relative to adjacent panels.
- A **hide/show toggle** (button or keyboard shortcut) to collapse it entirely, with adjacent panels expanding to fill the freed space.

#### Default Layout (Desktop, ≥1200px)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER (h-14, flex-shrink-0)                                                │
│ Logo | [☰] | File Info | Upload CSV | Add Video | [⚙] [🌙]               │
├──────────┬──────────────────────────────────────────────────────────────────┤
│ SIDEBAR  │ MAIN AREA (flex-1, overflow-hidden)                              │
│ (280px)  │ ≡ resize handle (vertical, draggable)                            │
│          │ ┌─────────────────────────┬────────────────────────────────┐     │
│ Collaps. │ │ MAP                     │ CHARTS COLUMN                  │     │
│          │ │ (flexible, default 55%) │ (flexible, default 45%)        │     │
│ ┌──────┐ │ │                         │ ┌────────────────────────┐     │     │
│ │LAPS  │ │ │ Speed heatmap,          │ │ Speed vs Distance [📷] │     │     │
│ │ ▸    │ │ │ click-to-seek,          │ ├────────────────────────┤     │     │
│ │ ▸    │ │ │ gate drawing            │ │ Speed vs Time [📷]     │     │     │
│ │ ▸    │ │ │                         │ ├────────────────────────┤     │     │
│ └──────┘ │ │ [⛶ Fullscreen]          │ │ [ + Add Chart ▾ ]     │     │     │
│          │ └─────────────────────────┴────────────────────────────────┘     │
│          │ ─── resize handle (horizontal, draggable) ────────────────────   │
│          │ ┌────────────────────────────────────────────────────────────┐   │
│          │ │ VIDEO PLAYER + HUD                    [📺 HUD] [🔊] [⛶]   │   │
│          │ │ ┌──────────────────────────────────────────────────────┐   │   │
│          │ │ │  ▶ Video with HUD overlay (16:9, flexible height)    │   │   │
│          │ │ └──────────────────────────────────────────────────────┘   │   │
│          │ │  [● Lap 1] [● Lap 2] [● Lap 3]  ← thumbnail strip     │   │   │
│          │ └────────────────────────────────────────────────────────────┘   │   │
├──────────┴──────────────────────────────────────────────────────────────────┤
│ PLAYBACK BAR (h-16, flex-shrink-0)                                           │
│ ◀◀ ▶️ ▶▶ | ║ [A========●=========B] | Dist|Time | 0.5x                    │
│ ┌─ LIVE TELEMETRY (compact bar, always visible in playback) ────────────┐  │
│ │ 🔴 120.5 km/h  │ ⚡ +0.35 G  │ ⏱ 01:23.456  │ 🏁 Lap 3  │ S2        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Alternative Layouts (User-Configurable)

Users can combine these hide/show states to create focused workspaces:

| Layout Name | Sidebar | Map | Charts | Video | Use Case |
|---|---|---|---|---|---|
| **Full Analysis** | ✓ | ✓ | ✓ | ✓ | Default, all panels visible |
| **Map Focus** | ✗ | ✓ (full width) | ✗ | ✗ | Track inspection, gate drawing |
| **Data Dive** | ✓ | ✗ | ✓ (full width) | ✗ | Lap comparison, chart analysis |
| **Video Review** | ✓ (narrow) | ✗ | ✗ | ✓ (large) | Frame-by-frame video analysis |
| **Minimal** | ✗ | ✓ | ✓ | ✗ | Maximum chart/map space |

- Layout states persist in `localStorage` under `kartdata-layout`.
- Keyboard shortcuts: `M` toggle map, `C` toggle charts, `V` toggle video, `S` toggle sidebar.

#### Resize Handle Design

Each resize handle is:
- A **6px-wide (vertical) or 6px-tall (horizontal)** invisible hit area with a visible 2px accent line centered within it.
- On hover: cursor changes to `col-resize` (vertical) or `row-resize` (horizontal), accent line glows brighter.
- On drag: `mousedown` on handle → track `mousemove` → compute delta → adjust flex proportions → `ResizeObserver` triggers Plotly/Leaflet redraws.
- On release (`mouseup`): save proportion to `localStorage`.
- Minimum panel sizes enforced: sidebar 160px, map 300px, chart column 300px, video height 120px.

#### Hide/Show Toggle Design

Each panel has a small toggle button (chevron icon) at the edge of its resize handle or in its title bar:
- **Sidebar:** Hamburger in header (existing) + chevron on right edge of sidebar.
- **Map:** Chevron `⟩` button on the right edge of the map panel (collapses map, charts expand).
- **Charts:** Chevron `⟨` button on the left edge of the chart column.
- **Video:** Chevron `▽` button on the top edge of the video section or in its title bar.
- **Individual charts:** Chevron `▾` in each chart header to collapse that chart type.

When a panel is hidden, its toggle button remains visible (floating at the edge) so the user can restore it.

### Panel States

| Panel | Empty State | Data Loaded State | Resizable | Hidable | Notes |
|---|---|---|---|---|---|---|
| Header | Logo only | + file-info, lap-count, new-session-btn, sidebar-toggle | No | No | Fixed height h-14 |
| Sidebar | Hidden | Visible (default), collapsible | Yes (width, 160-480px) | Yes (via `S` key or hamburger) | Draggable handle on right edge. Slide-out overlay on mobile. |
| Map | N/A | Visible (default), collapsible | Yes (width, min 300px) | Yes (via `M` key or chevron `⟩` button) | Resize handle on right edge shared with charts column |
| Charts column | N/A | Visible (default), collapsible | Yes (width, min 300px) | Yes (via `C` key or chevron `⟨` button) | Resize handle on left edge shared with map |
| Individual chart cards | N/A | Speed-vs-Dist + Speed-vs-Time shown. Others hidden by default. | Yes (vertical height within stack) | Yes (chevron `▾` in chart header) | "+ Add Chart ▾" dropdown to swap visible types |
| Video section | Hidden | Visible (if video uploaded), collapsible | Yes (height, min 120px) | Yes (via `V` key or chevron `▽` button) | Resize handle on top edge. Height adjusts with content. |
| Playback bar | Hidden | Visible | No | No | Fixed height h-16 |
| Live telemetry | N/A | Embedded in playback bar during playback | No | No | Compact horizontal layout |

### Button States

Every interactive element must implement these states:

| State | Implementation |
|---|---|
| **Default** | As styled per component |
| **Hover** | Light background shift (`hover:bg-gray-100 dark:hover:bg-gray-800`) |
| **Active/Press** | `active:scale-95` transform scale |
| **Disabled** | `disabled:opacity-50`, `cursor-not-allowed`, no hover effect |
| **Loading** | Spinner icon, opacity change, text change (video upload) |

### Animation & Transitions

| Element | Transition | Duration |
|---|---|---|
| All buttons | `transition-all` | 150-200ms |
| Theme toggle | `transition-colors duration-200` | 200ms |
| Map tile swap | Immediate (no transition) | — |
| Video resize | Instant (no transition) | — |
| Sidebar collapse/expand | `transition-all duration-300` | 300ms ease-in-out |
| Panel hide/show (all) | `transition-all duration-250` | 250ms |
| Resize handle hover glow | `transition-opacity` | 100ms |
| Resize drag (panel flex) | None (instant) | — |
| Toast slide-in | `animate-slide-in` (translateX from 100% to 0) | 300ms |
| Drag-over overlay | `transition-opacity` | 200ms |
| Modal/Settings drawer | `transition-transform` | 300ms |

---

## 11. Color Palette (Exact Hex Codes)

| Token | Hex | Usage | Light Mode Equivalent |
|---|---|---|---|
| `--bg-app` | `#0a0d14` | App background (dark mode) | `#f8fafc` (gray-50) |
| `--bg-panel` | `#151924` | Panel/sidebar background | `#ffffff` |
| `--bg-card` | `#1e293b` (gray-800) | Card backgrounds | `#f1f5f9` (gray-100) |
| `--border-subtle` | `#2a3143` | Panel borders | `#e2e8f0` (gray-200) |
| `--border-default` | `#334155` (gray-700) | Default borders (dark) | `#cbd5e1` (gray-300) |
| `--brand-primary` | `#ef4444` (red-500) | Primary accent: buttons, logo "KART" | Same |
| `--brand-hover` | `#dc2626` (red-600) | Button hover | Same |
| `--text-primary` | `#f8fafc` (gray-50) | Primary text (dark) | `#0f172a` (gray-900) |
| `--text-secondary` | `#94a3b8` (gray-400) | Secondary text (dark) | `#475569` (gray-600) |
| `--text-muted` | `#64748b` (gray-500) | Muted labels, icons | Same |
| `--reference-trace` | `#b138ff` | Neon Purple — Reference/leader lap | Same |
| `--positive-delta` | `#e8ff00` or `#22c55e` | Acid Yellow or Green — Faster | Same |
| `--negative-delta` | `#ef4444` | Red — Slower | Same |
| `--chart-grid` | `#334155` (gray-700) | Chart gridlines (dark) | `#e2e8f0` (gray-200) |
| `--chart-text` | `#cbd5e1` (gray-300) | Chart axis/legend text (dark) | `#475569` (gray-600) |
| `--current-marker` | `#facc15` | Yellow — Current position marker on map | Same |
| `--gate-line` | `#ef4444` | Red — Gate line drawn on map | Same |
| `--secondary-traces` | `#00d2ff`, `#ec4899`, `#f97316`, `#3b82f6`, `#22c55e`, etc. | Per-lap trace colors (see COLORS array in Section 4) | Same |

**Strict Rule: No drop shadows.** The only shadow allowed is `shadow-sm` on specific elements (playback bar top shadow, specific buttons, video card labels). The layout must be flat.

---

## 12. Typography

| Role | Font Family | Weight | Size | Color |
|---|---|---|---|---|
| **Data values (speed, time, distances)** | `JetBrains Mono` | 400, 700, 900 | Various | Variable |
| **Headers, section titles** | `Inter` (600+ weight acts as de facto header) | 600, 700, 900 | Various | `text-gray-900 dark:text-white` |
| **Brand wordmark** | `Inter` (900 weight) | Black 900 | `text-xl` | `KART` in brand red, `DATA` in text color |
| **UI controls, labels, body** | `Inter` | 400, 500, 600 | Various | Variable |
| **Subtitle ("Precision Telemetry Suite")** | `Inter` (500 weight) | Medium 500 | `text-xs` | `text-gray-500 dark:text-gray-400` |
| **Section headings (sidebar)** | `Inter` (700 weight, uppercase, tracking-wider) | 700 | `text-[10px]` | `text-gray-400 dark:text-gray-500` |

### Font Loading

Google Fonts loaded via `<link>`:
- `Inter` weights: 400, 500, 600, 700, 900
- `JetBrains Mono` weights: 400, 700

Tailwind configured with:
```js
fontFamily: {
    sans: ['Inter', 'sans-serif'],
    mono: ['JetBrains Mono', 'monospace'],
}
```

---

## 13. Component Behaviors & Responsiveness

### 13.1 Global Viewport
- `<body>`: `h-screen`, `overflow-hidden`, `flex`, `flex-col`.
- Only scrollable containers: `#sidebar-lap-list` (vertical), `#video-grid` (horizontal).
- `html, body`: `-webkit-font-smoothing: antialiased`.

### 13.2 Map
- Height: 100% of parent flex container.
- Cursor: `crosshair` (always, not only during gate drawing).
- Zoom control: bottom-right only. **New: fullscreen button** added next to zoom control.
- **Click-to-seek (NEW):** Clicking anywhere on the track polyline seeks playback to the nearest GPS point on that lap. Uses `manualSeek()` with the corresponding lapDistance or time of the nearest point. Visual feedback: brief pulse animation on clicked location.
- **Speed heatmap (NEW):** Track polyline colored by speed using a gradient: slow (red `#ef4444`) → medium (yellow `#eab308`) → fast (green `#22c55e`). Optionally toggleable via a small button on the map.
- **Gate endpoint handles (NEW):** After gate is set, both endpoints are `L.circleMarker` with `draggable: true`. Dragging recalculates laps in real-time.
- **Gate drawing mode indicator (NEW):** When `isDrawingGate === true`, a badge appears at the top of the map: "Gate Drawing Mode — Click to place points · Esc to cancel".
- Tile layer: CartoDB Dark Matter (dark) / OSM Standard (light).
- Track polylines: weight 4, opacity 0.85.
- Lap start markers: circle markers, radius 5, white border, color fill.
- Current position marker: circle marker, radius 8, white border, yellow fill, `drop-shadow-md` class.
- **GPS coordinates display (NEW):** Small overlay at bottom-left of map showing cursor lat/lon. Updates on mousemove.

### 13.3 Charts (Plotly)
- **4 chart types** (expandable/collapsible sections):
  1. Speed vs Distance (default visible)
  2. Speed vs Time (default visible)
  3. Altitude vs Distance (collapsible, hidden by default)
  4. Lateral G / Longitudinal G vs Distance (collapsible, hidden by default)
  5. G-G Diagram (collapsible, hidden by default)
- All charts have `responsive: true`, `displayModeBar: false`.
- Chart background: transparent.
- Y-axis titles vary per chart type (Speed km/h, Altitude m, G-Force G). All have `fixedrange: false` (zoomable).
- X-axis shared: Distance (m) for all distance-based charts for unified zoom sync.
- Hovermode: `'x unified'` for all synchronized charts (crosshair + tooltip with all traces' values at that x).
- **Vertical crosshair line** on hover and during playback using a shape or scatter trace.
- Legend: horizontal, top. **Clickable legend toggles trace visibility** (bidirectional sync with sidebar lap checkboxes via `plotly_restyle` event).
- Cursor traces: last trace in each chart (markers only), restyled during playback.
- **Chart snapshot export:** Small camera icon button in each chart header → downloads PNG via `Plotly.toImage()`.
- **No plotly.js mode bar** visible (no pan, zoom, download buttons — all controlled via custom UI).

### 13.4 Video Player (Refactored)
- **Single primary video player** (not N copies).
- Aspect ratio: 16:9 (width × 9/16 = height).
- Width controlled by `video-size-slider` (200-800px).
- Color-coded border (2px) matching the **currently selected lap's color**.
- Black background (`bg-black`).
- Rounded corners (`rounded-xl`).
- **Video HUD Overlay:** Bottom-aligned semi-transparent overlay showing:
  - Speed (large, km/h, JetBrains Mono, brand-red)
  - Current lap time (mm:ss.ms)
  - Lateral G / Longitudinal G (small bars or text)
  - Current lap number
  - Toggle visibility via small "HUD" button on video card.
- **Thumbnail cards below primary video:** One small card per selected lap (max 4 if "All Laps" and >4). Each shows: color dot, lap number, current position indicator (time/distance). Click to **switch primary video sync to that lap**.
- Error overlay: if video fails (codec unsupported), shows warning icon + "Playback Error" + "Check codec support."
- Horizontal scrolling container for thumbnail overflow.
- **Revoke old `videoBlobUrl`** on new upload or session clear.

### 13.5 Sidebar & Lap List
- Width: 320px (`w-80`). **Collapsible** via hamburger `sidebar-toggle-btn` in header. When collapsed: width animates to 0, content hidden, map/charts expand to fill space.
- On mobile (<768px): sidebar becomes a **slide-out overlay** triggered by hamburger icon. Overlay has semi-transparent backdrop. Close via tap on backdrop or Esc key.
- Scrollable with custom scrollbar.
- Each lap item: checkbox + color dot + label + duration.
- Hover: light background + border.
- **Right-click context menu on lap item:** "Set as Reference", "Hide Others", "Export Lap Data".
- "All Laps" at top, separator below.
- If `sortLapsByTime`: sorted ascending by duration.
- Best lap (minimum duration): green text with trophy icon.
- **Statistics Panel** (collapsible, below lap list):
  - Table with columns: Lap #, Time, Avg Speed, Max Speed, Min Speed, Max LatG, Distance, Delta to Best.
  - Click column header to sort.
  - Best lap row highlighted green.

### 13.6 Playback Bar
- Fixed at bottom (within flow, not `position: fixed` — it's part of the flex column).
- Backdrop blur: `bg-white/95 dark:bg-gray-900/95 backdrop-blur-md`.
- Top shadow: `shadow-[0_-10px_30px_rgba(0,0,0,0.05)]` dark: `shadow-[0_-10px_30px_rgba(0,0,0,0.2)]`.
- Play button: circular, brand red, white pause/play icon. Hover: scale shadow.
- Mode toggle: segmented control style with Distance (default active) and Time.

### 13.7 Gate Drawing
- Step-by-step text prompts in `stepText` div.
- Three states:
  1. Default: "Draw a gate line across the track on the map to automatically split and calculate laps."
  2. First click: "Click map for Gate START point" (with pulse animation)
  3. Second click pending: "Click map for Gate END point" (with pulse animation)
  4. Gate locked: "Gate Locked! Calculating splits..." (green checkmark, no pulse)
- Ghost line: dashed red during drawing.
- Final gate line: solid red, weight 5.

### 13.8 Responsiveness (Mobile < 768px)
- Layout collapses from side-by-side to stacked.
- **Header:** "Precision Telemetry Suite" subtitle hidden (`hidden md:block`). Hamburger menu icon visible for sidebar toggle.
- **Main area:** Flex column instead of row. Map takes full width, charts stack vertically below.
- **Sidebar:** Slide-out drawer overlay with semi-transparent backdrop. Triggered by hamburger icon in header. Closed by: tap on backdrop, Esc key, or close button in sidebar header. Width: 85vw (max 320px). Contains all sidebar content including statistics panel.
- **Playback bar:** Simplified for mobile. Hide frame-step buttons. Make scrubber taller (easier to touch). Reduce spacing. Mode buttons shown as icons only.
- **Video section:** Primary player takes full width. Thumbnail cards scroll horizontally above or below.
- **Charts:** Stacked vertically (each full width). Collapsible headers to reduce vertical space consumption.
- **Touch gestures (NEW):**
  - Swipe left/right on scrubber → seek forward/backward.
  - Double-tap on map → zoom in.
  - Two-finger pinch on charts → zoom (Plotly built-in support).
  - Tap on video → toggle HUD overlay visibility.
- **Minimal viable mobile layout** ensures all controls are accessible without microscopic targeting. Buttons minimum 44x44px touch target.

### 13.9 Custom Scrollbar
```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
.dark ::-webkit-scrollbar-thumb { background: #334155; }
.dark ::-webkit-scrollbar-thumb:hover { background: #475569; }
```

### 13.10 Custom Range Input
```css
input[type=range] { -webkit-appearance: none; background: transparent; }
input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%;
    background: #ef4444; cursor: pointer; margin-top: -5px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: transform 0.1s;
}
input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.2); }
input[type=range]::-webkit-slider-runnable-track {
    width: 100%; height: 4px; cursor: pointer; background: #e2e8f0; border-radius: 2px;
}
.dark input[type=range]::-webkit-slider-runnable-track { background: #334155; }
```

### 13.12 Toast Notification System (NEW)
- **Container:** Fixed position, bottom-right corner, `z-50`.
- **Toast types:** `success` (green `#22c55e` left border), `error` (red `#ef4444`), `warning` (yellow `#eab308`), `info` (blue `#3b82f6`).
- **Structure per toast:**
  ```html
  <div class="toast toast-{type} flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg mb-2 animate-slide-in" role="alert">
      <i class="ph-fill ph-{icon} text-{type-color} text-lg"></i>
      <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{message}</span>
      <button class="toast-dismiss ml-2 text-gray-400 hover:text-gray-600">×</button>
  </div>
  ```
- **Auto-dismiss:** After 4 seconds (success/info) or 8 seconds (error/warning). Never dismiss if user is hovering.
- **Edge case:** Rapid toasts → queue. Show latest, hide oldest (max 3 visible).
- **Replace all `alert()` calls** with toast notifications (see updated Appendix A).
- **Undo action support:** Certain toasts include an "Undo" button (e.g., "Gate reset" → toast with Undo button that calls `restoreGate()`).

### 13.13 Accessibility Standards (NEW)
- **ARIA labels:** Every icon-only button must have `aria-label`:
  - Theme toggle: `aria-label="Toggle dark mode"`
  - Play/Pause: `aria-label={isPlaying ? 'Pause' : 'Play'}`
  - Frame step: `aria-label="Step backward 0.04s"` / `aria-label="Step forward 0.04s"`
  - Mode toggle: `aria-label="Distance mode"` / `aria-label="Time mode"`
  - Gate buttons: `aria-label="Draw gate line"` / `aria-label="Reset gate"`
  - Sidebar toggle: `aria-label="Toggle sidebar"`
  - Fullscreen: `aria-label="Toggle fullscreen"`
- **Focus indicators:** All interactive elements have visible `:focus-visible` outline (2px solid brand-red offset 2px).
- **Live regions:** `aria-live="polite"` on `stepText` and toast container for screen reader announcements.
- **Color contrast:** All text meets WCAG AA (4.5:1) contrast ratio against its background. Verify with tooling.
- **Keyboard navigable:** All interactive elements reachable via Tab. Tab order follows visual layout (header → sidebar → main → playback bar).
- **Reduced motion:** Respect `prefers-reduced-motion: reduce`. Disable animations (scale, pulse, transitions).

### 13.14 Settings Panel (NEW)
- Triggered by gear icon `⚙` in header.
- Slide-out drawer (similar to mobile sidebar) or modal overlay.
- **Settings:**
  - Default playback speed (dropdown: 0.25x–8x)
  - Default mode (Distance / Time)
  - Default smoothing window (slider 0–20)
  - Map tile preference (Dark / Light / Satellite)
  - Line thickness for charts (slider 1–5)
  - Show/hide individual chart types on startup
  - Video HUD always on (toggle)
  - Auto-loop (toggle, default on)
- **Persistence:** Store settings in `localStorage` under key `kartdata-settings`. Load on boot.
- **Not persisted:** Session data, files, laps — only preferences.

### 13.16 Layout Manager — Resizable & Hidable Panels (NEW)

All major panels implement a uniform resize/hide system. This section specifies the exact behavior.

#### Resize Handle Implementation

Each resize handle is a DOM element with the following structure:
```html
<div class="resize-handle resize-handle--{orientation}" data-panels="{before},{after}" aria-hidden="true">
    <div class="resize-handle__line"></div>
</div>
```

**CSS:**
```css
.resize-handle {
    flex-shrink: 0;
    position: relative;
    z-index: 10;
    transition: background 0.15s;
}
.resize-handle--vertical {
    width: 6px; cursor: col-resize;
    background: transparent;
}
.resize-handle--vertical:hover,
.resize-handle--vertical.is-dragging {
    background: rgba(239, 68, 68, 0.08); /* brand-red at 8% */
}
.resize-handle--vertical .resize-handle__line {
    position: absolute; top: 0; bottom: 0; left: 2px; width: 2px;
    background: #2a3143; /* border-subtle */
    border-radius: 1px; transition: background 0.15s;
}
.resize-handle--vertical:hover .resize-handle__line,
.resize-handle--vertical.is-dragging .resize-handle__line {
    background: #ef4444; /* brand-red */
}
/* Horizontal variant (video resize) */
.resize-handle--horizontal {
    height: 6px; cursor: row-resize;
    background: transparent;
}
.resize-handle--horizontal .resize-handle__line {
    position: absolute; left: 0; right: 0; top: 2px; height: 2px;
    background: #2a3143; border-radius: 1px;
}
.resize-handle--horizontal:hover .resize-handle__line,
.resize-handle--horizontal.is-dragging .resize-handle__line {
    background: #ef4444;
}
```

**JavaScript behavior (`LayoutManager` class):**

```js
class LayoutManager {
    constructor() {
        this.handles = document.querySelectorAll('.resize-handle');
        this.activeHandle = null;
        this.startPos = null;
        this.startSizes = null;
        this.init();
    }
    init() {
        this.handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => this.onDragStart(e, handle));
            // Touch support
            handle.addEventListener('touchstart', (e) => this.onDragStart(e, handle), { passive: true });
        });
        document.addEventListener('mousemove', (e) => this.onDragMove(e));
        document.addEventListener('mouseup', (e) => this.onDragEnd(e));
        document.addEventListener('touchmove', (e) => this.onDragMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this.onDragEnd(e));
    }
    onDragStart(e, handle) {
        e.preventDefault();
        this.activeHandle = handle;
        handle.classList.add('is-dragging');
        document.body.style.cursor = handle.dataset.orientation === 'vertical' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
        const pos = e.type === 'touchstart' ? e.touches[0] : e;
        this.startPos = { x: pos.clientX, y: pos.clientY };
        // Read current sizes of both affected panels
        const [beforeId, afterId] = handle.dataset.panels.split(',');
        const before = document.getElementById(beforeId);
        const after = document.getElementById(afterId);
        const isVert = handle.dataset.orientation === 'vertical';
        this.startSizes = {
            before: isVert ? before.offsetWidth : before.offsetHeight,
            after: isVert ? after.offsetWidth : after.offsetHeight,
            total: (isVert ? before.offsetWidth : before.offsetHeight) +
                   (isVert ? after.offsetWidth : after.offsetHeight) +
                   handle.offsetWidth
        };
    }
    onDragMove(e) {
        if (!this.activeHandle) return;
        e.preventDefault();
        const pos = e.type === 'touchmove' ? e.touches[0] : e;
        const delta = this.activeHandle.dataset.orientation === 'vertical'
            ? pos.clientX - this.startPos.x : pos.clientY - this.startPos.y;
        const [beforeId, afterId] = this.activeHandle.dataset.panels.split(',');
        const before = document.getElementById(beforeId);
        const after = document.getElementById(afterId);
        const minPanel = 160; // minimum px for sidebar, 300 for map/charts
        let newBefore = Math.max(minPanel, Math.min(this.startSizes.total - minPanel, this.startSizes.before + delta));
        let newAfter = this.startSizes.total - newBefore - this.activeHandle.offsetWidth;
        // If both panels have the same min, prefer keeping before >= min
        if (newAfter < minPanel) { newAfter = minPanel; newBefore = this.startSizes.total - newAfter - this.activeHandle.offsetWidth; }
        // Apply as flex-basis
        before.style.flexBasis = newBefore + 'px';
        after.style.flex = '1 1 0';
        // Trigger redraws
        window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: beforeId } }));
        window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: afterId } }));
    }
    onDragEnd() {
        if (!this.activeHandle) return;
        this.activeHandle.classList.remove('is-dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Save layout to localStorage
        this.saveLayout();
        this.activeHandle = null;
    }
    saveLayout() {
        const layout = {};
        document.querySelectorAll('.resize-handle').forEach(h => {
            const [beforeId] = h.dataset.panels.split(',');
            const el = document.getElementById(beforeId);
            if (el) layout[beforeId] = el.style.flexBasis || el.offsetWidth + 'px';
        });
        localStorage.setItem('kartdata-layout', JSON.stringify(layout));
    }
    restoreLayout() {
        const saved = localStorage.getItem('kartdata-layout');
        if (!saved) return;
        try {
            const layout = JSON.parse(saved);
            Object.entries(layout).forEach(([id, size]) => {
                const el = document.getElementById(id);
                if (el) el.style.flexBasis = size;
            });
        } catch(e) { /* ignore corrupt layout */ }
    }
}
```

#### Resize Handle Placements

| Handle ID | Orientation | Panels (before, after) | Min Before | Min After |
|---|---|---|---|---|
| `rh-sidebar` | vertical | `app-sidebar`, `main-area` | 160px | 480px |
| `rh-map-charts` | vertical | `map-panel`, `charts-column` | 300px | 300px |
| `rh-video` | horizontal | `main-content-area`, `video-section` | 200px (main) | 120px |

#### Hide/Show Toggle Implementation

Each hidable panel has a `data-panel` attribute and follows this pattern:

```js
function togglePanel(panelId, show) {
    const panel = document.getElementById(panelId);
    const isCurrentlyVisible = !panel.classList.contains('panel-hidden');
    const willShow = show !== undefined ? show : !isCurrentlyVisible;
    
    if (willShow) {
        panel.classList.remove('panel-hidden');
        panel.querySelector('.panel-toggle-icon')?.classList.remove('is-hidden');
    } else {
        panel.classList.add('panel-hidden');
        panel.querySelector('.panel-toggle-icon')?.classList.add('is-hidden');
    }
    // Dispatch resize event for Plotly/Leaflet
    window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: panelId } }));
    // Save state
    const hiddenState = JSON.parse(localStorage.getItem('kartdata-hidden') || '{}');
    hiddenState[panelId] = !willShow;
    localStorage.setItem('kartdata-hidden', JSON.stringify(hiddenState));
}
```

**CSS for hidden state:**
```css
.panel-hidden {
    flex: 0 0 0 !important;
    overflow: hidden;
    padding: 0 !important;
    margin: 0 !important;
    opacity: 0;
    pointer-events: none;
}
/* The toggle button for a hidden panel floats at the edge */
.panel-toggle-icon.is-hidden {
    /* Floats at the edge of the parent, rotation flipped */
    transform: rotate(180deg);
}
```

#### Panel Hide/Show Triggers

| Panel | Toggle Trigger | Shortcut | Default State |
|---|---|---|---|
| Sidebar | Hamburger in header + chevron on right edge | `S` | Visible |
| Map | Chevron `⟩` on right edge of map panel | `M` | Visible |
| Charts column | Chevron `⟨` on left edge of charts column | `C` | Visible |
| Video section | Chevron `▽` on top edge of video section | `V` | Visible when video loaded |
| Individual chart cards | Chevron `▾` in chart card header | — | Speed-vs-Dist + Speed-vs-Time visible, others hidden |

#### Resize Observer Integration

When a panel is resized or shown/hidden, the following must happen:
1. Dispatch `panelresize` custom event.
2. Listeners on `map-panel` → `map.invalidateSize()`.
3. Listeners on `charts-column` → `Plotly.Plots.resize()` for all visible chart divs.
4. Listeners on `video-section` → no action needed (video fills container naturally).

```js
window.addEventListener('panelresize', (e) => {
    const panel = e.detail.panel;
    if (panel === 'map-panel' || panel === 'main-area') {
        setTimeout(() => map?.invalidateSize(), 50);
    }
    if (panel === 'charts-column' || panel === 'main-area') {
        setTimeout(() => {
            document.querySelectorAll('[id^="chart-"]').forEach(el => {
                if (el.data) Plotly.Plots.resize(el);
            });
        }, 50);
    }
});
```

#### State Persistence

- **Layout sizes** stored in `localStorage['kartdata-layout']` as `{ panelId: "300px", ... }`.
- **Hidden states** stored in `localStorage['kartdata-hidden']` as `{ panelId: true, ... }`.
- Restored on `DOMContentLoaded` after `initMap()` and before first `updateVisualization()`.
- Cleared on "New Session" button.

### 13.15 Bookmark / Marker System (NEW)
- User can place **bookmarks** at interesting points during playback or analysis.
- **How to set:**
  - Click bookmark icon on sidebar or press `B` key → place marker at current playback position.
  - Right-click on chart → "Add Bookmark Here".
- **Bookmark data:**
  ```js
  { id: string, name: string, time: float, distance: float, lapIndex: number, note: string }
  ```
- **Display:**
  - Triangle or pin markers on all chart x-axes at bookmark positions.
  - Pin markers on map at bookmark lat/lon.
  - List in sidebar under "Bookmarks" collapsible section.
  - Click bookmark → seek to that position.
- **Export:** Bookmarks included in "Export Report" as timestamped notes.
- **Max 50 bookmarks** per session. User notified via toast when approaching limit.
```css
.lap-checkbox {
    -webkit-appearance: none; appearance: none; background-color: transparent;
    margin: 0; font: inherit; color: currentColor; width: 1.15em; height: 1.15em;
    border: 2px solid currentColor; border-radius: 0.25em; display: grid; place-content: center;
}
.lap-checkbox::before {
    content: ""; width: 0.65em; height: 0.65em; transform: scale(0);
    transition: 120ms transform ease-in-out; box-shadow: inset 1em 1em white;
    transform-origin: center;
    clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
}
.lap-checkbox:checked { background-color: #ef4444; border-color: #ef4444; }
.lap-checkbox:checked::before { transform: scale(1); }
```

---

## 14. Security & Permissions

Since this is fully client-side, traditional RBAC does not apply.

| Principle | Implementation |
|---|---|
| **Data Privacy** | All data stays in browser memory. No `fetch()` or `XMLHttpRequest` calls to any external server for data processing. The only external calls are CDN script/style loads. |
| **File Validation** | Accept only `.csv` and `video/*` MIME types. Reject executables. PapaParse CSV parsing handles malformed data gracefully (errors logged, partial data used). MP4Box validates GPMD track existence. |
| **Memory Safety** | Large files (CSV with 100k+ rows, long videos) processed in streaming manner: video via `ReadableStream` chunks, CSV via PapaParse streaming mode (if implemented). |
| **No localStorage/sessionStorage** | Not used. All state is in memory. No tracking, no persistence. |
| **Content Security** | All external resources loaded via HTTPS CDNs with Subresource Integrity (SRI) attributes where possible. |

---

## 15. CSS Class & Behavior Registry

All custom CSS classes in the `<style>` block, their selectors, and behaviors.

| Selector | Properties | Purpose |
|---|---|---|
| `body` | `-webkit-font-smoothing: antialiased` | Font rendering |
| `#map` | `height: 100%; width: 100%; z-index: 0; cursor: crosshair` | Map fills parent, crosshair cursor |
| `::-webkit-scrollbar` | `width: 6px; height: 6px` | Custom thin scrollbar |
| `::-webkit-scrollbar-track` | `background: transparent` | Transparent track |
| `::-webkit-scrollbar-thumb` | `background: #cbd5e1; border-radius: 4px` | Gray thumb |
| `::-webkit-scrollbar-thumb:hover` | `background: #94a3b8` | Darker on hover |
| `.dark ::-webkit-scrollbar-thumb` | `background: #334155` | Dark mode thumb |
| `.dark ::-webkit-scrollbar-thumb:hover` | `background: #475569` | Dark mode hover |
| `input[type=range]` | `-webkit-appearance: none; background: transparent` | Reset native range |
| `input[type=range]::-webkit-slider-thumb` | Height 14px, width 14px, red circle, shadow, hover scale 1.2 | Custom thumb |
| `input[type=range]::-webkit-slider-runnable-track` | Full width, 4px height, gray rounded | Custom track |
| `.dark input[type=range]::-webkit-slider-runnable-track` | Dark gray (#334155) | Dark track |
| `.lap-checkbox` | Custom appearance, 1.15em, border 2px, grid centering | Custom checkbox |
| `.lap-checkbox::before` | Clip-path checkmark, scale 0→1 on checked | Checkmark |
| `.lap-checkbox:checked` | Red background + border | Checked state |
| `.no-scrollbar::-webkit-scrollbar` | `display: none` | Hide scrollbar utility |
| `.no-scrollbar` | `-ms-overflow-style: none; scrollbar-width: none` | Firefox/IE hide |
| `.video-card video` | `width: 100%; height: 100%; object-fit: cover; border-radius: 0.5rem; background: #000` | Video fill card |
| `.video-card .error-overlay` | `display: none` | Hidden by default |
| `.video-card.has-error .error-overlay` | `display: flex` | Shown on error |
| `.resize-handle` | `flex-shrink: 0; position: relative; z-index: 10` | Base resize handle |
| `.resize-handle--vertical` | `width: 6px; cursor: col-resize; background: transparent` | Vertical divider |
| `.resize-handle--vertical:hover` | `background: rgba(239,68,68,0.08)` | Hover highlight |
| `.resize-handle__line` | `position: absolute; background: #2a3143; border-radius: 1px` | Visible accent line |
| `.resize-handle--vertical .resize-handle__line` | `top:0; bottom:0; left:2px; width:2px` | Center line within handle |
| `.resize-handle--vertical:hover .resize-handle__line` | `background: #ef4444` | Red line on hover |
| `.resize-handle--horizontal` | `height: 6px; cursor: row-resize` | Horizontal divider |
| `.resize-handle--horizontal .resize-handle__line` | `left:0; right:0; top:2px; height:2px` | Center line |
| `.resize-handle.is-dragging` | Inherits hover styles | Active drag state |
| `.panel-hidden` | `flex: 0 0 0 !important; overflow:hidden; opacity:0; pointer-events:none` | Hidden panel state |

---

## 16. CSV Schema (GX018336_demo_Telemetry.csv Matched)

When extracting from MP4 or exporting, the CSV must have exactly these 27 columns in this order:

| # | Column Name | Type | Example | Source | Notes |
|---|---|---|---|---|---|
| 1 | `cts` | float | `0.000000` | Computed from sample CTS/timescale | Continuous timestamp in ms |
| 2 | `date` | ISO 8601 string | `2026-05-06T18:03:16.900Z` | GPS days+secs → Date | Empty if no GPS yet |
| 3 | `ACCL_x` | float | `36.21` | GPMD ACCL stream | Empty string if no data |
| 4 | `ACCL_y` | float | `2.34` | GPMD ACCL stream | |
| 5 | `ACCL_z` | float | `19.86` | GPMD ACCL stream | |
| 6 | `temp_ACCL` | float | (empty in demo) | TAMP before ACCL block | Empty string if no TAMP |
| 7 | `GYRO_x` | float | `0.014` | GPMD GYRO stream | |
| 8 | `GYRO_y` | float | `-0.111` | GPMD GYRO stream | |
| 9 | `GYRO_z` | float | `0.049` | GPMD GYRO stream | |
| 10 | `temp_GYRO` | float | (empty) | TAMP before GYRO block | |
| 11 | `GRAV_x` | float | `0.438232421875` | GPMD GRAV stream | |
| 12 | `GRAV_y` | float | `7.18701171875` | GPMD GRAV stream | |
| 13 | `GRAV_z` | float | `3.4853515625` | GPMD GRAV stream | |
| 14 | `CORI_w` | float | `0.999969481490524` | GPMD CORI stream | |
| 15 | `CORI_x` | float | `-0.001098666341135899` | GPMD CORI stream | |
| 16 | `CORI_y` | float | `0.00018311105685598315` | GPMD CORI stream | |
| 17 | `CORI_z` | float | `0.0004577776421399579` | GPMD CORI stream | |
| 18 | `GPS (Lat.) [deg]` | float | `25.4913158` | GPMD GPS9 lat/1e7 | |
| 19 | `GPS (Long.) [deg]` | float | `51.457256` | GPMD GPS9 lon/1e7 | |
| 20 | `GPS (Alt.) [m]` | float | `9.548` | GPMD GPS9 alt/1000 | |
| 21 | `GPS (2D) [m/s]` | float | `0.122` | GPMD GPS9 speed2d/1000 | |
| 22 | `GPS (3D) [m/s]` | float | `0.008` | GPMD GPS9 speed3d/1000 | |
| 23 | `GPS (days) [deg]` | float | `9622` | GPMD GPS9 days | Actually unitless (GPS week day count) |
| 24 | `GPS (secs) [s]` | float | `64996.9` | GPMD GPS9 secs/1000 | |
| 25 | `GPS (DOP) [deg]` | float | `1.47` | GPMD GPS9 dop/100 | Dilution of precision |
| 26 | `GPS (fix) [deg]` | float | `3` | GPMD GPS9 fix | Fix type (3 = 3D fix) |
| 27 | `altitude system` | string | `MSLV` | Hardcoded | Mean Sea Level |

### Key CSV Behaviors:
- **Interleaved data:** ACCL/GYRO fire at ~200 Hz, GPS at ~18 Hz, GRAV at ~60 Hz. The CSV merge uses all unique timestamps — a row may have GPS data or ACCL data or both, depending on which sensors fired at that timestamp.
- **Matching key:** `toFixed(6)` on timestamps for map lookup (6 decimal places = microsecond precision).
- **Missing values:** Output as empty string `""` (not `null` or `undefined`).
- **Date computation:** GPS days are GPS week day count (0-6) — actually from GPS epoch (Jan 6, 1980). But in `buildCombinedTelemetryCsv`, the reference date is hardcoded as `2000-01-01`. **This is a known approximation** and may produce incorrect dates. See `line 763-776`.

---

## 17. UX Enhancement Backlog (Phase 1.5 — All Improvements)

All UX improvements identified during analysis of v5, catalogued with implementation priority and cross-reference to plan sections.

### Priority Legend
- **P0 (Critical):** Must-have before initial release — fixes broken UX or adds essential interaction
- **P1 (High):** Significant usability improvement, high-impact / low-effort
- **P2 (Medium):** Important but not blocking
- **P3 (Low):** Nice-to-have, polish

### 17.1 Data Input & Feedback

| # | Improvement | Priority | Effort | Plan Ref | Implementation Notes |
|---|---|---|---|---|---|
| 1 | **Drag-and-drop file upload** | P1 | Medium | Flow 1 | Full-window drop zone with visual overlay. Route CSV/video to existing handlers. |
| 2 | **Upload progress indicator** | P1 | Low | Flow 1 | PapaParse `step` callback for CSV row count. MP4Box chunk tracking for video. Show as toast progress bar. |
| 3 | **Toast notification system** | P0 | Medium | §13.12 | Replace all `alert()`, `console.warn` user-facing messages. 4 types, auto-dismiss, queue. |
| 4 | **Clear session / new session button** | P1 | Low | §5 | Reset all state, revoke blob URLs, return to empty state. Confirmation toast with undo. |
| 5 | **File size validation** | P2 | Low | Flow 1 | Warn via toast if CSV >50MB or video >4GB before attempting parse. |

### 17.2 Navigation & Interaction

| # | Improvement | Priority | Effort | Plan Ref | Implementation Notes |
|---|---|---|---|---|---|
| 6 | **Keyboard shortcuts** | P1 | Low | Flow 6, Appendix E | Space/arrows/Home/End/F/S/R/Esc/M/1-4. Single `keydown` dispatcher. Disabled when input focused. |
| 7 | **Sidebar collapse toggle** | P1 | Low | §13.5 | Hamburger icon in header. Animated width 320px→0. Map/charts expand to fill. Persist preference in localStorage. |
| 8 | **Click map to seek** | P1 | Low | §13.2 | Find nearest GPS point on track to clicked location. Seek to that position. Brief pulse animation. |
| 9 | **Draggable gate endpoints** | P2 | Medium | Flow 3 | After gate set, both endpoints have Leaflet draggable handles. Drag recalculates laps in real-time. |
| 10 | **Fullscreen mode (map)** | P2 | Low | §13.2 | Fullscreen API button on map corner. `F` key shortcut. |
| 11 | **Right-click context menus** | P3 | Medium | Flow 4, §13.5 | Lap list: "Set as Reference", "Hide Others", "Export Lap Data". Charts: "Export as PNG", "Add Bookmark Here". |

### 17.3 Lap Analysis & Data Visualization

| # | Improvement | Priority | Effort | Plan Ref | Implementation Notes |
|---|---|---|---|---|---|
| 12 | **Per-lap statistics panel** | P1 | Medium | Flow 4, §13.5 | Table: time, avg/max/min speed, max lat-G, distance, delta. Sortable columns. Below lap list. |
| 13 | **Reference lap + delta display** | P0 | Medium | Flow 4, §17 | Auto-mark fastest lap. Delta column in lap list. Delta shaded region in charts. Purple reference trace. |
| 14 | **Sector breakdown (3 sectors)** | P2 | Medium | Flow 4 | Equal-distance sectors. Times in expandable sub-rows. Best sector highlighted purple. |
| 15 | **Altitude chart** | P2 | Medium | Flow 5 | Plotly chart: altitude vs distance. Collapsible section below primary charts. |
| 16 | **Lateral G / Longitudinal G charts** | P2 | Medium | Flow 5 | Computed from GPS path + speed. Collapsible sections. |
| 17 | **G-G Diagram (Friction Circle)** | P2 | Medium | Flow 5 | Scatter: Lateral G vs Longitudinal G, color-coded by speed. Circle overlay at 1.0G. |
| 18 | **Data table / raw telemetry view** | P3 | High | — | Sortable, scrollable table of all telemetry points. Motec-style spreadsheet view. Toggleable via tab or button. |

### 17.4 Chart Improvements

| # | Improvement | Priority | Effort | Plan Ref | Implementation Notes |
|---|---|---|---|---|---|
| 19 | **Vertical crosshair across all charts** | P1 | Medium | Flow 5, §13.3 | Unified hover tooltip across all charts. Shows all trace values at cursor x-position. |
| 20 | **Clickable chart legend** | P1 | Low | Flow 5 | Toggle individual lap visibility by clicking legend item. Bidirectional sync with sidebar. |
| 21 | **Chart PNG export** | P2 | Low | Flow 5, §13.3 | Camera icon button in each chart header. Uses `Plotly.toImage()`. |
| 22 | **Use Plotly.react() instead of newPlot()** | P2 | Low | — | Reuse existing plot div instead of destroy/create on each update. Better performance with large datasets. |
| 23 | **ResizeObserver instead of window.resize** | P2 | Low | — | Watch chart container divs for size changes. Trigger `Plotly.Plots.resize()` on observed changes. |

### 17.5 Video Playback

| # | Improvement | Priority | Effort | Plan Ref | Implementation Notes |
|---|---|---|---|---|---|
| 24 | **Single primary video player** | P1 | Medium | Flow 8, §13.4 | Replace N copies of same video with one player + thumbnail card strip. Less confusing, better performance. |
| 25 | **Video HUD overlay** | P2 | Medium | Flow 6, §13.4 | Speed, lap time, G-forces, lap number overlaid on video. Racing dash style. Toggleable. |
| 26 | **Video sync offset control** | P2 | Low | Flow 6 | Slider/buttons for `videoOffsetMs` adjustment. ±10ms increments. Show current offset. |
| 27 | **A-B loop for repeated section analysis** | P2 | Medium | Flow 6 | Set A/B markers on scrubber. Loop between them. Visual shaded region on scrubber rail. |
| 28 | **Blob URL memory management** | P0 | Low | Flow 8 | Revoke old `videoBlobUrl` before creating new one. Clean up on session clear. |
| 29 | **Delta-time cap in playback loop** | P0 | Low | Flow 6 | `dt = Math.min(dt, 0.1)` to prevent massive jumps after tab switch. |

### 17.6 Map

| # | Improvement | Priority | Effort | Plan Ref | Implementation Notes |
|---|---|---|---|---|---|
| 30 | **Speed heatmap on track polyline** | P1 | Medium | §13.2 | Color-code track segments by speed. Red→Yellow→Green gradient. Toggleable. |
| 31 | **Sector coloring on track** | P2 | Medium | Flow 4, §13.2 | Different color per sector (green/white/purple relative to reference). |
| 32 | **GPS coordinate display** | P2 | Low | §13.2 | Small overlay, map bottom-left. Shows cursor lat/lon on mousemove. |
| 33 | **Gate drawing mode badge** | P1 | Low | §13.2 | Badge on map: "Gate Drawing Mode — Click to place points · Esc to cancel". |

### 17.7 Mobile & Responsive

| # | Improvement | Priority | Effort | Plan Ref | Implementation Notes |
|---|---|---|---|---|---|
| 34 | **Mobile sidebar as slide-out drawer** | P2 | Medium | §13.8 | Semi-transparent backdrop, 85vw width (max 320px). Hamburger trigger. |
| 35 | **Touch gestures** | P3 | High | §13.8 | Swipe on scrubber, double-tap map zoom, pinch chart zoom. |
| 36 | **PWA / offline support** | P3 | High | — | manifest.json + service worker for paddock use (unreliable internet). |
| 37 | **Minimum 44x44px touch targets** | P2 | Low | §13.8 | Ensure all interactive elements meet mobile touch target guidelines. |

### 17.8 Accessibility & Polish

| # | Improvement | Priority | Effort | Plan Ref | Implementation Notes |
|---|---|---|---|---|---|
| 38 | **ARIA labels on all icon buttons** | P2 | Low | §13.13 | Descriptive labels for screen readers. |
| 39 | **Visible focus indicators** | P2 | Low | §13.13 | `:focus-visible` outline on all interactive elements. |
| 40 | **Settings/preferences panel** | P2 | Medium | §13.14 | Gear icon → drawer. Default speed, mode, smoothing, map tiles. Persist in localStorage. |
| 41 | **Bookmark / marker system** | P3 | High | §13.15 | `B` key or button to place markers. Display on charts, map, sidebar list. Exportable. |
| 42 | **Respect prefers-reduced-motion** | P3 | Low | §13.13 | Disable animations if user preference set. |
| 43 | **Session report export** | P3 | High | — | Generate HTML/PDF summary with lap times, best lap, chart screenshots, bookmarks. |
| 44 | **Replace `find()` linear scan with binary search** | P2 | Low | Flow 6 | Pre-build distance→time lookup table per lap. O(log n) seek instead of O(n). |

### 17.9 Cross-Cutting Technical Improvements

| # | Improvement | Priority | Effort | Plan Ref | Implementation Notes |
|---|---|---|---|---|---|
| 45 | **URL state persistence** | P3 | High | — | Store session data in IndexedDB. Restore on page reload. Optional: "Resume last session" prompt. |
| 46 | **Module splitting (ES6 modules)** | P2 | Medium | §8 | Split monolithic script into modular files. Use `type="module"`. |
| 47 | **Pub/Sub state manager** | P2 | Medium | §8 | Replace global variable reads with getter/setter + subscription pattern for reactive UI updates. |

---

## Appendix A: Error Handling Matrix

All user-facing feedback uses **toast notifications**. No `alert()` calls.

| Scenario | Error Type | Toast Feedback | Recovery |
|---|---|---|---|
| CSV upload with no GPS columns | Warning | "No GPS data found in CSV. Check column names." | User re-uploads correct CSV |
| CSV upload with all NaN GPS | Warning | "All GPS values are invalid." | User re-uploads correct CSV |
| PapaParse parse error | Warning | "CSV parsed with N errors. Some data may be incomplete." (partial data used) | User checks CSV format |
| MP4Box not loaded | Error | "MP4Box library failed to load. Please reload the page." | User reloads or uses CSV-only |
| No GPMD track in video | Error | "No GPMD telemetry track found in this video. Upload a CSV instead." | User uploads CSV manually |
| GPMD extraction fails | Error | "Telemetry extraction failed. The video may not contain GoPro telemetry data." | User checks video source |
| Extraction success | Success | "Telemetry extracted: N data points." | — |
| Video codec unsupported | Warning | "Video codec not supported in this browser." + error overlay on video card | User uses browser with HEVC support |
| Empty file upload | Info | (no toast — silently ignored) | User picks valid file |
| File too large (>50MB CSV / >4GB video) | Warning | "File is very large. Processing may be slow." | User splits file |
| FileReader error | Error | "Unable to read file. It may be corrupted." | User re-uploads |
| Chart with 0 laps | Info | "No laps selected for display." | Lap selection corrected |
| Gate drawing cancelled (Esc) | Info | "Gate drawing cancelled." | — |
| Gate reset | Info | "Gate reset. Reverted to single lap." + **[Undo]** button in toast | Click Undo to restore |
| Session cleared | Info | "Session cleared." + **[Undo]** button in toast | Click Undo to restore |
| Bookmark limit reached (50) | Warning | "Maximum 50 bookmarks reached. Remove existing bookmarks to add more." | User deletes bookmarks |
| Video upload while CSV being processed | Warning | "Please wait for current processing to complete." | — |

## Appendix B: Keyboard Shortcut Map

| Key | Context | Action | Notes |
|---|---|---|---|
| `Space` | Global | Toggle play/pause | Prevent default (page scroll) |
| `←` | Global | Step frame backward 0.04s | |
| `→` | Global | Step frame forward 0.04s | |
| `Shift+←` | Global | Step backward 0.5s (coarse) | |
| `Shift+→` | Global | Step forward 0.5s (coarse) | |
| `Home` | Global | Seek to start (position 0) | |
| `End` | Global | Seek to end (maxValue) | |
| `F` | Global | Toggle map fullscreen | |
| `S` | Global | Toggle sidebar hide/show | |
| `M` | Global | Toggle map panel hide/show | |
| `Shift+M` | Global | Toggle mute on all videos | |
| `C` | Global | Toggle charts column hide/show | |
| `V` | Global | Toggle video section hide/show | |
| `R` | Global | Reset gate (with confirmation toast + Undo) | |
| `Esc` | Global | Cancel gate drawing / exit fullscreen / close sidebar overlay (mobile) / close settings drawer / restore hidden panel if all hidden | Priority order |
| `B` | Global | Place bookmark at current position | |
| `1` | Global | Set playback speed to 0.25x | |
| `2` | Global | Set playback speed to 0.5x | |
| `3` | Global | Set playback speed to 1.0x | |
| `4` | Global | Set playback speed to 2.0x | |
| `D` | Global | Switch to Distance mode | |
| `T` | Global | Switch to Time mode | |
| `Tab` | Global | Move focus to next interactive element | Visible focus indicator required |
| `Shift+Tab` | Global | Move focus to previous interactive element | |

**Implementation:** Single `document.addEventListener('keydown', handler)`. At top of handler:
```js
const activeTag = document.activeElement?.tagName || '';
if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(activeTag)) return;
```
This prevents shortcuts from firing when user is typing in a field or focused on a control.

**Accessibility:** All keyboard shortcuts are discoverable. Show a "Keyboard Shortcuts" tooltip or modal via `?` key or help icon in header (P3).

## Appendix C: Plotly Configuration

Primary charts use:
```js
const config = { responsive: true, displayModeBar: false };
```
- No mode bar (no manual zoom/pan/download buttons)
- `responsive: true` auto-resizes with container

Layout:
```js
const layoutCommon = {
    margin: { t: 30, r: 20, l: 40, b: 35 },
    hovermode: 'x unified',
    showlegend: true,
    legend: { orientation: 'h', y: 1.15, x: 1, xanchor: 'right', font: { family: 'Inter, sans-serif', size: 11, color: fontColor } },
    plot_bgcolor: 'transparent',
    paper_bgcolor: 'transparent',
    font: { family: 'Inter, sans-serif', color: fontColor },
    yaxis: { title: { text: 'Speed (km/h)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false },
    hoverlabel: { bgcolor: isDarkMode ? '#1e293b' : '#ffffff', font: { color: isDarkMode ? '#f8fafc' : '#0f172a' }, bordercolor: gridColor }
};
```

Additional charts (altitude, lateral G, longitudinal G) follow the same configuration with different `yaxis.title`.

## Appendix D: VideoElement Object Structure

```js
{
    lapIndex: number,       // Index into lapsData
    element: HTMLVideoElement,  // The <video> DOM node
    lapData: Lap,           // Reference to lapsData[lapIndex]
    lastIndex: number       // Last looked-up index for binary-search optimization (currently linear scan)
}
```
**Note:** With the single-primary-player refactor, only one `VideoElement` is actively synced at a time. The rest remain paused at their last position.

## Appendix E: Playback Constants

| Constant | Value | Notes |
|---|---|---|
| `distanceSimSpeed` | `25.0` m/s | ≈ 90 km/h. Used in distance mode to advance scrubber. Hardcoded. |
| `baseSpeed` | `1.0` — selectable: 0.25, 0.5, 1.0, 2.0, 4.0, 8.0 | Multiplier for playback speed |
| `stepFrame delta` | `0.04` seconds | ≈ 25 fps interval |
| `frameSeek threshold (dist)` | `0.15` seconds | If video drift > 0.15s in distance mode, force seek |
| `frameSeek threshold (time)` | `0.35` seconds | If video drift > 0.35s in time mode, force seek |
| `dtCap` | `0.1` seconds | Maximum allowed delta time per frame (prevents tab-switch jumps) |
| `minLapSplitGap` | `50` points | Minimum points between gate crossings to form a lap |
| `minTrailingLapSize` | `10` points | Minimum points for final trailing lap |
| `videoSizeMin/Max` | `200` / `800` pixels | Video card width range |
| `smoothingWindowMin/Max` | `0` / `20` | Moving average half-window range |
| `bookmarkMaxCount` | `50` | Maximum bookmarks per session |
| `toastAutoDismissMs` | `4000` / `8000` | Auto-dismiss time for success/info (4s) and error/warning (8s) |
