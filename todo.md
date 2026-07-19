# KartData — Implementation Tracker

## Current Phase: 1 (Core CSV + Map)

- [x] Empty state UI (checkered flag, upload prompt)
- [x] CSV upload via header button and empty state button
- [x] PapaParse integration with column auto-detection (lat, lon, speed, time)
- [x] Haversine distance calculation
- [x] Speed m/s → km/h conversion
- [x] Default single lap calculation
- [x] UI state transition (empty → dashboard with sidebar, map, playback bar)
- [x] Leaflet map with CartoDB Dark Matter tiles
- [x] Polyline rendering for GPS track
- [x] Dark/light theme toggle with tile swapping
- [x] Auto-detect OS dark mode preference

## Phase Plan References

| Phase | File | Status |
|---|---|---|
| 00 — Project Setup | `project_plan_v3/phase_00_project_setup.md` | ✅ Done |
| 01 — Core CSV + Map | `project_plan_v3/phase_01_core_csv_map.md` | ✅ Done |
| 02 — Speed Charts | `project_plan_v3/phase_02_speed_charts.md` | ⬜ |
| 03 — Gate + Lap Split | `project_plan_v3/phase_03_gate_lap_split.md` | ⬜ |
| 04 — Sidebar + Lap Selection | `project_plan_v3/phase_04_sidebar_lap_selection.md` | ⬜ |
| 05 — Playback Bar | `project_plan_v3/phase_05_playback_bar.md` | ⬜ |
| 06 — Video Sync | `project_plan_v3/phase_06_video_player_sync.md` | ⬜ |
| 07 — Toast + Drag-Drop | `project_plan_v3/phase_07_toast_drag_drop.md` | ⬜ |
| 08 — MP4 Extraction | `project_plan_v3/phase_08_mp4_extraction.md` | ⬜ |
| 09 — Extended Charts | `project_plan_v3/phase_09_extended_charts.md` | ⬜ |
| 10 — Chart Interactions | `project_plan_v3/phase_10_chart_interactions.md` | ⬜ |
| 11 — Keyboard Shortcuts | `project_plan_v3/phase_11_keyboard_shortcuts.md` | ⬜ |
| 12 — Map Enhancements | `project_plan_v3/phase_12_map_enhancements.md` | ⬜ |
| 13 — Reference + Stats | `project_plan_v3/phase_13_reference_lap_statistics.md` | ⬜ |
| 14 — Sectors + A-B Loop | `project_plan_v3/phase_14_sectors_ab_loop.md` | ⬜ |
| 15 — Bookmarks + Settings + Data Table | `project_plan_v3/phase_15_bookmarks_settings_data_table.md` | ⬜ |
| 16 — Layout Manager | `project_plan_v3/phase_16_layout_manager.md` | ⬜ |
| 17 — Mobile + PWA + A11y | `project_plan_v3/phase_17_mobile_pwa_accessibility.md` | ⬜ |

## Session Log

| Date | Phase Worked | Notes |
|---|---|---|
| 2026-07-19 | 00 | Project scaffold created |
| 2026-07-19 | 01 | CSV upload + Leaflet map + theme toggle implemented |
