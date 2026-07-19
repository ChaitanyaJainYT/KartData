# Phase 5: Playback Bar & Scrubber

**Builds on:** Phase 4 (lap selection, charts, map all work)
**Deliverable:** A playback control bar at the bottom of the page with play/pause, frame stepping, a scrubber, distance/time mode toggle, and speed selection. Scrubbing moves the chart cursor and map marker. No video yet.

---

## Goal

Playback controls at the bottom to scrub through telemetry data. No video yet — just move the chart cursor and map marker as the user plays through or manually seeks the data.

---

## Features & Implementation Specs

### 1. Playback Bar HTML Structure

The footer `#playback-bar` (hidden until data loaded, shown by `updateUIState()`):

```html
<footer id="playback-bar" class="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center gap-6 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.2)] z-30 hidden transition-colors flex-shrink-0">
```

Contains:
- **Control buttons** (flex, gap-3):
  - `#prev-frame-btn`: skip-back icon (`ph-fill ph-skip-back`), title "Previous Frame (-0.04s)"
  - `#play-btn`: circular play/pause button (w-12 h-12, brand-red `bg-brand-600`, white text, hover scale/shadow)
  - `#next-frame-btn`: skip-forward icon (`ph-fill ph-skip-forward`), title "Next Frame (+0.04s)"

- **Divider**: 10px wide, 1px gray line (h-10 w-px bg-gray-200)

- **Scrubber column** (flex-1, flex-col):
  - Labels row: `#scrubber-current` (left, current value, gray-900 bg-gray-100 rounded) + `#scrubber-total` (right, max value)
  - `#main-scrubber`: `<input type="range" min="0" max="100" value="0" step="0.01" class="w-full">`

- **Divider**: 10px wide, 1px gray line

- **Mode & Speed controls** (flex, gap-4):
  - Segmented control (bg-gray-100 rounded-lg p-1): `#mode-dist` (active by default, bg-white shadow-sm) + `#mode-time` (inactive)
  - Speed selector (bg-gray-100 rounded-lg border overflow-hidden):
    - Gauge icon on left
    - `<select id="playback-speed">`: options `0.25x`, `0.5x`, `1.0x` (selected), `2.0x`, `4.0x`, `8.0x`

### 2. Playback State Object

```js
let playbackState = {
    isPlaying: false,
    mode: 'distance',
    currentValue: 0,
    maxValue: 0,
    animFrameId: null,
    lastFrameTime: 0,
    baseSpeed: 1.0,
    distanceSimSpeed: 25.0
};
```

| Property | Type | Initial | Description |
|---|---|---|---|
| `isPlaying` | boolean | `false` | Whether the rAF playback loop is running |
| `mode` | `'distance'` \| `'time'` | `'distance'` | Scrubber/chart domain |
| `currentValue` | float | `0` | Current scrubber position in current mode's units |
| `maxValue` | float | `0` | Maximum scrubber position. Set by `updateScrubberScalingBoundaries()` |
| `animFrameId` | integer | `null` | `requestAnimationFrame` ID for playback loop |
| `lastFrameTime` | float | `0` | `performance.now()` timestamp of last frame for delta calculation |
| `baseSpeed` | float | `1.0` | Playback speed multiplier from speed selector |
| `distanceSimSpeed` | float | `25.0` | Simulated speed in m/s for distance mode playback (≈90 km/h). Hardcoded. |

### 3. Playback Engine

**`startPlayback()`**:
- Guard: if already playing, return
- If `currentValue >= maxValue`, reset to 0
- If video elements exist: call `v.element.play()` on all (catch promise rejection silently)
- Set `isPlaying = true`
- Record `lastFrameTime = performance.now()`
- Update play button icon to pause: `<i class="ph-fill ph-pause text-2xl"></i>`
- Call `requestAnimationFrame(playbackLoop)`

**`pausePlayback()`**:
- Set `isPlaying = false`
- Cancel `animFrameId` via `cancelAnimationFrame()`
- Update play button icon to play: `<i class="ph-fill ph-play text-2xl ml-1"></i>`
- If video elements exist: pause all videos

**`togglePlayback()`**:
- If playing → `pausePlayback()`, else → `startPlayback()`

**`playbackLoop()`** (rAF callback):
- Guard: if not playing, return
- Compute delta: `const dt = (performance.now() - lastFrameTime) / 1000`
- Update `lastFrameTime = performance.now()`
- Advance `currentValue`:
  - Time mode: `currentValue += dt * baseSpeed`
  - Distance mode: `currentValue += distanceSimSpeed * baseSpeed * dt`
- If `currentValue > maxValue`, reset to 0, reset all video `lastIndex = 0`
- Update `#main-scrubber.value = currentValue`
- Call `syncVideosToStateTimeline(false)` (only cursor/map part, video seeking not active yet)
- Call `updateVideoPlaybackRates()` (no-op until Phase 6)
- `requestAnimationFrame(playbackLoop)`

### 4. Manual Seeking

**`manualSeek(val)`**:
- Set `playbackState.currentValue = val`
- Reset all video `lastIndex = 0` (prep for Phase 6)
- Call `syncVideosToStateTimeline(true)` with `forceSeek = true`

**`stepFrame(seconds)`**:
- `pausePlayback()`
- `currentValue += seconds`
- Clamp to `[0, maxValue]`
- Update `#main-scrubber.value = currentValue`
- `syncVideosToStateTimeline(true)`
- Called with `-0.04` (prev) or `+0.04` (next). 0.04s ≈ 25fps

### 5. Scrubber Interaction

- **`mousedown`** on `#main-scrubber` → `pausePlayback()` (pause while dragging)
- **`input`** on `#main-scrubber` → `manualSeek(parseFloat(e.target.value))`
- Scrubber `max` set dynamically by `updateScrubberScalingBoundaries()`
- Step: `0.01` for smooth interaction

### 6. Distance/Time Mode Switch

**`setPlaybackMode(mode)`**:
- Set `playbackState.mode = mode`
- Toggle active/inactive classes:
  - Active: `"px-4 py-1.5 text-xs font-bold rounded-md bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm transition-all"`
  - Inactive: `"px-4 py-1.5 text-xs font-bold rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all"`
- Pause playback
- Call `updateScrubberScalingBoundaries(getSelectedLaps())`
- Reset `currentValue = 0`, all `lastIndex = 0`
- `syncVideosToStateTimeline(true)`

**`updateScrubberScalingBoundaries(lapsToRender)`**:
- If no laps, return
- Compute `maxVal`:
  - Distance mode: `Math.max(...lapsToRender.map(l => l.lap.maxDistance))`
  - Time mode: `Math.max(...lapsToRender.map(l => l.lap.duration))`
- Update `#scrubber-total` label:
  - Distance mode: `Math.round(maxVal) + " m"`
  - Time mode: `formatTime(maxVal)`
- Set `playbackState.maxValue = maxVal`
- Set `#main-scrubber.max = maxVal`, `#main-scrubber.value = playbackState.currentValue`

### 7. Timeline Synchronization (Cursor + Map Only)

**`syncVideosToStateTimeline(forceSeek)`**:

Scrubber current label:
- Distance mode: `Math.round(playbackState.currentValue) + " m"`
- Time mode: `formatTime(playbackState.currentValue)`

Video element sync (scaffold for Phase 6, but `videoElements.length` will be 0 until Phase 6):
- Implement the target time computation logic now, even though it won't execute until Phase 6

Map marker and cursor updates (active in this phase):
- For each selected lap, find the matching point at `currentValue`:
  - Distance mode: `lap.find(point => point.lapDistance >= playbackState.currentValue)`
  - Time mode: `lap.find(point => (point.time - lap[0].time) >= playbackState.currentValue)`
- Update lap markers on map: `lapMarkers[index].setLatLng([pt.lat, pt.lon])`
- Update current position marker: `currentPositionMarker.setLatLng([pt.lat, pt.lon])` (only for the first lap)
- Update live telemetry (sidebar Live Telemetry panel):
  - `#live-speed`: `pt.speed.toFixed(1)` (km/h, 1 decimal)
  - `#live-time`: `formatTime(pt.time)`
  - `#live-lap`: `pt.lap` (lap number)
- Restyle chart cursor traces:
  - Build arrays of cursor X, Y, and colors from all selected laps' matching points
  - `Plotly.restyle('chart-speed-dist', { x: [cursorX], y: [cursorY], 'marker.color': [cursorColors] }, [lastTraceIndex])`
  - Same for `chart-speed-time`
  - The cursor trace is the last trace in each chart (empty markers initially, populated during playback)

### 8. Playback Speed Selector

- `#playback-speed` `<select>` with options: 0.25, 0.5, 1 (default), 2, 4, 8
- On `change`: `playbackState.baseSpeed = parseFloat(e.target.value)`, call `updateVideoPlaybackRates()` (no-op in Phase 5)
- Values below 1 slow down playback, above 1 speed it up

### 9. Chart Click Interaction

Chart click handler (`setupInteractionProfiles` from Phase 2):

- On `plotly_click`:
  - Guard: if no event data or no `customdata`, return
  - `pausePlayback()`
  - Get `dataPoint = rawData[point.customdata]`
  - Find matching lap: `lapsData[dataPoint.lap - 1]`
  - If mode is 'distance': `manualSeek(dataPoint.lapDistance)`
  - If mode is 'time': `manualSeek(dataPoint.time - matchedLap[0].time)`

### 10. Live Telemetry Panel

Already present in sidebar HTML from Phase 4 structure. Now functional during playback:

| Element | Format | Source |
|---|---|---|
| `#live-speed` | `pt.speed.toFixed(1)` (e.g. "120.5") | First lap's matching point speed in km/h |
| `#live-time` | `formatTime(pt.time)` (e.g. "1:23.456") | First lap's matching point absolute time |
| `#live-lap` | `pt.lap` (e.g. "3") | First lap's matching point lap number |

Values update on each frame during playback and on manual seek.

---

## State Variables Added

| Variable | Type | Initial | Description |
|---|---|---|---|
| `playbackState` | Object | See above | All playback engine state |
| `currentPositionMarker` | `L.CircleMarker` | `null` | Yellow dot on map (initialized in Phase 4, moved during playback) |

---

## Functions Added

| Function | Purpose |
|---|---|
| `startPlayback()` | Begin rAF playback loop, update play icon |
| `pausePlayback()` | Stop playback, restore play icon |
| `togglePlayback()` | Play ↔ Pause |
| `playbackLoop()` | rAF callback: advance time, sync, re-request frame |
| `manualSeek(val)` | Jump to specific scrubber position |
| `stepFrame(seconds)` | Step forward/backward by fixed delta |
| `setPlaybackMode(mode)` | Switch between distance and time mode |
| `updateScrubberScalingBoundaries(lapsToRender)` | Recalculate scrubber max and labels |
| `syncVideosToStateTimeline(forceSeek)` | Update cursor, markers, live telemetry |
| `updateVideoPlaybackRates()` | Adjust video playback rates (no-op in Phase 5) |

---

## Event Listeners Added

| Element ID | Event | Handler |
|---|---|---|
| `play-btn` | `click` | `togglePlayback()` |
| `prev-frame-btn` | `click` | `() => stepFrame(-0.04)` |
| `next-frame-btn` | `click` | `() => stepFrame(0.04)` |
| `main-scrubber` | `input` | `(e) => manualSeek(parseFloat(e.target.value))` |
| `main-scrubber` | `mousedown` | `() => pausePlayback()` |
| `mode-dist` | `click` | `() => setPlaybackMode('distance')` |
| `mode-time` | `click` | `() => setPlaybackMode('time')` |
| `playback-speed` | `change` | Update `baseSpeed`, call `updateVideoPlaybackRates()` |

---

## Testing Instructions

1. **After Phase 4**, upload a CSV → playback bar visible at bottom of page with all controls
2. **Play**: Click play button → chart cursor (colored markers on each lap's trace) moves along the speed traces; map marker (yellow dot) moves along the track; live telemetry updates (speed, time, lap)
3. **Pause**: Click play button again → playback stops, cursor freezes
4. **Scrubber drag**: Drag the scrubber handle → cursor jumps to corresponding position, map marker updates, telemetry updates
5. **Time mode**: Click "Time" mode button → scrubber unit changes to seconds (formatTime display), mode button becomes active with white background
6. **Speed change**: Change speed selector to 2x → playback advances twice as fast
7. **Frame stepping**: Click prev/next frame buttons → steps by exactly 0.04s (25fps equivalent)
8. **Chart click**: Click on any point on a chart trace → playback pauses, cursor seeks to that point
9. **Playback end**: Playback reaches the end → automatically loops back to start
10. **Loop behavior**: After looping, all cursors continue moving from the beginning
