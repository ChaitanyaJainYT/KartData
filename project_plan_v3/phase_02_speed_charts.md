# Phase 2: Speed vs Distance & Speed vs Time Charts

**Builds on:** Phase 1 (CSV upload, map rendering, theme toggle)
**Deliverable:** Two Plotly charts (Speed vs Distance, Speed vs Time) added to the right column of the dashboard, with theme-awareness, zoom-sync, smoothing, and chart interaction profiles.

---

## Goal

Add interactive Plotly speed charts that let users analyze speed traces across one or more laps, with synchronized zoom and hover interaction.

---

## Features & Implementation Specs

### 1. Dashboard Layout Update

The dashboard area splits into two columns:
- **Left half** (`#map-panel`): Leaflet map (existing from Phase 1)
- **Right half** (`#charts-column`): Two chart cards stacked vertically

Chart containers:
- `#chart-speed-dist` — Speed (km/h) vs Lap Distance (m)
- `#chart-speed-time` — Speed (km/h) vs Time (s)

```html
<div id="dashboard-content" class="hidden flex-1 flex overflow-hidden">
  <div id="map-panel" class="flex-1 min-w-0">
    <div id="map"></div>
  </div>
  <div id="charts-column" class="flex-1 min-w-0 flex flex-col">
    <div class="flex-1 min-h-0 p-2">
      <div id="chart-speed-dist" class="w-full h-full"></div>
    </div>
    <div class="flex-1 min-h-0 p-2">
      <div id="chart-speed-time" class="w-full h-full"></div>
    </div>
  </div>
</div>
```

### 2. Data Smoothing

- **`smoothData(data, windowSize)`** — moving average:
  - Input: `data: number[]`, `windowSize: integer` (0–20)
  - For each index `i`, average elements from `i - windowSize` to `i + windowSize` inclusive, clamped to array bounds
  - windowSize ≤ 0 → returns copy of data
- **`currentSmoothing`** state variable, initialized to 0
- **Smoothing slider** (`#smoothing-slider`): `<input type="range" min="0" max="20" value="0" step="1">` with value display (`#smoothing-value`)
- On slider `input` event: update `currentSmoothing`, update value display, if `lapsData.length > 0` call `renderCharts(getSelectedLaps())`

### 3. Chart Rendering

- **`renderCharts(lapsToRender)`**:
  - One trace per selected lap, colored by `COLORS[index % 16]`
  - Speed data smoothed via `smoothData(data, currentSmoothing)`
  - Line width: 2.5
  - Cursor tracker trace appended as last trace: `{ x: [], y: [], mode: 'markers', type: 'scatter' }` (empty initially, restyled during playback in later phase)

**Layout (theme-aware):**
- `paper_bgcolor`: `'transparent'`
- `plot_bgcolor`: `'transparent'`
- Font color (`fontColor`): `isDarkMode ? '#cbd5e1' : '#475569'`
- Grid color (`gridColor`): `isDarkMode ? '#334155' : '#e2e8f0'`
- Font: `{ family: 'Inter, sans-serif', size: 11, color: fontColor }`
- Margins: `{ t: 30, r: 20, l: 40, b: 35 }`
- Legend: horizontal, top-right
- `hovermode: 'closest'`
- `hoverlabel.bgcolor`: `isDarkMode ? '#1e293b' : '#ffffff'`
- `hoverlabel.font.color`: `isDarkMode ? '#f8fafc' : '#0f172a'`
- `yaxis.fixedrange: false` (allows zoom)
- `xaxis.fixedrange: false`

**Axis titles:**
- Speed vs Distance: x = "Distance (m)", y = "Speed (km/h)"
- Speed vs Time: x = "Time (s)", y = "Speed (km/h)"

**Axes font:**
```js
const axisFont = { family: 'Inter, sans-serif', size: 11, color: fontColor };
```

### 4. Chart Interaction Profiles

- **`setupInteractionProfiles(id1, id2)`**:
  - Binds `plotly_click` on both charts:
    - Pause playback
    - If `customdata` (rowId) available, get `rawData[rowId]`
    - If mode is `'distance'`, `manualSeek(dataPoint.lapDistance)`
    - If mode is `'time'`, `manualSeek(dataPoint.time - matchedLap[0].time)`
  - Binds `plotly_hover` on both charts:
    - If `customdata` available, move `currentPositionMarker` to `[pt.lat, pt.lon]`

### 5. Zoom Sync Engine

- **`setupZoomSyncEngine(id1, id2)`**:
  - Binds `plotly_relayout` events on both charts
  - `isRelayouting` flag prevents infinite loop
  - When one chart zooms, synchronize the other:
    - **Y-axis**: Directly copy `yaxis.range[0/1]` or `yaxis.autorange`
    - **X-axis**: Map distance ↔ time using the first lap (index 0) as reference:
      - Dist → time: find point with matching `lapDistance`, use its relative time
      - Time → dist: find point with matching relative time, use its `lapDistance`
  - Guard: if `isRelayouting`, return early
  - Clamp zoom beyond data bounds to min/max

### 6. Window Resize Handling

- On `window resize`: `Plotly.Plots.resize('chart-speed-dist'); Plotly.Plots.resize('chart-speed-time')`
- Only fires when `lapsData.length > 0`

### 7. Theme-Aware Chart Re-render

- `toggleTheme()` (from Phase 1) extended: after tile swap, if `lapsData.length > 0`, call `updateVisualization()` → charts re-render with new `fontColor` and `gridColor`

### 8. Get Selected Laps

- **`getSelectedLaps()`**:
  - If `selectedLapIndices.has('all')`, return all laps
  - Else iterate `selectedLapIndices`, push matching lap
  - Filter out undefined indices

---

## Libraries Added

| Library | Version | Purpose |
|---------|---------|---------|
| Plotly.js | 2.27.0 | Interactive charts |

---

## File Changes from Phase 1

- **New chart containers** in `#dashboard-content`
- **Smoothing slider** in sidebar
- **Plotly CDN** added to `<head>`
- **Chart resize** on window resize
- **`updateVisualization()`** now calls `renderCharts()`, `renderMap()`, `updateScrubberScalingBoundaries()`

---

## Testing Instructions

1. **Charts appear**: With Phase 1 working, upload a CSV → verify two charts appear in the right column (Speed vs Distance above, Speed vs Time below) with speed traces.
2. **Hover tooltip**: Hover over any trace → tooltip shows speed value at that point.
3. **Zoom sync**: Zoom into a region on Speed vs Distance chart → Speed vs Time chart zooms to the corresponding region. Verify cross-domain mapping using the first lap as reference.
4. **Dark mode toggle**: Click theme toggle → chart colors update (axes, grid, legend, tooltip backgrounds). Verify readability in both modes.
5. **Smoothing**: Drag the smoothing slider → charts re-render with progressively smoother speed traces. At window 20, traces should be heavily smoothed.
6. **Resize**: Resize the browser window → both charts resize proportionally.
7. **No crash on no data**: Open page with no CSV loaded → no charts rendered, no errors in console.
