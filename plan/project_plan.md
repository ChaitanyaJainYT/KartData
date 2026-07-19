# KartData: Rigorous Architectural Blueprint (project_plan.md)

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
| **Frontend Core** | HTML5, CSS3, Vanilla JavaScript (ES6+)

 | Single-file or highly bundled modular structure.

 |
| **Styling** | Tailwind CSS (via CDN)

 | Utility-first styling restricted to a custom dark mode theme.

 |
| **Mapping** | Leaflet.js

 | Interactive track rendering using CartoDB Dark Matter tiles.

 |
| **Charting** | Plotly.js

 | WebGL-accelerated, stacked, and synchronized telemetry traces.

 |
| **CSV Parsing** | PapaParse

 | High-speed, in-browser CSV ingestion.

 |
| **Video Extraction** | mp4box.js (v0.5.2)

 | Extracts GPMD telemetry tracks directly from MP4 files.

 |
| **Video Playback** | Native HTML5 `<video>` | Must support H.265 (HEVC) decoding via browser APIs. |
| **Icons** | Phosphor Icons

 | Clean, consistent vector iconography.

 |

---

## 3. Data Models & Application State

Since there is no external database, the following represents the rigorous **in-memory state schema** required to drive the application.

* **TelemetryPoint (Object Array):** The normalized state of a single data frame.
* `ts`: float (Timestamp in milliseconds)
* `lat`, `lon`: float (GPS coordinates)
* `speed`: float (Speed in km/h or mph)
* `latG`: float (Calculated Lateral G-force)
* `lonG`: float (Calculated Longitudinal G-force)
* `accl_x`, `accl_y`, `accl_z`: float (Raw accelerometer data)


* `gyro_x`, `gyro_y`, `gyro_z`: float (Raw gyroscope data)




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
    /extractor      # MP4Box implementation, GPMD parsing logic
    /mapping        # Leaflet initialization, heatmaps, S/F line drawing
    /charts         # Plotly setup, Slip Chart delta calculations, G-G friction circle
    /video          # Video mounting, sync offset handling
    /ui             # Drag/drop layout manager, modular resizing logic
  - index.html      # Main entry point (DOM scaffolding)
  - app.js          # App bootstrapper

```

---

## 5. Core Features & User Flows

### Flow 1: Smart Data Ingestion & Extraction

1. User drops a GoPro 11 MP4 file into the drop zone.


2. Display a progress bar blocking interactions to prevent race conditions.


3. `mp4box.js` extracts the `gpmd` track.


4. Parse ACCL, GYRO, GPS9, GRAV, and CORI streams.


5. Merge data by matching exact timestamps.


6. Generate and auto-download the combined CSV.


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