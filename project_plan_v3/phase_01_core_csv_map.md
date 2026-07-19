# Phase 1: Core CSV Upload + Leaflet Map + Theme Toggle

**Builds on:** Nothing (first phase)
**Deliverable:** A single HTML page that accepts a CSV file, parses it, renders a GPS track on a Leaflet map, and allows dark/light theme toggling.

---

## Goal

Upload a CSV file containing GPS telemetry, see the track drawn as a polyline on a Leaflet map, and toggle between dark and light themes.

---

## Features & Implementation Specs

### 1. HTML Shell & Empty State

- **Empty state div** (`#empty-state`):
  - Centered vertically and horizontally in the viewport
  - Large checkered flag icon (Phosphor `ph-flag-checkered`)
  - Title: "No Telemetry Loaded"
  - Subtitle: "Upload a CSV or video file to begin analysis"
  - A brand-red upload button matching the header button
- **Dashboard content div** (`#dashboard-content`): hidden initially, shown after data loads

### 2. Header

- Logo: "**KART**" in brand red (`#ef4444`, weight 900) + "**DATA**" in current text color (weight 900) + steering wheel icon (`ph-steering-wheel`)
- File info area (`#file-info`): hidden initially, flex after data load
  - `#filename-display`: truncated filename (CSS `max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`)
  - `#lap-count-display`: e.g. "1 Lap"
- CSV upload: hidden `<input type="file" accept=".csv">` (`#csv-upload`) + brand-red label button
- **Hidden `#app-sidebar`** until data loaded
- **Hidden `#playback-bar`** until data loaded
- Theme toggle button (`#theme-toggle`): shows moon icon in light mode, sun icon in dark mode

### 3. CSV Parsing

- **`handleFileUpload(event)`**:
  - Read file via `FileReader.readAsText()`
  - On load, pass text to `Papa.parse(file, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: processIncomingCSV })`
- **`processIncomingCSV(data)`**:
  - Guard: `if (data.length === 0) return`
  - Auto-detect columns by scanning keys of first row:
    - `latKey`: key containing `"lat"` (case-insensitive)
    - `lonKey`: key containing `"lon"` or `"long"` (case-insensitive)
    - `speedKey`: key containing `"2D"` or `"speed"` or `"3D"` (case-insensitive)
    - `timeKey`: key containing `"date"` or `"cts"` or `"time"` (case-insensitive)
  - Guard: `if (!latKey || !lonKey) return` (no GPS columns found)
  - Iterate rows:
    - Parse `lat`, `lon` as floats; `if (isNaN(lat) || isNaN(lon)) continue`
    - Parse speed, multiply by 3.6 if in m/s (check if source string doesn't contain "km/h")
    - Parse timestamp via `timeKey`; if numeric > 100000 → epoch ms; else ISO parse; fallback `rowIndex * 0.1`
    - Compute cumulative Haversine distance from previous point
    - Push `{ index, lat, lon, speed, speedMS, time, totalDistance, rowId }`
  - Set `rawData = clean`
  - Enable `#draw-gate-btn` (remove disabled)
  - Call `calculateDefaultSingleLap()`

### 4. Lap Calculation

- **`calculateDefaultSingleLap()`**:
  - Guard: `if (rawData.length === 0) return`
  - Map each rawData point, adding `lap: 1`, `lapDistance: p.totalDistance`
  - Set `lapsData[0].duration = last.time - first.time`, `lapsData[0].maxDistance = last.totalDistance`
  - Reset `selectedLapIndices = new Set(['all'])`
  - Call `updateUIState()`, `updateVisualization()`

### 5. UI State Update

- **`updateUIState()`**:
  - `#empty-state.classList.add('hidden')`
  - `#app-sidebar.classList.remove('hidden')`
  - `#dashboard-content.classList.remove('hidden')`
  - `#file-info.classList.remove('hidden'); #file-info.classList.add('flex')`
  - `#playback-bar.classList.remove('hidden')`
  - `#lap-count-display.textContent = lapsData.length + ' Laps'`
  - `setTimeout(150ms)`: `map.invalidateSize()`, fit bounds to rawData

### 6. Leaflet Map

- **`initMap()`**:
  - `L.map('map', { zoomControl: false }).setView([0, 0], 2)`
  - Zoom control to bottom-right: `L.control.zoom({ position: 'bottomright' }).addTo(map)`
  - CartoDB Dark Matter tile layer as default
  - Create `polylineLayerGroup = L.layerGroup().addTo(map)`
  - Bind `mousemove` → `handleMapMouseMove`, `click` → `handleMapClick`

- **`renderMap(lapsToRender)`**:
  - Clear `polylineLayerGroup`
  - For each lap: create `L.polyline(latlngs, { color: COLORS[index % 16], weight: 4, opacity: 0.85 })`, add to layer group

### 7. Dark/Light Theme

- **`toggleTheme()`**:
  - Toggle `isDarkMode`
  - Toggle `document.documentElement.classList.toggle('dark')`
  - Remove old tile layer; add CartoDB Dark Matter (dark) or OSM Standard (light)
  - Re-add `polylineLayerGroup` to map
  - If `lapsData.length > 0`: call `updateVisualization()`

- **Auto-detect** `prefers-color-scheme: dark` on `DOMContentLoaded` → auto-toggle to dark

### 8. Haversine Utility

- **`getDistanceFromLatLonInM(lat1, lon1, lat2, lon2)`**: Standard Haversine formula, Earth radius 6371000m
- **`deg2rad(deg)`**: `deg * Math.PI / 180`
- **`formatTime(seconds)`**: `"M:SS.mmm"` format, null/NaN → `"--:--.---"`

---

## Libraries Used

| Library | Version | Purpose |
|---------|---------|---------|
| Leaflet.js | 1.9.4 | Map rendering |
| CartoDB Dark Matter | — | Dark map tiles |
| OpenStreetMap | — | Light map tiles |
| PapaParse | 5.4.1 | CSV parsing |
| Phosphor Icons | latest | Icons |
| Tailwind CSS | 3.x | Utility CSS |
| Inter + JetBrains Mono | — | Fonts |

---

## Skipped (will be added in later phases)

- Gate drawing and lap splitting
- Sidebar lap list
- Plotly charts
- Video playback
- Playback bar functionality (just show the bar scaffold)
- Resize handles and panel toggle

---

## Testing Instructions

1. **Empty state**: Open the page → verify centered checkered flag icon, "No Telemetry Loaded" title, upload prompt visible. No map, no sidebar, no playback bar.
2. **Upload CSV**: Click "Upload CSV" (header or empty state button) → select `GX018336_demo_Telemetry.csv`.
3. **Post-upload verification**:
   - Empty state disappears
   - Map appears with GPS track polyline (single color)
   - Sidebar (`#app-sidebar`) visible
   - Playback bar (`#playback-bar`) visible
   - Filename shown in header (truncated if long)
   - Lap count shows "1 Lap"
4. **Theme toggle**: Click theme button → map tiles swap (Dark Matter ↔ OSM Standard), page colors change. Click again → reverts.
5. **Missing GPS columns**: Upload a CSV without lat/lon columns → nothing happens (rawData not set, empty state remains).
6. **Invalid file**: Upload a non-CSV file → no crash (file dialog won't show it, or PapaParse returns empty → silent return).
7. **Auto-dark**: Open page in a browser with OS-level dark mode preference → map loads with dark tiles automatically.
