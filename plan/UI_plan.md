# KartData UI Plan — Lap Analysis Dashboard

## 1. Overall Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  TOP BAR: Upload CSV | Upload Video | Extract CSV | Download CSV│
│           Settings  │  [File Info]                               │
├──────┬──────────────────────────────────────────────────────────┤
│      │  ┌──────────────────────┬──────────────────────────────┐ │
│ LAP  │  │      MAP             │   GRAPHS AREA                │ │
│ TOWER│  │  [Set/Reset Sectors] │                              │ │
│      │  │  [Set/Reset S/F Line]│   • Speed vs Distance        │ │
│ En   │  │                      │   • Speed vs Time            │ │
│ Lap# │  │                      │   • Speed Delta              │ │
│ Time │  │                      │   • Time Delta               │ │
│ Delta│  │                      │   • Distance Delta           │ │
│ S1   │  └──────────────────────┴──────────────────────────────┘ │
│ S2   │  ┌──────────────────────────────────────────────────────┐│
│ S3   │  │            VIDEO GRID                                ││
│ MinSp│  │  [Lap1 vid]  [Lap2 vid]  [Lap3 vid]  [Lap4 vid]     ││
│ AvgSp│  └──────────────────────────────────────────────────────┘│
│ MaxSp├──┴──────────────────────────────────────────────────────────┤
│ Ref  │  PLAYBACK BAR: ◀◀ ▶️▶️ ⏸️ ⏩ [scubber] ⏩ ▶▶                 │
│      │  [Dist/Time] [0.25x] [1x] [2x] [4x] [8x]                │
└──────┴──────────────────────────────────────────────────────────┘
```

## 2. Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-base` | `#0f172a` (dark) / `#f8fafc` (light) | Page background |
| `bg-surface` | `#1e293b` (dark) / `#ffffff` (light) | Cards, sidebar, panels |
| `bg-elevated` | `#334155` (dark) / `#f1f5f9` (light) | Hover states, sub-panels |
| `border-default` | `#334155` (dark) / `#e2e8f0` (light) | Borders, dividers |
| `text-primary` | `#f8fafc` (dark) / `#0f172a` (light) | Primary text |
| `text-secondary` | `#94a3b8` (dark) / `#64748b` (light) | Muted text, labels |
| `accent` | `#ef4444` (red) | Brand color, active states, speed |
| `accent-hover` | `#dc2626` | Hover state for accent |
| `accent-green` | `#22c55e` | Positive delta, sector 1 |
| `accent-purple` | `#a855f7` | Reference lap, sector 3 |
| `accent-amber` | `#f59e0b` | Sector 2 |
| `lap-colors` | `#ef4444, #3b82f6, #22c55e, #f59e0b, #a855f7, #ec4899, #06b6d4, #f97316` | Lap trace colors (cycle) |

## 3. Top Bar

**Layout:** Fixed height (~56px), full width, bg-surface, bottom border.

| Element | Type | Behavior |
|---------|------|----------|
| Logo | `KARTDATA` text + steering-wheel icon | Left-aligned, always visible |
| Upload CSV | Button (brand red) | File picker for `.csv`; triggers PapaParse |
| Upload Video | Button (gray) | File picker for `video/*`; creates HTML5 video elements |
| Extract CSV from Video | Button (gray) | Uses MP4Box.js to extract GPMD telemetry from GoPro MP4 |
| Download CSV | Button (gray) | Exports current telemetry data as CSV file |
| Settings | Gear icon button | Opens settings drawer (right slide-in) |
| File Info | Badge showing filename + lap count | Appears after data is loaded |

## 4. Lap Tower (Left Sidebar)

**Layout:** Fixed width (~320px), full height, scrollable, bg-surface, right border.

### 4.1 Column Headers (Fixed)

Row of column headers pinned at top:
| Column | Width | Content | Notes |
|--------|-------|---------|-------|
| `#` | 36px | Row number | |
| `En` | 32px | Enable/disable checkbox | Toggle lap visibility on charts/map/video |
| `Lap` | 40px | Lap number | |
| `Time` | 64px | Lap time (mm:ss.sss) | |
| `Delta` | 60px | Delta to reference (+0.500) | Green if faster, red if slower |
| `S1` | 50px | Sector 1 time | |
| `S2` | 50px | Sector 2 time | |
| `S3` | 50px | Sector 3 time | |
| `Min` | 46px | Min speed (km/h) | |
| `Avg` | 46px | Avg speed (km/h) | |
| `Max` | 46px | Max speed (km/h) | |
| `Ref` | 36px | Reference lap radio button | Only one can be selected |

### 4.2 Lap Rows

Each lap gets a row with:
- Background color: alternating transparent / `bg-elevated` (subtle)
- Left border: **lap color** strip (4px)
- Text: monospace (`JetBrains Mono`), small (11-12px)
- Best lap: gold trophy icon next to lap number
- Reference lap: purple highlight on row background
- Delta values: green (negative/faster) or red (positive/slower)

### 4.3 Behavior

- **Enable checkbox:** Toggles lap visibility. Unchecked → lap hidden from charts, map, video. Checked → visible.
- **Sort:** Default by lap number ascending. Optional sort-by-time toggle in header.
- **Reference radio:** Sets the reference lap. Changes delta calculations for all laps. Only one lap can be reference.
- **Scroll:** If many laps, column body scrolls independently; headers stay fixed.

## 5. Map Panel (Top-Left of Content Area)

**Layout:** Flex-grow container with Leaflet map filling the space.

### 5.1 Map Controls (Overlay Buttons)

Positioned as a floating toolbar at top-left of the map:

| Button | Icon | Action |
|--------|------|--------|
| Set Start/Finish | 🏁 | Click two points on map to define start/finish gate line; triggers lap recalculation |
| Reset S/F | 🔄 | Clears the gate; reverts to single lap |
| Set Sector 1 | S1 | Click two points to define sector-1 boundary |
| Set Sector 2 | S2 | Click two points to define sector-2 boundary |
| Set Sector 3 | S3 | Click two points to define sector-3 boundary |
| Reset All Sectors | 🔄 | Clears all sector lines |

Sector lines are displayed as dashed colored lines (S1=green, S2=amber, S3=purple) overlaid on the map.

### 5.2 Track Display

- GPS track polyline colored by lap (lap colors)
- **Speed heatmap** along track (red=fast, yellow=medium, green=slow) — toggleable
- **Gate line** (thick red dashed) with draggable endpoints
- **Sector lines** (colored dashed)
- **Position marker** (animated dot) during playback
- Start/finish flag icon at gate location
- Sector markers (S1, S2, S3 badges)

## 6. Graphs Area (Top-Right of Content Area)

**Layout:** Flexbox column with 5 chart cards, each with a header (collapsible) and Plotly chart.

### 6.1 Chart Cards

| Chart | X-axis | Y-axis | Traces | Notes |
|-------|--------|--------|--------|-------|
| Speed vs Distance | Distance (m) | Speed (km/h) | One trace per enabled lap | Primary chart |
| Speed vs Time | Time (s) | Speed (km/h) | One trace per enabled lap | Primary chart |
| Speed Delta | Distance (m) | Speed Delta (km/h) | Compare each lap to reference | Shows where speed differs from reference |
| Time Delta | Distance (m) | Time Delta (s) | Cumulative time difference vs reference | Shows where time is gained/lost |
| Distance Delta | Distance (m) | Distance Delta (m) | Position delta vs reference | Shows relative position changes |

### 6.2 Chart Features

- **Cross-chart zoom sync:** Zooming on one chart applies to all (same x-range)
- **Hover sync:** Hover on one chart shows crosshair on all charts at same x position
- **Click-to-seek:** Click on any chart → seek playback to that distance/time
- **Legend:** Clickable legend toggles individual lap traces (bidirectional with lap tower)
- **Reference trace:** Always shown as purple dashed line
- **Playback cursor:** Vertical line on all charts moves during playback

### 6.3 Chart Configuration

```js
Plotly config: { responsive: true, displayModeBar: false }
Layout: dark theme, transparent bg, unified hovermode
```

## 7. Video Grid

**Layout:** Horizontal scrollable row of video cards below the map/graphs area. Height ~200-250px.

### 7.1 Video Cards

- One card per **enabled** lap
- Each card shows the same source video, but synced to the respective lap's time range
- Card width: 240-320px
- Left border: lap color strip
- Overlay: lap number + lap time in top-left corner

### 7.2 Behavior

- All videos play/pause/seek together (synced)
- During playback, each video shows the segment corresponding to its lap
- Cards are removed when lap is disabled
- "No video loaded" placeholder if no video is uploaded

## 8. Playback Bar (Bottom)

**Layout:** Fixed height (~56px) bar at very bottom, full width, bg-surface, top border.

| Element | Description |
|---------|-------------|
| ⏮️ (Prev Frame) | Step backward 1 frame (~0.04s) |
| ⏪ (Rewind) | Step backward 0.5s |
| ▶️ / ⏸️ (Play/Pause) | Toggle playback; brand-red circle button |
| ⏩ (Fast Forward) | Step forward 0.5s |
| ⏭️ (Next Frame) | Step forward 1 frame |
| **Scrubber** | Range slider showing current position; click/drag to seek |
| Position display | Current time/distance / Total time/distance (mm:ss.sss / 0.0m) |
| **Mode toggle** | Distance / Time — switches scrubber domain |
| **Speed selector** | Buttons: 0.25x, 0.5x, 1x, 2x, 4x, 8x (highlight active) |

### 8.1 Playback Sync Engine

- Uses `requestAnimationFrame` loop
- Advances playing state based on `speed * dt` in either distance or time domain
- Updates in sync:
  - **Scrubber** position
  - **Map marker** (animated dot along GPS track)
  - **Chart cursors** (vertical lines on all charts)
  - **Video elements** (seeks all video cards to correct time)
  - **Live telemetry** (speed, time, lap number in sidebar/overlay)
- Delta time is capped at 0.1s to prevent jumps after tab switch

## 9. Data Flow

```
CSV Upload → PapaParse → rawData[] (TelemetryPoint[])
                                            ↓
                              Haversine distance computation
                                            ↓
                              Gate/Sector lines from map
                                            ↓
                              Lap splitting algorithm
                                            ↓
                              lapsData[] (Lap arrays)
                                            ↓
      ┌─────────────────────────────────────┼──────────────────────────┐
      ↓                                     ↓                          ↓
  Lap Tower (stats per lap)           Charts (traces per lap)    Map (colored tracks)
      ↓                                     ↓                          ↓
  Enable/disable filters             Zoom/hover sync             Gate/sector lines
      ↓                                     ↓                          ↓
  Reference lap selection            Playback cursor             Position marker
```

## 10. Page States

| State | Description |
|-------|-------------|
| **Empty** | No data loaded. Shows logo + "Upload CSV" prompt. Lap tower hidden. |
| **Data Loaded** | CSV parsed, laps split. All panels visible. Default reference = fastest lap. |
| **Playing** | Playback active. All cursors moving, videos playing. |
| **Paused** | Playback paused. Cursors stationary. Can scrub manually. |
| **Gate/Sector Drawing** | Cursor is crosshair. Click on map to place points. Esc to cancel. |

## 11. Implementation Phases

### Phase 1 — HTML Shell & Layout
- [ ] Set up Tailwind config, CDNs, global CSS
- [ ] Build top bar with all buttons
- [ ] Build lap tower header + scrollable body
- [ ] Set up map container with Leaflet
- [ ] Build graphs container (5 chart placeholders)
- [ ] Build video grid section
- [ ] Build playback bar
- [ ] Implement empty state / loaded state toggle

### Phase 2 — CSV Parsing & Data Model
- [ ] PapaParse CSV upload → `rawData[]`
- [ ] Auto-detect columns (lat, lon, speed, time)
- [ ] Compute cumulative Haversine distance
- [ ] Compute default single lap
- [ ] Store lap statistics (time, min/max/avg speed)

### Phase 3 — Lap Tower
- [ ] Render lap rows with all columns
- [ ] Enable/disable checkbox → filter data
- [ ] Reference lap radio → recalculate deltas
- [ ] Sort by lap number / lap time
- [ ] Color-coded lap strips

### Phase 4 — Map
- [ ] Leaflet map with dark/light tiles
- [ ] Draw GPS track polyline (colored by lap)
- [ ] Gate drawing mode (click two points → line)
- [ ] Sector drawing mode (click two points per sector)
- [ ] Gate/sector reset buttons
- [ ] Draggable gate endpoints
- [ ] Speed heatmap toggle
- [ ] Position marker dot

### Phase 5 — Lap Splitting & Sector Splitting
- [ ] Gate line intersection detection
- [ ] Split rawData into laps based on gate crossings
- [ ] Split laps into 3 equal-distance sectors
- [ ] Calculate per-sector times

### Phase 6 — Graphs (Plotly)
- [ ] Speed vs Distance chart
- [ ] Speed vs Time chart
- [ ] Speed Delta chart (vs reference)
- [ ] Time Delta chart (vs reference)
- [ ] Distance Delta chart (vs reference)
- [ ] Cross-chart zoom sync
- [ ] Hover sync across charts
- [ ] Click-to-seek on charts
- [ ] Reference trace (purple dashed)
- [ ] Legend click → toggle lap

### Phase 7 — Video Grid
- [ ] Video upload → blob URL → HTML5 `<video>` elements
- [ ] One video card per enabled lap
- [ ] Sync all videos to correct lap time range
- [ ] Lap color border on cards
- [ ] Placeholder when no video

### Phase 8 — Playback Engine
- [ ] Play/pause with `requestAnimationFrame`
- [ ] Scrubber with distance/time mode toggle
- [ ] Speed selector (0.25x–8x)
- [ ] Frame stepping (prev/next, coarse rewind/ff)
- [ ] Map position marker animation
- [ ] Chart cursor lines (vertical markers on all charts)
- [ ] Video sync (all videos seek to correct time)
- [ ] Live telemetry display (speed, time, lap)
- [ ] Delta time cap (0.1s max dt)

### Phase 9 — Statistics & Polish
- [ ] Delta coloring (green/red) in lap tower
- [ ] Best lap trophy icon
- [ ] Reference lap highlighting
- [ ] File info bar (filename, lap count)
- [ ] Download CSV button
- [ ] Settings drawer (default speed, map tiles, smoothing)
- [ ] Toast notifications
- [ ] Keyboard shortcuts (Space=play/pause, arrows=step, etc.)

## 12. Key Technical Decisions

- **No framework** — vanilla JS, all logic in `src/index.html` or extracted to ES6 modules under `src/modules/`
- **Global state** — single `window.KARTDATA` object with all state variables (rawData, lapsData, playbackState, map, etc.)
- **Resize handling** — panel resize handles between map/graphs and main/video sections
- **State persistence** — layout sizes and settings in `localStorage`
- **Dark/light theme** — Tailwind `dark:` class on `<html>`, toggle persists in `localStorage`
