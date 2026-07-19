```python
import os
import pandas as pd

# Check if file exists
files = os.listdir('.')
print("Files:", files)

if 'GX018336_demo_Telemetry.csv' in files:
    df = pd.read_csv('GX018336_demo_Telemetry.csv')
    print("\nColumns:", df.columns.tolist())
    print("\nFirst 3 rows:\n", df.head(3))


```

```text
Files: ['GX018336_demo_Telemetry.csv', 'extract_tele_v2.html', 'plan.md']

Columns: ['cts', 'date', 'ACCL_x', 'ACCL_y', 'ACCL_z', 'temp_ACCL', 'GYRO_x', 'GYRO_y', 'GYRO_z', 'temp_GYRO', 'GRAV_x', 'GRAV_y', 'GRAV_z', 'CORI_w', 'CORI_x', 'CORI_y', 'CORI_z', 'GPS (Lat.) [deg]', 'GPS (Long.) [deg]', 'GPS (Alt.) [m]', 'GPS (2D) [m/s]', 'GPS (3D) [m/s]', 'GPS (days) [deg]', 'GPS (secs) [s]', 'GPS (DOP) [deg]', 'GPS (fix) [deg]', 'altitude system']

First 3 rows:
         cts                      date  ACCL_x  ACCL_y  ACCL_z  temp_ACCL  GYRO_x  GYRO_y  GYRO_z  temp_GYRO    GRAV_x    GRAV_y    GRAV_z    CORI_w    CORI_x    CORI_y    CORI_z  GPS (Lat.) [deg]  GPS (Long.) [deg]  GPS (Alt.) [m]  GPS (2D) [m/s]  GPS (3D) [m/s]  GPS (days) [deg]  GPS (secs) [s]  GPS (DOP) [deg]  GPS (fix) [deg] altitude system
0  0.000000  2026-05-06T18:03:16.900Z   36.21    2.34   19.86        NaN   0.014  -0.111   0.049        NaN  0.438232  7.187012  3.485352  0.999969 -0.001099  0.000183  0.000458         25.491316          51.457256           9.548           0.122           0.008            9622.0         64996.9             1.47              3.0            MSLV
1  4.931034  2026-05-06T18:03:16.900Z   37.14    2.26   19.38        NaN   0.012  -0.123   0.050        NaN       NaN       NaN       NaN       NaN       NaN       NaN       NaN               NaN                NaN             NaN             NaN             NaN               NaN             NaN              NaN              NaN             NaN
2  9.862069  2026-05-06T18:03:16.900Z   38.01    2.49   18.75        NaN   0.012  -0.126   0.049        NaN       NaN       NaN       NaN       NaN       NaN       NaN       NaN               NaN                NaN             NaN             NaN             NaN               NaN             NaN              NaN              NaN             NaN


```

Here is the updated architectural blueprint. I have explicitly integrated the schema and formatting requirements from `GX018336_demo_Telemetry.csv` directly into the data models and core processing flows.

---

# KartData: Rigorous Architectural Blueprint (project_plan.md)

## 0. Project Management

First create a todo.md to keep track of all the steps to be taken and what has been completed. Keep updating the todo.md file as we progress. It should link to the plan file for each task. This will serve as a tracker for what is done and what is left for the different sessions we work on.

## 1. Project Context & Constraints

* **The Core Problem:** KartData democratizes professional-grade motorsport telemetry by replacing expensive desktop software with a browser-based, interactive dashboard inspired by F1 data centers. It enables karting and track-day drivers to analyze runs and find ultimate pace.
* **Target Audience:** Motorsport enthusiasts and power users who demand high data density, tabular precision, and professional visual paradigms similar to Motec or McLaren ATLAS.
* **Strict Constraints:**
* **Zero Server Backend:** All file parsing, physics calculations, and video rendering must happen entirely client-side in the browser for privacy and speed.
* **Single Page Application (SPA):** The application must never reload the page after initial boot.
* **No Loading Screens (Post-Boot):** File processing must use background workers or provide non-blocking UI feedback.
* **Responsive Modularity:** The UI must be highly customizable (resizable, movable, show/hide modules), require minimal scrolling, and adapt perfectly to both desktop and mobile screens (vertical and horizontal).



---

## 2. Exact Tech Stack & Versions

To maintain a lightweight and extremely fast environment, this project avoids heavy frontend frameworks like React or Vue, relying on native DOM manipulation and efficient libraries.

| Domain | Technology / Library | Specifics & Purpose |
| --- | --- | --- |
| **Frontend Core** | HTML5, CSS3, Vanilla JavaScript (ES6+) | Single-file or highly bundled modular structure. |
| **Styling** | Tailwind CSS (via CDN) | Utility-first styling restricted to a custom dark mode theme. |
| **Mapping** | Leaflet.js | Interactive track rendering using CartoDB Dark Matter tiles. |
| **Charting** | Plotly.js | WebGL-accelerated, stacked, and synchronized telemetry traces. |
| **CSV Parsing** | PapaParse | High-speed, in-browser CSV ingestion. |
| **Video Extraction** | mp4box.js (v0.5.2) | Extracts GPMD telemetry tracks directly from MP4 files. |
| **Video Playback** | Native HTML5 `<video>` | Must support H.265 (HEVC) decoding via browser APIs. |
| **Icons** | Phosphor Icons | Clean, consistent vector iconography. |

---

## 3. Data Models & Application State

Since there is no external database, the following represents the rigorous **in-memory state schema** and **CSV output format** required to drive the application.

### Telemetry Target Schema (Matched to `GX018336_demo_Telemetry.csv`)

When extracting MP4 files, the generated CSV and the normalized in-memory `TelemetryPoint` object array must strictly mirror the following column headers and data types:

* `cts`: float (Continuous Timestamp in milliseconds)
* `date`: ISO 8601 string (e.g., "2026-05-06T18:03:16.900Z")
* `ACCL_x`, `ACCL_y`, `ACCL_z`: float (Raw accelerometer data)
* `temp_ACCL`: float (Temperature for accelerometer)
* `GYRO_x`, `GYRO_y`, `GYRO_z`: float (Raw gyroscope data)
* `temp_GYRO`: float (Temperature for gyroscope)
* `GRAV_x`, `GRAV_y`, `GRAV_z`: float (Gravity vector, for G-Force)
* `CORI_w`, `CORI_x`, `CORI_y`, `CORI_z`: float (Coriolis/quaternion rotation data)
* `GPS (Lat.) [deg]`, `GPS (Long.) [deg]`: float (Coordinates)
* `GPS (Alt.) [m]`: float (Altitude)
* `GPS (2D) [m/s]`, `GPS (3D) [m/s]`: float (Speeds)
* `GPS (days) [deg]`, `GPS (secs) [s]`: float (GoPro GPS timing)
* `GPS (DOP) [deg]`, `GPS (fix) [deg]`: float (GPS accuracy and fix status)
* `altitude system`: string (e.g., "MSLV")



### Application State Models

* **Lap (Object Array):** Sliced segments of the `TelemetryPoint` array.
* `id`: integer (Lap number)
* `startIndex`: integer (Array index of lap start)
* `endIndex`: integer (Array index of lap end)
* `lapTime`: float (Total duration in seconds)
* `sectors`: float array (Duration of individual sectors)
* `isReference`: boolean (Flag for the chosen base lap)


* **SessionState (Singleton):**
* `referenceLapId`: integer | null
* `videoOffsetMs`: float (Calibration offset for sync)
* `currentPlaybackTime`: float (Global scrubber position)



---

## 4. Architecture & File Structure

If strictly adhering to a single-file delivery model is impossible due to complexity, follow this feature-based directory tree for a build step (e.g., Vite/Webpack):

```text
/src
  /assets           # Fonts (JetBrains Mono, Bebas Neue, Inter), sample CSV/MP4s
  /styles           # global.css, Tailwind directives
  /core
    - state.js      # Global state manager (Pub/Sub pattern for reactive UI updates)
    - math.js       # Physics Engine (LatG/LonG calculations, filtering)
  /modules
    /extractor      # MP4Box implementation, GPMD parsing logic (Outputs target schema)
    /mapping        # Leaflet initialization, heatmaps, S/F line drawing
    /charts         # Plotly setup, Slip Chart delta calculations, G-G friction circle
    /video          # Video mounting, sync offset handling
    /ui             # Drag/drop layout manager, modular resizing logic
  - index.html      # Main entry point (DOM scaffolding)
  - app.js          # App bootstrapper

```

---

## 5. Core Features & User Flows

### Flow 1: Smart Data Ingestion & Extraction (GoPro to CSV)

1. User drops a GoPro 11 MP4 file into the drop zone.
2. Display a progress bar blocking interactions to prevent race conditions.
3. `mp4box.js` extracts the `gpmd` track.
4. Parse ACCL, GYRO, GPS9, GRAV, and CORI streams.
5. Merge data by matching exact timestamps, ensuring `cts` logic scales correctly across sensors running at different Hz rates.
6. Generate and auto-download a combined CSV that **strictly matches the header sequence and data format of `GX018336_demo_Telemetry.csv**`.
7. Immediately mount the video in the UI module and load the parsed JSON into application state.

### Flow 2: Track & Lap Initialization

1. Map module reads GPS array and plots the dark-mode polyline.
2. User clicks "Set Start/Finish". Map enters drawing mode.
3. User draws a spatial line across the track polyline.
4. Algorithm detects intersection points between the GPS array and the drawn line.
5. Slices data into `Lap` objects.
6. Timing Tower populates with lap times, sorted by duration.

### Flow 3: Analysis & Playback Sync

1. User selects "Lap 4" as the Reference Lap.
2. User selects "Lap 6" for comparison.
3. Math engine calculates dynamic time deltas (Slip Chart) by comparing distances/times.
4. User drags the global UI scrubber.
5. App state broadcasts `currentTime`.
6. Chart crosshairs update, Map marker moves, and H.265 video seeks to the exact frame synchronously.

---

## 6. Design System & UI/UX Rules

### Color Palette (Hex Codes)

* **App Background:** Deep Navy/Black `#0a0d14`.
* **Module/Panel Backgrounds:** Slightly lighter Navy `#151924`.
* **Borders:** Subtle `#2a3143` (Strict rule: No drop shadows).
* **Reference/Leader Trace:** Neon Purple `#b138ff`.
* **Positive Delta (Faster):** Acid Yellow `#e8ff00` or Bright Green `#22c55e`.
* **Negative Delta (Slower):** Warning Red `#ef4444`.
* **Secondary Traces:** Cyan `#00d2ff`, Pink `#ec4899`, Orange `#f97316`.

### Typography

* **Data Values (Numbers/Tables):** `JetBrains Mono` to prevent horizontal layout shifting.
* **Headers:** `Bebas Neue` for aggressive, broadcast-style aesthetics.
* **UI Controls:** `Inter` for clean readability on buttons and labels.

### Component Behavior & Responsiveness

* **Layout Engine:** Implement a CSS Grid/Flexbox architecture wrapped in a drag-and-drop modular system (e.g., custom JS pointer events or Gridstack.js). Panels must be dynamically resizable and collapsible.
* **Sync Resizing:** Use `ResizeObserver` on chart and map containers to trigger Plotly/Leaflet redraws instantly when a user resizes a panel, preventing visual clipping.
* **Button States:** All buttons require `hover`, `disabled`, and `active:scale-95` classes for tactile visual feedback.
* **Global Viewport:** Body locked to `100vh` and `overflow-hidden`. Only internal lists (like the timing tower) may scroll.
* **Mobile Breakpoints:** At max-width `768px`, modular grid collapses into a vertically stacked accordion or a tabbed interface (e.g., "Video | Map | Charts" tabs) to maintain visibility without microscopic zooming.

---

## 7. Security & Permissions

Because this is a fully client-side application with no server backend, traditional Role-Based Access Control (RBAC) does not apply.

* **Data Privacy:** All GPS coordinates, video files, and driving telemetry are processed entirely within the user's browser runtime memory. No data is ever transmitted to an external server.
* **File Validation:** The file uploader must strictly validate MIME types (rejecting executables or malformed files) before passing them to the PapaParse or MP4Box parsers to prevent browser crashes or memory overflow from arbitrary files.