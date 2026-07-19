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
- 17. Future / Phase 2 Features (Not in v5, from earlier plans)

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
      - layout.js      # Sidebar, panels, drag/drop layout manager (future)
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

1. User clicks "Upload CSV" button → hidden `<input type="file" accept=".csv">` triggers file picker.
2. `change` event fires → `handleFileUpload(event)`.
3. **Validation:** File must exist. MIME type is not explicitly checked by v5 but CSV files are expected.
4. `FileReader` reads file as text. On completion:
   - Store raw text in `telemetryCsvText` (for download).
   - Show `download-csv-btn`.
   - `Papa.parse(file, { header: true, dynamicTyping: true, skipEmptyLines: true })`.
5. PapaParse `complete` callback → `processIncomingCSV(data)`.
6. Column auto-detection: Scan first row keys for lat/lon/speed/time keywords.
7. **Row processing loop:**
   - Skip rows with NaN lat/lon.
   - Parse speed, auto-detect m/s→km/h conversion by checking value for "km/h" string in original.
   - Parse timestamp: ISO date, epoch ms (>100000), or fallback row-index * 0.1.
   - Compute cumulative Haversine distance.
   - Build normalized `TelemetryPoint`.
8. `rawData` populated → `calculateDefaultSingleLap()` → `updateUIState()` → `updateVisualization()`.

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
8. **Error states:**
   - No GPMD track → alert "No GPMD track found."
   - MP4Box unavailable → alert "MP4Box is not available in the browser."
   - Video codec unsupported → `<video>` element triggers `error` → `has-error` overlay shown.

### Flow 3: Track & Lap Initialization (Gate Drawing)

1. Map renders GPS polyline from all laps (or single lap).
2. **Gate drawing:**
   - User clicks "Set Gate" → `toggleGateDrawingMode()` → `isDrawingGate = true`, `stepText` shows START prompt.
   - User moves mouse → ghost dashed line from first point to cursor.
   - User clicks first point → `gatePoints[0]` set, `stepText` shows END prompt.
   - User clicks second point → `gatePoints[1]` set, `isDrawingGate = false`, solid red gate line drawn.
3. **Lap detection:**
   - `calculateLapsWithGate()` iterates all adjacent GPS point pairs.
   - For each pair, test intersection with gate line using `intersects()`.
   - Minimum 50-point gap between crossings (noise filter).
   - Each detected segment becomes a Lap object with normalized distance and duration.
4. **Results:**
   - Timing tower (lap list in sidebar) populates with lap times.
   - "All Laps" checked by default → map shows all lap polylines in different colors.
5. **Reset:** User clicks "Reset" → `resetGate()` → gate removed, single lap restored.

### Flow 4: Lap Selection & Filtering

1. User sees lap list in sidebar with checkboxes + color dots + lap times.
2. **"All Laps"** checkbox at top. When checked, all individual laps unchecked.
3. Toggling any individual lap unchecks "All Laps".
4. Unchecking last individual lap auto-rechecks "All Laps".
5. **Sort by Time:** Toggle → lap list sorts ascending by duration. Fastest lap gets green trophy icon.
6. **Filtering effect:** Only checked laps render on map, in charts, and as video monitors.

### Flow 5: Analysis & Data Smoothing

1. Smoothing slider (0-20) controls moving average window.
2. Changing slider → `renderCharts(getSelectedLaps())` re-renders with smoothed data.
3. Speed curves become progressively smoother as window increases.
4. **Zoom-synced charts:**
   - Zooming on Speed-vs-Distance auto-zooms Speed-vs-Time and vice versa.
   - X-axis mapping is cross-domain: distance values mapped to time values via first lap's data.
   - Y-axis (speed) is directly synchronized.
   - `isRelayouting` flag prevents infinite loop.

### Flow 6: Playback & Sync

1. **Playback bar** appears at bottom after data loaded.
2. **Mode selection:** Distance (default) or Time.
   - Distance: scrubber units are meters, `distanceSimSpeed = 25 m/s` used for playback rate.
   - Time: scrubber units are seconds, video plays at `baseSpeed`.
3. **Play/Pause:** rAF loop advances scrubber position.
   - Distance mode: `currentValue += distanceSimSpeed * baseSpeed * dt`
   - Time mode: `currentValue += baseSpeed * dt`
   - At end → auto-loop to 0.
4. **Scrubber:** Drag → `manualSeek()` → immediate sync. `mousedown` → pause.
5. **Frame stepping:** `-0.04s` / `+0.04s` buttons for precise analysis.
6. **Playback speed:** 0.25x to 8x.
7. **Synchronization** (per frame):
   - `syncVideosToStateTimeline()`:
     - Compute `targetFileTime` for each video from current scrubber position.
     - Seek video if drift > threshold.
     - Update `currentPositionMarker` on map.
     - Update lap start markers (circleMarkers).
     - Update live telemetry panel (speed, time, lap number).
     - Restyle chart cursor traces (colored markers at each lap's current position).
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

1. **Video upload** → `videoBlobUrl` created.
2. **Video cards** render in horizontal scrollable grid below charts.
3. Each selected lap gets one video (max 4 if "All Laps" selected) with color-coded border.
4. Videos are **muted** (no audio expected from GoPro).
5. **Size slider** (200-800px) controls all card widths uniformly (16:9 aspect).
6. **Error overlay:** If video codec unsupported (e.g., HEVC on some browsers), `has-error` class shows warning icon.
7. **Clicking charts** seeks video to that point.

---

## 10. Design System & UI/UX Rules

### Layout Hierarchy

```
┌──────────────────────────────────────────────────────────────┐
│  HEADER (h-16 fixed)                                         │
│  Logo | File Info | Upload Controls | Theme Toggle          │
├──────────┬───────────────────────────────────────────────────┤
│ SIDEBAR  │ MAIN (flex-1)                                     │
│ (w-80)   │ ┌──────────────────────┬──────────────────────┐  │
│          │ │ MAP (50%)            │ CHARTS (50%)         │  │
│ Live     │ │                      │ ┌──────────────────┐ │  │
│ Telemetry│ │ (Leaflet)            │ │ Speed vs Dist    │ │  │
│          │ │                      │ ├──────────────────┤ │  │
│ Gate     │ │                      │ │ Speed vs Time    │ │  │
│ Config   │ │                      │ └──────────────────┘ │  │
│          │ └──────────────────────┴──────────────────────┘  │
│ Lap List │ ┌──────────────────────────────────────────────┐  │
│          │ │ VIDEO SECTION (horizontal scroll, 16:9)      │  │
│          │ └──────────────────────────────────────────────┘  │
├──────────┴───────────────────────────────────────────────────┤
│  PLAYBACK BAR (fixed bottom)                                 │
│  ◀◀ ▶️ ▶▶ | ║ [=========●=========] | Distance | Time | 1x │
└──────────────────────────────────────────────────────────────┘
```

### Panel States

| Panel | Empty State | Data Loaded State | Notes |
|---|---|---|---|
| Header | Logo only | + file-info, lap-count | |
| Main | Empty state (checkered flag + upload prompt) | Map + Charts + Video | Empty state hidden, dashboard shown |
| Sidebar ("app-sidebar") | Hidden | Visible | Only toggleable via data load, not user |
| Playback bar | Hidden | Visible | |
| Lap list | — | Populated with checkboxes | |
| Video section | Hidden | Visible (if video uploaded) | |

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
| Video cards resize | Instant (no transition) | — |

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
- Zoom control: bottom-right only. No other controls.
- Tile layer: CartoDB Dark Matter (dark) / OSM Standard (light).
- Track polylines: weight 4, opacity 0.85.
- Lap start markers: circle markers, radius 5, white border, color fill.
- Current position marker: circle marker, radius 8, white border, yellow fill, `drop-shadow-md` class.

### 13.3 Charts (Plotly)
- Both charts have `responsive: true`, `displayModeBar: false`.
- Chart background: transparent.
- Y-axis: Speed (km/h), `fixedrange: false` (zoomable).
- X-axis: Distance (m) or Time (s).
- Hovermode: `'closest'`.
- Legend: horizontal, top.
- Cursor traces: last trace in each chart (markers only), restyled during playback.
- **No plotly.js mode bar** visible (no pan, zoom, download buttons).

### 13.4 Video Cards
- Aspect ratio: 16:9 (width × 9/16 = height).
- Width controlled by `video-size-slider` (200-800px).
- Color-coded border (2px) matching lap color.
- Black background (`bg-black`).
- Rounded corners (`rounded-xl`).
- Error overlay: if video fails (codec unsupported), shows warning icon + "Playback Error" + "Check codec support."
- Lap label: top-left, black/80 backdrop, white text, color dot, "Lap N".
- Horizontal scrolling container for overflow.
- **Max 4 videos shown** when "All Laps" selected and >4 laps exist. Alert message shown.

### 13.5 Sidebar Lap List
- Scrollable with custom scrollbar.
- Each item: checkbox + color dot + label + duration.
- Hover: light background + border.
- "All Laps" at top, separator below.
- If `sortLapsByTime`: sorted ascending by duration.
- Best lap (minimum duration): green text with trophy icon.

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
- **Header:** "Precision Telemetry Suite" subtitle hidden (`hidden md:block`).
- **Main area:** Flex column instead of row. Map on top, charts below.
- **Sidebar:** Could become a toggleable overlay or tab (current v5 does NOT fully implement mobile — the sidebar is always visible on the left). **TODO:** Implement hamburger menu or tabbed interface for mobile.
- **Video section:** Still horizontal scroll but cards smaller.

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

### 13.11 Custom Checkbox (Lap Selection)
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

## 17. Future / Phase 2 Features (Not in v5, from Earlier Plans)

These are features mentioned in project_plan.md / project_plan_v2.md but not yet implemented in v5. They should be noted for future development.

| Feature | Plan Reference | Description | Priority |
|---|---|---|---|
| **G-G Friction Circle** | plan v1 §4, v2 §4 | `charts` module: Plotly scatter plot of Lateral G vs Longitudinal G showing tire friction ellipse | Medium |
| **Slip Chart (Time Delta)** | plan v1 §5 Flow 3, v2 §5 Flow 3 | Dynamic time delta between reference lap and comparison lap, plotted against distance | Medium |
| **Reference Lap Selection** | plan v1 §5, v2 §3 SessionState | User marks one lap as `isReference`. Comparisons show delta to this lap. | High |
| **Sector Splitting** | plan v1 §3 Lap.sectors | Split laps into 3+ sectors, display sector times in timing tower | Medium |
| **Drag/Drop Layout Manager** | plan v1 §4 ui/, v1 §6, v2 §6 | Panels (map, charts, video, sidebar) must be resizable, movable, show/hide-able via drag handles | Low |
| **Mobile Tabbed Interface** | plan v1 §6, v2 §6 | At <768px, sidebar collapsible into hamburger; main area uses tabs: Video \| Map \| Charts | Low |
| **Progress Bar for Extraction** | plan v1 §5 Flow 1 | When extracting telemetry from video, show progress bar (not just spinner) to indicate completion percentage | Low |
| **Auto-Download CSV After Extraction** | plan v1 §5 Flow 1 step 6 | After MP4 extraction completes, automatically trigger CSV download | Low |
| **Heatmap Overlay on Map** | plan v1 §4 mapping/ | Speed heatmap or G-force heatmap overlay on track map | Low |
| **H.265/HEVC Codec Note** | plan v1 §2 | Explicitly document HEVC requirements and fallback behavior | Info |

---

## Appendix A: Error Handling Matrix

| Scenario | Error Type | User Feedback | Recovery |
|---|---|---|---|
| CSV upload with no GPS columns | Silent | No visible change (rawData not set) | User re-uploads correct CSV |
| CSV upload with all NaN GPS | Silent | No visible change | User re-uploads correct CSV |
| PapaParse parse error | `console.warn` | None (partial data used) | User checks CSV format |
| MP4Box not loaded | `alert()` | "MP4Box is not available in the browser." | User reloads page or uses CSV-only |
| No GPMD track in video | `alert()` | "No GPMD track found." | User uploads CSV manually |
| GPMD extraction fails | `alert()` | "Telemetry extraction failed." | User checks video source |
| Video codec unsupported | Console | Red error overlay on video card | User uses browser with HEVC support |
| Empty file upload | Guard return | No change | User picks valid file |
| FileReader error | `alert()` | "Unable to read CSV file." | User re-uploads |
| Chart with 0 laps | Plotly warning | Empty chart | Lap selection corrected |

## Appendix B: VideoElement Object Structure

```js
{
    lapIndex: number,       // Index into lapsData
    element: HTMLVideoElement,  // The <video> DOM node
    lapData: Lap,           // Reference to lapsData[lapIndex]
    lastIndex: number       // Last looked-up index for binary-search optimization (currently linear scan)
}
```

## Appendix C: Playback Constants

| Constant | Value | Notes |
|---|---|---|
| `distanceSimSpeed` | `25.0` m/s | ≈ 90 km/h. Used in distance mode to advance scrubber. Hardcoded. |
| `baseSpeed` | `1.0` — selectable: 0.25, 0.5, 1.0, 2.0, 4.0, 8.0 | Multiplier for playback speed |
| `stepFrame delta` | `0.04` seconds | ≈ 25 fps interval |
| `frameSeek threshold (dist)` | `0.15` seconds | If video drift > 0.15s in distance mode, force seek |
| `frameSeek threshold (time)` | `0.35` seconds | If video drift > 0.35s in time mode, force seek |
| `minLapSplitGap` | `50` points | Minimum points between gate crossings to form a lap |
| `minTrailingLapSize` | `10` points | Minimum points for final trailing lap |
| `videoSizeMin/Max` | `200` / `800` pixels | Video card width range |
| `smoothingWindowMin/Max` | `0` / `20` | Moving average half-window range |

## Appendix D: Plotly Configuration

Both charts use:
```js
const config = { responsive: true, displayModeBar: false };
```
- No mode bar (no manual zoom/pan/download buttons)
- `responsive: true` auto-resizes with container

Layout:
```js
const layoutCommon = {
    margin: { t: 30, r: 20, l: 40, b: 35 },
    hovermode: 'closest',
    showlegend: true,
    legend: { orientation: 'h', y: 1.15, x: 1, xanchor: 'right', font: { family: 'Inter, sans-serif', size: 11, color: fontColor } },
    plot_bgcolor: 'transparent',
    paper_bgcolor: 'transparent',
    font: { family: 'Inter, sans-serif', color: fontColor },
    yaxis: { title: { text: 'Speed (km/h)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false },
    hoverlabel: { bgcolor: isDarkMode ? '#1e293b' : '#ffffff', font: { color: isDarkMode ? '#f8fafc' : '#0f172a' }, bordercolor: gridColor }
};
```
