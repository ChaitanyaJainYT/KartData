# Phase 3: Gate Drawing & Lap Splitting

**Builds on:** Phase 1 (map, theme) + Phase 2 (charts)
**Deliverable:** A gate drawing tool on the map that lets users draw a start/finish line to automatically split GPS data into individual laps, with lap markers, step-by-step instructions, and full chart/map visualization updates.

---

## Goal

Enable users to draw a gate line across the track on the map, which splits the single session polyline into individual laps. Each lap gets its own color, trace, and lap marker on the map.

---

## Features & Implementation Specs

### 1. Sidebar Gate Controls

- **`#draw-gate-btn`**: "Set Gate" button in sidebar
  - Disabled (`disabled`) until `rawData.length > 0`
  - Enabled in `processIncomingCSV()` after `rawData` is set
  - Click → calls `toggleGateDrawingMode()`
- **`#clear-gate-btn`**: "Reset" button
  - Click → calls `resetGate()`
- **`#stepText`**: `<div>` displaying instructional text with 4 states:
  1. **Default**: "Draw a gate line across the track on the map to automatically split and calculate laps." (no animation, subdued text)
  2. **START prompt** (pulse animation): `<span class="animate-pulse">Click map for Gate START point</span>` (brand-red text with crosshair icon)
  3. **END prompt** (pulse animation): `<span class="animate-pulse">Click map for Gate END point</span>` (brand-red text with crosshair icon)
  4. **Gate Locked!**: `<span class="text-green-500 font-bold"><i class="ph-fill ph-check-circle"></i> Gate Locked! Calculating splits...</span>` (green checkmark, no pulse)

### 2. Gate Drawing Mode

- **`toggleGateDrawingMode()`**:
  - Guard: if `rawData.length === 0`, return
  - Set `isDrawingGate = true`
  - Clear `gatePoints = []`
  - Remove existing `gateLayer` and `ghostLayer` from map
  - Update `stepText` to START prompt (with pulse)
- **`handleMapMouseMove(e)`**:
  - Guard: only active if `isDrawingGate === true` AND `gatePoints.length === 1`
  - Remove existing `ghostLayer`
  - Create new dashed red polyline from `gatePoints[0]` to `e.latlng`:
    - `{ color: '#ef4444', weight: 3, dashArray: '6,6', opacity: 0.8 }`
- **`handleMapClick(e)`**:
  - Guard: if `!isDrawingGate || rawData.length === 0`, return
  - **First click** (`gatePoints.length === 0`):
    - Push `e.latlng` to `gatePoints`
    - Update `stepText` to END prompt (with pulse)
  - **Second click** (`gatePoints.length === 1`):
    - Push `e.latlng`
    - Set `isDrawingGate = false`
    - Remove `ghostLayer`
    - Create solid red `gateLayer`: `L.polyline([gatePoints[0], gatePoints[1]], { color: '#ef4444', weight: 5, opacity: 1 })` → add to map
    - Update `stepText` to "Gate Locked!" message (green, no pulse)
    - Call `calculateLapsWithGate()`
- **`resetGate()`**:
  - Clear `gatePoints = []`, `isDrawingGate = false`
  - Remove `gateLayer` and `ghostLayer` from map (if they exist)
  - Reset `stepText` to default instruction
  - If `rawData.length > 0`: call `calculateDefaultSingleLap()`

### 3. Intersection Detection

- **`intersects(a, b, c, d, p, q, r, s)`**:
  - Inputs: Segment 1 `(a,b)-(c,d)`, Segment 2 `(p,q)-(r,s)` — all numbers (lon, lat pairs)
  - Output: `boolean` — true if segments intersect (excluding endpoint touching)
  - Standard 2D line intersection using determinant
  - Returns `true` when `0 < lambda < 1` AND `0 < gamma < 1`
  - Edge cases: Parallel → false. Collinear overlapping → false. Zero-length segment → false.

### 4. Lap Splitting

- **`calculateLapsWithGate()`**:
  - Guard: if `gatePoints.length < 2 || rawData.length === 0`, return
  - Loop `i = 1` to `rawData.length - 1`:
    - For each adjacent pair `(rawData[i-1], rawData[i])`, test intersection with gate line via `intersects()`
    - Gate line: gate line from `gatePoints[0]` to `gatePoints[1]`
    - Coordinates passed as `(lon1, lat1, lon2, lat2, gateLon1, gateLat1, gateLon2, gateLat2)`
  - When intersection found:
    - If `i - lastSplitIdx > 50` (minimum 50-point gap to avoid noise):
      - Slice `rawData[lastSplitIdx ... i+1]` as a new lap
      - Set `lastSplitIdx = i`
  - After loop: if trailing points ≥ 10, add final lap `rawData[lastSplitIdx...end]`
  - For each lap:
    - Normalize `lapDistance = p.totalDistance - baseDist`
    - Compute `duration = last.time - first.time`
    - Compute `maxDistance = last.totalDistance - first.totalDistance`
  - Set `selectedLapIndices = new Set(['all'])`
  - Call `updateUIState()`, `updateVisualization()`

**Edge cases:**
- Gate drawn outside track → no intersections → single lap remains
- Only one intersection → single lap (need at least 2 crossings to make a lap)
- Noise gate crossings within 50 points of each other → ignored
- Gate at very first/last segment → very short first/last lap possible
- User clicks same point twice → zero-length gate → `intersects` returns false everywhere → single lap

### 5. Lap Markers on Map

- **`renderMap(lapsToRender)`** (extended from Phase 1):
  - After drawing lap polylines:
  - Remove all existing `lapMarkers` from map, reset `lapMarkers = {}`
  - For each lap: create start circle marker at `[firstPoint.lat, firstPoint.lon]`:
    - `L.circleMarker([startPt.lat, startPt.lon], { radius: 5, color: '#fff', weight: 2, fillColor: COLORS[index], fillOpacity: 1 })`
    - Store in `lapMarkers[index]`
  - **Current position marker** (for playback in later phases):
    - If no `currentPositionMarker`, create yellow dot: `L.circleMarker(firstPt, { radius: 8, color: '#fff', fillColor: '#facc15', fillOpacity: 1, weight: 2 })`
    - Else update latlng

### 6. End-to-End Flow

```
User clicks "Set Gate" → toggleGateDrawingMode()
  → stepText: "Click map for Gate START point" (pulse)
  → User moves mouse → ghost dashed line from first point
  → User clicks on map → gatePoints[0] set
  → stepText: "Click map for Gate END point" (pulse)
  → User moves mouse → ghost line follows cursor
  → User clicks again → gatePoints[1] set
  → isDrawingGate = false
  → Solid red gate line drawn
  → stepText: "Gate Locked! Calculating splits..." (green)
  → calculateLapsWithGate() runs
  → updateUIState() + updateVisualization()
  → Charts re-render with N lap traces
  → Map shows N colored polylines + lap start markers
  → Lap count updates to "N Laps"
```

### 7. Gate State Machine

| State | `isDrawingGate` | `gatePoints.length` | `stepText` | Map Layer |
|-------|----------------|---------------------|------------|-----------|
| Idle (no gate) | `false` | 0 | Default instruction | — |
| Drawing — START | `true` | 0 | START prompt (pulse) | — |
| Drawing — END | `true` | 1 | END prompt (pulse) | Ghost line from point 1 to cursor |
| Locked | `false` | 2 | "Gate Locked!" (green) | Solid red gate line |

---

## Visualization Pipeline (Extended)

- **`updateVisualization()`** orchestrates:
  1. `getSelectedLaps()` → `lapsToRender`
  2. `renderCharts(lapsToRender)` — each lap gets its own color trace
  3. `renderMap(lapsToRender)` — colored polylines + lap start markers
  4. `updateScrubberScalingBoundaries(lapsToRender)` — update playback bar bounds (Phase 2+)

---

## Testing Instructions

1. **Gate button disabled initially**: Open page with no CSV → "Set Gate" button is disabled.
2. **Gate enabled after upload**: Upload CSV → "Set Gate" button becomes enabled.
3. **Drawing mode**: Click "Set Gate" → `stepText` shows START prompt with pulse animation.
4. **Ghost line**: Move mouse over map (before clicking) → no ghost line (only one point placed yet). Click once → END prompt appears. Move mouse → dashed red ghost line appears from the first click point to cursor.
5. **Place gate**: Click a second point on the map → ghost line disappears, solid red gate line appears, stepText shows "Gate Locked!" in green.
6. **Lap splitting**: If the gate crosses the track correctly → multiple laps appear. Verify:
   - Each lap has its own colored polyline on map
   - Lap start markers (white-bordered circles) appear at each lap start
   - Charts (from Phase 2) show one trace per lap with matching colors
   - Lap count updates (e.g., "3 Laps")
7. **Reset gate**: Click "Reset" → gate line removed, single lap restored, stepText returns to default.
8. **Gate outside track**: Draw gate line that does not intersect the GPS track → no lap split occurs (single lap remains, no error).
9. **Re-draw gate**: After reset, draw a new gate line in a different position → laps re-calculate correctly.
10. **Null/edge**: Upload a CSV with very few GPS points → gate may produce zero or one intersection → single lap remains with no crash.
