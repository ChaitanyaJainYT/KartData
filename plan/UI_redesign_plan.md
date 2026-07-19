# KartData UI Redesign Plan — Lap Analysis Dashboard

## Overview
Rebuild `src/index.html` with the redesigned UI per `UI_plan.md`. The existing code has monolithic inline JS with all features; this rewrite restructures the layout and adds delta charts, a full lap tower, sector management, and synced multi-video playback.

---

## 1. Layout (Grid)

```
┌──────────────────────────────────────────────────────────────────┐
│  TOP BAR (56px): Logo | Upload CSV | Upload Video | Extract CSV  │
│                  Download CSV | Settings | Theme                  │
├──────┬───────────────────────────────────────────────────────────┤
│      │  ┌─────────────────────┬──────────────────────────────┐   │
│ LAP  │  │     MAP             │  GRAPHS (5 charts)           │   │
│ TOWER│  │ [S/F] [S1] [S2] [S3]│  • Speed vs Distance         │   │
│ 320px│  │ [Reset Lines]       │  • Speed vs Time             │   │
│      │  │                     │  • Speed Delta                │   │
│ En   │  │                     │  • Time Delta                 │   │
│ Lap# │  │                     │  • Distance Delta             │   │
│ Time │  └─────────────────────┴──────────────────────────────┘   │
│ Delta│  ┌──────────────────────────────────────────────────────┐  │
│ S1   │  │  VIDEO GRID (horizontal scroll, 200px height)       │  │
│ S2   │  │  [Lap1] [Lap2] [Lap3] [Lap4] ...                    │  │
│ S3   │  └──────────────────────────────────────────────────────┘  │
│ Min  ├──┴─────────────────────────────────────────────────────────┤
│ Avg  │  PLAYBACK BAR (56px): ◀◀ ▶️/⏸️ ▶▶ [scrubber]              │
│ Max  │  [Dist|Time] [0.25x|0.5x|1x|2x|4x|8x]                     │
│ Ref  └────────────────────────────────────────────────────────────┘
```

---

## 2. Top Bar (fixed height)

| Element | Behavior |
|---------|----------|
| Logo | `KARTDATA` text with steering wheel icon, left-aligned |
| Upload CSV | Brand-red button → file picker `.csv` |
| Upload Video | Gray button → file picker `video/*` |
| Extract CSV from Video | Gray button → extracts GPMD telemetry from GoPro MP4 |
| Download CSV | Gray button → exports telemetry CSV (visible after data loaded) |
| Settings | Gear icon → slide-in drawer from right |
| Theme | Moon/Sun toggle for dark/light mode |
| File Info | Badge: filename + lap count (visible after data loaded) |

---

## 3. Lap Tower (left sidebar, 320px, scrollable)

### Column Headers (sticky top)
| Col | Width | Content |
|-----|-------|---------|
| `En` | 36px | Enable/disable checkbox |
| `Lap` | 40px | Lap number |
| `Time` | 72px | Lap time (mm:ss.sss) |
| `Delta` | 64px | Delta to reference |
| `S1` | 52px | Sector 1 time |
| `S2` | 52px | Sector 2 time |
| `S3` | 52px | Sector 3 time |
| `Min` | 48px | Min speed (km/h) |
| `Avg` | 48px | Avg speed (km/h) |
| `Max` | 48px | Max speed (km/h) |
| `Ref` | 36px | Reference lap radio |

### Row styling
- Alternating row backgrounds
- 4px left border in lap color
- Monospace font, 11-12px
- Best lap: trophy icon
- Reference lap: purple highlight
- Delta: green (faster) / red (slower)
- Checkbox toggles lap visibility on charts/map/video
- Radio sets reference lap → recalculates all deltas

---

## 4. Map Panel (top-left content area)

### Overlay buttons (top-left of map)
| Button | Action |
|--------|--------|
| Set S/F | Click 2 points on map → define start/finish gate → split laps |
| Reset S/F | Clear gate → revert to single lap |
| Set S1 | Click 2 points → sector-1 line (green dashed) |
| Set S2 | Click 2 points → sector-2 line (amber dashed) |
| Set S3 | Click 2 points → sector-3 line (purple dashed) |
| Reset All | Clear all sector lines |

### Track display
- GPS track polyline colored by lap
- Speed heatmap (toggleable)
- Gate line (thick red dashed) with draggable endpoints
- Sector lines (colored dashed)
- Position marker dot (animated during playback)
- Start/finish flag icon

---

## 5. Graphs Area (top-right content area)

5 chart cards in a scrollable column:

| Chart | X | Y | Traces |
|-------|---|---|--------|
| Speed vs Distance | Distance (m) | Speed (km/h) | 1 per enabled lap |
| Speed vs Time | Time (s) | Speed (km/h) | 1 per enabled lap |
| Speed Delta | Distance (m) | Speed Delta (km/h) | 1 per lap vs reference |
| Time Delta | Distance (m) | Time Delta (s) | Cumulative time diff vs reference |
| Distance Delta | Distance (m) | Distance Delta (m) | Position delta vs reference |

### Chart features
- Cross-chart zoom sync (all charts share x-range)
- Hover sync (crosshair on all charts at same x)
- Click-to-seek (click chart → seek playback)
- Reference trace shown as purple dashed line
- Playback cursor vertical line on all charts during playback
- Each chart card: collapsible header + Plotly chart area

---

## 6. Video Grid (below map/graphs)

- Horizontal scrollable row of video cards
- Height: ~200-220px
- One card per **enabled** lap
- Each card shows the same source video, synced to lap's time range
- Card width: 240-320px, left border in lap color
- Overlay: lap number + lap time in top-left
- All videos play/pause/seek together
- Cards removed when lap is disabled
- "No video loaded" placeholder

---

## 7. Playback Bar (bottom, fixed)

| Element | Description |
|---------|-------------|
| ⏮️ (Prev Frame) | Step -1 frame (~0.04s) |
| ⏪ (Rewind) | Step -0.5s |
| ▶️ / ⏸️ (Play/Pause) | Toggle; brand-red circle |
| ⏩ (Fast Forward) | Step +0.5s |
| ⏭️ (Next Frame) | Step +1 frame |
| Scrubber | Range slider; click/drag to seek |
| Position display | Current / Total (mm:ss.sss or 0.0m) |
| Mode toggle | Distance / Time buttons |
| Speed selector | 0.25x, 0.5x, 1x, 2x, 4x, 8x |

### Playback sync engine
- Uses `requestAnimationFrame` loop
- Advances by `speed * dt` (time mode) or `speed * distanceSimSpeed * dt` (distance mode)
- Syncs: scrubber, map marker, chart cursors (vertical lines on all 5 charts), video elements, live telemetry (speed/time/lap)
- Delta time capped at 0.1s

---

## 8. Data Flow

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
    ┌─────────────────────────┼──────────────────────────┐
    ↓                         ↓                          ↓
Lap Tower (stats, deltas)  Charts (5 types)         Map (tracks)
    ↓                         ↓                          ↓
Enable/disable filters    Zoom/hover sync          Gate/sector lines
    ↓                         ↓                          ↓
Reference selection       Playback cursor          Position marker
```

---

## 9. Implementation Phases

### Phase 1 — HTML Shell & Layout
- Set up Tailwind + CDNs
- Build top bar
- Build lap tower with table structure
- Map container + Leaflet
- 5 chart containers
- Video grid section
- Playback bar

### Phase 2 — CSV Parsing & Data Model
- PapaParse CSV upload
- Column auto-detection
- Haversine distance
- Lap statistics (all required fields)

### Phase 3 — Lap Tower Rendering
- Render rows with all columns
- Enable/disable → filter data
- Reference radio → recalculate deltas
- Sort by lap number/time
- Color coding

### Phase 4 — Map with Lines
- Leaflet map
- GPS track polylines
- Gate drawing mode (2 clicks)
- Sector drawing mode (2 clicks per sector)
- Gate/sector reset
- Draggable gate endpoints

### Phase 5 — Lap Splitting & Sectors
- Gate intersection detection
- Split rawData into laps
- Split laps into 3 equal-distance sectors
- Per-sector times

### Phase 6 — 5 Charts (Plotly)
- Speed vs Distance
- Speed vs Time
- Speed Delta
- Time Delta
- Distance Delta
- Cross-chart zoom sync
- Hover sync
- Click-to-seek
- Reference trace
- Playback cursor lines

### Phase 7 — Video Grid
- Video upload → blob URL
- One video per enabled lap
- Sync to lap time range
- Lap color border
- Placeholder when no video

### Phase 8 — Playback Engine
- Play/pause with rAF
- Scrubber with distance/time mode
- Speed selector
- Frame stepping
- Map marker animation
- Chart cursor lines (all 5 charts)
- Video sync
- Live telemetry display

---

## 10. Sector System — How It Works

### Default Sector Definition (No Map Lines)

When no sector lines are drawn on the map, sectors are computed **automatically by distance**:

1. After CSV is loaded and laps are split (either single lap or via gate), each lap's `maxDistance` is the total distance of that lap.
2. The lap is divided into **3 equal-distance segments**:
   - **Sector 1**: 0% → 33% of lap distance
   - **Sector 2**: 33% → 66% of lap distance  
   - **Sector 3**: 66% → 100% of lap distance
3. The code finds the data row closest to each boundary (33%, 66%) by `lapDistance`.
4. Times are computed as: `sectorTime = boundaryRow.time - startRow.time`.

### Setting Custom Sector Lines on the Map

Instead of equal-distance sectors, you can draw sector boundary lines on the map:

1. Click **S1** button → map enters sector-drawing mode.
2. Click **two points** on the track to draw a line across the track — this defines where Sector 1 ends and Sector 2 begins.
3. Repeat for **S2** (Sector 2 → 3 boundary) and **S3** (Sector 3 → finish boundary), or any subset.
4. Sector lines are displayed as dashed colored lines:
   - S1: blue (`#3b82f6`)
   - S2: orange (`#f97316`)
   - S3: green (`#22c55e`)
5. Click **Reset** icon to clear all sector lines and revert to equal-distance defaults.

### Data Calculation

- **Sector times**: In `computeSectors()`, the code finds the rows in the lap array closest to the boundary distances, then subtracts the timestamps.
- **Best sectors**: `computeBestSectors()` iterates all laps and stores the lowest time for each sector in `bestSectors.s1`, `.s2`, `.s3`.
- **Lap tower display**: Cells for the best sector times are highlighted in **purple** (`#a855f7`) with bold font weight.
- **Map coloring**: Each lap's track is colored by sector performance vs best sector:
  - Green: time equals the best sector time
  - Red: time is >10% slower than best
  - Gray: time is within 10% of best

### Gate vs Sectors

- **Gate (S/F)**: Splits the overall data into **laps** by detecting when the GPS track crosses the start/finish line.
- **Sectors**: Subdivide each **lap** into 3 segments (either by distance or by drawn lines).
- You must set a gate to get multiple laps. Sectors work within each lap regardless.

---

## 11. Color Palette

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| bg-base | `#0f172a` | `#f8fafc` | Page background |
| bg-surface | `#1e293b` | `#ffffff` | Cards, sidebar |
| bg-elevated | `#334155` | `#f1f5f9` | Hover, sub-panels |
| border-default | `#334155` | `#e2e8f0` | Borders |
| text-primary | `#f8fafc` | `#0f172a` | Primary text |
| text-secondary | `#94a3b8` | `#64748b` | Muted text |
| accent | `#ef4444` | Brand, speed, active |
| accent-green | `#22c55e` | Positive delta, Sector 3 line |
| accent-purple | `#a855f7` | Reference lap, best sector highlight |
| accent-blue | `#3b82f6` | Sector 1 line |
| accent-orange | `#f97316` | Sector 2 line |
| lap colors | `#ef4444, #3b82f6, #22c55e, #f59e0b, #a855f7, #ec4899, #06b6d4, #f97316` | Lap traces |
