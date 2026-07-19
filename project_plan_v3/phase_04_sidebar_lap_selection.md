# Phase 4: Sidebar Lap Selection & Visibility Controls

**Builds on:** Phase 3 (gate lap splitting works, laps exist in memory)
**Deliverable:** A scrollable lap list in the sidebar with custom checkboxes, color dots, lap times, sort-by-time toggle, smoothing slider, and lap selection/deselection that controls which laps appear on the map and in charts.

---

## Goal

Show a lap list in the sidebar with checkboxes, color dots, and lap times. Allow the user to select/deselect which laps display on the map and charts. Sort by time. Provide a data smoothing slider for chart traces.

---

## Features & Implementation Specs

### 1. Sidebar Structure

The sidebar (`#app-sidebar`, `w-80`, hidden until data loaded) contains three sections:

**Live Telemetry panel** (`p-6`):
- Title: "LIVE TELEMETRY" (10px uppercase bold)
- Speed display card: gray-50 background, large `#live-speed` (4xl, JetBrains Mono, km/h suffix), shows `0.0` initially
- Time card (`#live-time`): `00:00.000` format
- Lap card (`#live-lap`): shows `-` initially
- Functional in Phase 5, placeholder for now

**Gate Configuration section** (`p-4`):
- `#stepText` instructional div
- "Set Gate" (`#draw-gate-btn`) and "Reset" (`#clear-gate-btn`) buttons
- Already implemented in Phase 3

**Lap Visibility section** (flex-1, overflow-hidden):
- Header row with "LAP VISIBILITY" title and "Sort by Time" toggle
- Smoothing slider row
- Scrollable lap list (`#sidebar-lap-list`)

### 2. Lap List Rendering

**`renderLapList()`**: Called by `updateUIState()` and whenever sort or selection changes.

1. Clear `#sidebar-lap-list` innerHTML
2. Create "All Laps" filter item at top: value=`'all'`, color `#3b82f6`, no duration, no best indicator
3. Add separator: `<div class="h-px w-full bg-gray-200 dark:bg-gray-800 my-2"></div>`
4. Build `lapsToDisplay` array from `lapsData` with index references
5. If `sortLapsByTime` is true: sort by `lap.duration` ascending (Infinity for undefined durations)
6. Compute `bestTime = Math.min(...lapsData.map(l => l.duration).filter(d => d > 0))`
7. For each lap: create filter item with:
   - `isChecked = selectedLapIndices.has(idx) || selectedLapIndices.has('all')`
   - `isBest = lap.duration === bestTime && lapsData.length > 1`
   - Color from `COLORS[idx % COLORS.length]`
8. Append each to the list

### 3. Filter Item Creation

**`createFilterItem(label, value, checked, color, duration, isBest)`**: Returns a `<label>` DOM element.

HTML structure:
```html
<label class="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700 select-none">
    <input type="checkbox" value="..." class="lap-checkbox focus:ring-0" [checked]>
    <div class="w-3 h-3 rounded-full shadow-sm flex-shrink-0" style="background-color: {color}"></div>
    <span class="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">{label}</span>
    {durationHtml}
</label>
```

Duration HTML (when duration is not null/undefined):
- `formatTime(duration)` in monospace (`.text-xs.font-mono.font-bold`)
- If `isBest`: green text (`text-green-600 dark:text-green-500`) with trophy icon prefix: `<i class="ph-fill ph-trophy text-[10px]"></i>`
- Otherwise: default text color (`text-gray-500 dark:text-gray-400`)

Event binding: checkbox `change` → `handleFilterChange(value, e.target.checked)`

### 4. Custom Checkbox CSS

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

### 5. Filter Selection Logic

**`handleFilterChange(value, isChecked)`**:

- **value === 'all':**
  - If checking: uncheck all individual checkboxes, set `selectedLapIndices = new Set(['all'])`
  - If unchecking: if no other checkboxes remain checked, re-check 'all' to prevent empty state. Otherwise just remove 'all' from the set

- **value !== 'all':**
  - If checking: remove 'all' from set (if present), uncheck 'all' checkbox, add `parseInt(value)` to set
  - If unchecking: remove `parseInt(value)` from set. If set becomes empty after removal, re-add 'all' and re-check 'all' checkbox

- After all changes: call `updateVisualization()`

**`getSelectedLaps()`**:
- If `selectedLapIndices.has('all')`: return all laps
- Else: iterate `selectedLapIndices` (numeric), push matching `{ lap: lapsData[idx], index: idx }`
- Sort result by index ascending
- Filter out undefined indices

### 6. Sort by Time

- Toggle checkbox (`#sort-laps-toggle`): `<input type="checkbox" class="rounded text-brand-600 focus:ring-0 w-3 h-3">`
- Wrapped in label in lap visibility header with "Sort by Time" text (10px uppercase)
- On `change`: set `sortLapsByTime = e.target.checked`, call `renderLapList()`
- When sorted: laps display ascending by duration, fastest lap gets green text + trophy icon

### 7. Smoothing Slider

- **`currentSmoothing`** state variable, initialized to `0`
- Slider `#smoothing-slider`: `<input type="range" min="0" max="20" value="0" step="1">`
- Value display `#smoothing-value`: shows current number
- Icon: `ph-chart-line-up` with title "Data Smoothing"
- On `input` event: update `currentSmoothing`, update display, if `lapsData.length > 0` call `renderCharts(getSelectedLaps())`

### 8. Map Rendering (Enhanced)

**`renderMap(lapsToRender)`**:

1. Clear `polylineLayerGroup` (all polylines)
2. Remove all existing `lapMarkers` from map, reset `lapMarkers = {}`
3. Collect all latlngs for bounds fitting
4. For each selected lap:
   - Create `L.polyline(latlngs, { color: COLORS[index % 16], weight: 4, opacity: 0.85 })` → add to layer group
   - Create start circle marker: `L.circleMarker([startPt.lat, startPt.lon], { radius: 5, color: '#fff', weight: 2, fillColor: COLORS[index], fillOpacity: 1 })` → store in `lapMarkers[index]`
5. **Current position marker** (yellow `#facc15`):
   - If `currentPositionMarker` doesn't exist: create `L.circleMarker(firstPt, { radius: 8, color: '#fff', fillColor: '#facc15', fillOpacity: 1, weight: 2, className: 'drop-shadow-md' })` → add to map
   - Otherwise: update its latlng to the first point

### 9. Visualization Orchestrator

**`updateVisualization()`** (extended from Phase 3):
1. `getSelectedLaps()` → `lapsToRender`
2. `renderCharts(lapsToRender)` — only selected laps get traces
3. `renderMap(lapsToRender)` — only selected laps get polylines
4. `renderVideoMonitorGrid(lapsToRender)` — video cards (Phase 6, no-op until then)
5. `updateScrubberScalingBoundaries(lapsToRender)` — playback bar bounds (Phase 5)

### 10. COLORS Array

```js
const COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16',
    '#f97316', '#6366f1', '#10b981', '#f43f5e', '#8b5cf6', '#d946ef', '#14b8a6', '#eab308'
];
```
Exactly 16 colors; lap index `% 16` selects.

---

## State Variables Added

| Variable | Type | Initial | Description |
|---|---|---|---|
| `selectedLapIndices` | `Set<number\|string>` | `new Set(['all'])` | Which lap indices to display. `'all'` is a sentinel. Modified by `handleFilterChange()` |
| `currentSmoothing` | integer | `0` | Moving average window size (0-20). Set by smoothing slider |
| `sortLapsByTime` | boolean | `false` | Lap list sort toggle. Modified by sort checkbox |
| `currentPositionMarker` | `L.CircleMarker` | `null` | Yellow dot on map showing current playback position. Set by `renderMap()` |

---

## Functions Added

| Function | Purpose |
|---|---|
| `renderLapList()` | Clear and rebuild lap visibility list in sidebar |
| `createFilterItem(label, value, checked, color, duration, isBest)` | Create a single lap checkbox row |
| `handleFilterChange(value, isChecked)` | Complex selection logic with "all" sentinel |
| `getSelectedLaps()` | Convert selected indices to lap objects array |
| `renderMap(lapsToRender)` | Draw colored polylines and markers for selected laps |
| `smoothData(data, windowSize)` | Moving average smoothing utility |
| `updateVisualization()` | Orchestrate all rendering |

---

## CSS Additions

| Selector | Purpose |
|---|---|
| `.lap-checkbox` | Custom checkbox appearance (none, 1.15em, grid centered) |
| `.lap-checkbox::before` | Checkmark via clip-path, scaled 0 → 1 |
| `.lap-checkbox:checked` | Red background + border on check |
| `.no-scrollbar` | Hide scrollbar utility |

---

## Event Listeners Added

| Element ID | Event | Handler |
|---|---|---|
| `smoothing-slider` | `input` | Update `currentSmoothing`, re-render charts |
| `sort-laps-toggle` | `change` | Toggle `sortLapsByTime`, re-render lap list |
| `.lap-checkbox` (dynamic) | `change` | `handleFilterChange(value, checked)` |

---

## Testing Instructions

1. **After Phase 3**, upload a CSV and set a gate → sidebar shows lap list with checkboxes, color dots, and lap times
2. **Individual selection**: Click individual lap checkboxes → only checked laps appear on the map (polylines) and in charts (traces)
3. **"All Laps" toggle**: Click "All Laps" checkbox → all laps toggle on/off; individual checkboxes clear when "All" is checked
4. **Last lap protection**: Uncheck the last remaining individual lap → "All Laps" auto-checks (prevents empty state)
5. **Sort by Time**: Toggle "Sort by Time" → laps reorder by duration ascending; fastest lap gets green text and trophy icon
6. **Smoothing slider**: Move smoothing slider from 0 to 20 → chart traces become progressively smoother via moving average
7. **Color dots**: Each lap has a unique color dot matching the polyline and chart trace color
8. **Lap times**: Each lap shows its formatted time (`M:SS.mmm`); best lap is green with trophy
