# Phase 00: Project Setup & File Structure

**Goal:** Create the complete project directory structure, initial HTML scaffold with all CDN dependencies, Tailwind configuration, CSS base styles, and a tracking `todo.md`. After this phase, you have a blank page that loads all libraries and shows the basic shell — nothing interactive yet, but every dependency is verified working.

---

## Prerequisites

- A code editor (VS Code recommended)
- A local web server (any of: `npx serve`, Python `http.server`, VS Code Live Server extension) — needed because some CDN scripts use ES6 modules or `file://` restrictions affect video/blob URLs

---

## Step 1: Create Directory Tree

Create the following structure at your project root (`C:\Users\Chaitanya Jain\Desktop\CJ\MyDev\KartData\`):

```
/src
  /assets            # Font files (if self-hosting later), sample CSVs
  /styles
    - global.css     # Tailwind directives + all custom CSS classes
  /core
    - state.js       # Global state manager (Pub/Sub pattern — placeholder)
    - math.js        # Haversine, smoothing, gate intersection utilities
  /modules
    /extractor
      - mp4box.js    # MP4Box initialization, GPMD extraction, KLV parser
      - csvBuilder.js  # buildCombinedTelemetryCsv
      - parseCSV.js  # processIncomingCSV — normalize CSV → rawData
    /mapping
      - map.js       # Leaflet init, tile switching, polyline/marker rendering
      - gate.js      # Gate drawing mode, ghost line, intersection lap split
    /charts
      - plots.js     # Plotly setup, all chart types, renderCharts
      - sync.js      # Zoom sync engine, click/hover interaction profiles
    /video
      - uploader.js  # Video upload, blob URL management, loading state
      - player.js    # Video grid rendering, playback rate sync, frame seek
    /ui
      - layout.js    # LayoutManager: resize handles, panel hide/show, presets
      - theme.js     # Dark/light mode toggle
      - playback.js  # Playback bar, scrubber, play/pause, mode switch
      - lapList.js   # Lap list rendering, filter logic, sort toggle
      - toast.js     # Toast notification system
      - shortcuts.js # Keyboard shortcut dispatcher
      - bookmarks.js # Bookmark/marker system
      - settings.js  # Settings drawer & localStorage persistence
      - dataTable.js # Data table / telemetry spreadsheet view
  - index.html       # Main entry point — all DOM scaffolding
  - app.js           # App bootstrapper — imports, init, event wiring
```

**For the initial single-file approach during early phases**, all code lives in `index.html`'s `<script>` block. The module splitting into separate files happens later (after phase 10+). Create the directory structure now with empty placeholder files so it's ready when needed.

---

## Step 2: Create `index.html` Scaffold

Create `C:\Users\Chaitanya Jain\Desktop\CJ\MyDev\KartData\src\index.html` with the following shell:

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KartData | Precision Telemetry Suite</title>

    <!-- Tailwind CSS (CDN) -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                        mono: ['JetBrains Mono', 'monospace'],
                    },
                    colors: {
                        brand: { 500: '#ef4444', 600: '#dc2626' },
                        gray: {
                            50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0',
                            300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b',
                            600: '#475569', 700: '#334155', 800: '#1e293b',
                            900: '#0f172a', 950: '#020617',
                        }
                    }
                }
            }
        }
    </script>

    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">

    <!-- Leaflet CSS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />

    <!-- Leaflet JS -->
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

    <!-- Plotly.js -->
    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>

    <!-- PapaParse -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>

    <!-- MP4Box.js -->
    <script src="https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js"></script>

    <!-- Phosphor Icons -->
    <script src="https://unpkg.com/@phosphor-icons/web"></script>

    <!-- Global Styles -->
    <link rel="stylesheet" href="styles/global.css">
</head>
<body class="bg-gray-50 dark:bg-gray-950 h-screen flex flex-col overflow-hidden text-gray-800 dark:text-gray-200 transition-colors duration-200">

    <!-- ==================== HEADER ==================== -->
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex justify-between items-center z-20 flex-shrink-0 transition-colors duration-200 h-16">
        <div class="flex items-center gap-3">
            <div class="leading-none flex items-center gap-2">
                <i class="ph-fill ph-steering-wheel text-brand-600 text-2xl"></i>
                <div class="text-xl font-black tracking-tight">
                    <span class="text-brand-600">KART</span><span class="text-gray-900 dark:text-white">DATA</span>
                </div>
            </div>
            <div class="hidden md:block h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
            <p class="hidden md:block text-xs font-medium text-gray-500 dark:text-gray-400 tracking-wide uppercase">Precision Telemetry Suite</p>
        </div>

        <div class="flex items-center gap-4">
            <!-- File info (hidden initially) -->
            <div id="file-info" class="hidden items-center gap-3 mr-4 text-sm bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700">
                <i class="ph ph-file-csv text-gray-500 dark:text-gray-400"></i>
                <span id="filename-display" class="font-semibold text-gray-700 dark:text-gray-200 max-w-[150px] truncate"></span>
                <div class="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                <span id="lap-count-display" class="font-bold text-brand-600 dark:text-brand-500"></span>
            </div>

            <!-- Upload buttons -->
            <label id="video-upload-label" class="cursor-pointer bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-sm text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 active:scale-95">
                <i id="video-upload-icon" class="ph ph-video-camera text-lg text-gray-500 dark:text-gray-400"></i>
                <span id="video-btn-text">Add Video</span>
                <input type="file" id="video-upload" accept="video/*" class="hidden" />
            </label>

            <label class="cursor-pointer bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm shadow-brand-500/20 flex items-center gap-2 active:scale-95">
                <i class="ph ph-upload-simple text-lg"></i>
                Upload CSV
                <input type="file" id="csv-upload" accept=".csv" class="hidden" />
            </label>

            <button id="theme-toggle" class="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors" title="Toggle Theme">
                <i class="ph ph-moon text-xl dark:hidden"></i>
                <i class="ph ph-sun text-xl hidden dark:block text-yellow-400"></i>
            </button>
        </div>
    </header>

    <!-- ==================== BODY ==================== -->
    <div class="flex-1 flex overflow-hidden">

        <!-- Sidebar (hidden initially) -->
        <aside id="app-sidebar" class="w-80 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hidden flex-shrink-0 transition-colors z-10">
            <div class="p-6 border-b border-gray-200 dark:border-gray-800">
                <h3 class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Live Telemetry</h3>
                <div class="flex flex-col gap-4">
                    <div class="bg-gray-50 dark:bg-gray-950 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col items-center justify-center relative overflow-hidden">
                        <div class="absolute inset-0 bg-gradient-to-br from-gray-100/50 to-transparent dark:from-gray-800/20 dark:to-transparent"></div>
                        <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 z-10">SPEED</span>
                        <div class="flex items-baseline gap-1 z-10">
                            <span id="live-speed" class="text-4xl font-black text-gray-900 dark:text-white tracking-tighter font-mono">0.0</span>
                            <span class="text-sm font-bold text-gray-400">km/h</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-gray-50 dark:bg-gray-950 p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col items-center">
                            <span class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">TIME</span>
                            <span id="live-time" class="text-lg font-bold text-gray-800 dark:text-gray-200 font-mono">00:00.000</span>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-950 p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col items-center">
                            <span class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">LAP</span>
                            <span id="live-lap" class="text-lg font-bold text-brand-600 font-mono">-</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Gate config placeholder -->
            <div class="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                <h3 class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Gate Configuration</h3>
                <div id="stepText" class="text-xs text-gray-600 dark:text-gray-300 mb-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-2.5 rounded-lg border border-blue-100 dark:border-blue-800/30 leading-tight">
                    Draw a gate line across the track on the map to automatically split and calculate laps.
                </div>
                <div class="flex gap-2">
                    <button id="draw-gate-btn" disabled class="flex-1 bg-gray-900 hover:bg-black dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm">
                        <i class="ph ph-pen-nib text-base"></i> Set Gate
                    </button>
                    <button id="clear-gate-btn" class="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold py-2 px-3 rounded-lg transition-all active:scale-95 shadow-sm">
                        Reset
                    </button>
                </div>
            </div>

            <!-- Lap list placeholder -->
            <div class="flex-1 flex flex-col overflow-hidden">
                <div class="p-4 pb-2 flex flex-col gap-2">
                    <div class="flex justify-between items-center">
                        <h3 class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Lap Visibility</h3>
                        <label class="flex items-center gap-1.5 cursor-pointer bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            <span class="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Sort by Time</span>
                            <input type="checkbox" id="sort-laps-toggle" class="rounded text-brand-600 focus:ring-0 w-3 h-3 bg-gray-200 dark:bg-gray-700 border-transparent">
                        </label>
                    </div>
                    <div class="flex items-center justify-end gap-2 group relative">
                        <i class="ph ph-chart-line-up text-gray-400 text-sm" title="Data Smoothing"></i>
                        <input type="range" id="smoothing-slider" min="0" max="20" value="0" step="1" class="w-20">
                        <span id="smoothing-value" class="text-xs font-mono text-gray-500">0</span>
                    </div>
                </div>
                <div id="sidebar-lap-list" class="flex-1 overflow-y-auto p-4 pt-0 space-y-1 custom-scrollbar">
                    <!-- Populated via JS -->
                </div>
            </div>
        </aside>

        <!-- Main content area -->
        <main class="flex-1 flex flex-col relative bg-gray-100 dark:bg-gray-950">

            <!-- Empty state -->
            <div id="empty-state" class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-50 dark:bg-gray-950 transition-colors">
                <div class="w-24 h-24 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center mb-6 shadow-sm">
                    <i class="ph ph-flag-checkered text-5xl text-gray-300 dark:text-gray-700"></i>
                </div>
                <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">No Telemetry Loaded</h2>
                <p class="text-gray-500 dark:text-gray-400 text-center max-w-sm mb-8">Upload a CSV file containing your GPS and speed data to begin analyzing your performance.</p>
                <label class="cursor-pointer bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-brand-500/30 flex items-center gap-2 active:scale-95 text-lg">
                    <i class="ph ph-upload-simple text-xl"></i>
                    Upload Telemetry CSV
                    <input type="file" onchange="document.getElementById('csv-upload').files = this.files; document.getElementById('csv-upload').dispatchEvent(new Event('change'));" accept=".csv" class="hidden" />
                </label>
            </div>

            <!-- Dashboard (hidden initially) -->
            <div id="dashboard-content" class="flex-1 flex flex-col overflow-hidden hidden h-full">
                <div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
                    <!-- Map column -->
                    <div class="w-full lg:w-1/2 flex flex-col border-r border-gray-200 dark:border-gray-800 relative bg-gray-200 dark:bg-gray-900">
                        <div id="map" class="flex-1"></div>
                        <div class="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-gray-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm pointer-events-none">
                            <span class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">GPS Track</span>
                        </div>
                    </div>
                    <!-- Charts column -->
                    <div class="w-full lg:w-1/2 flex flex-col bg-white dark:bg-gray-900 overflow-y-auto">
                        <div class="flex-1 p-4 flex flex-col gap-4">
                            <div class="flex-1 min-h-[250px] bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-2 flex flex-col">
                                <div id="chart-speed-dist" class="flex-1 w-full"></div>
                            </div>
                            <div class="flex-1 min-h-[250px] bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-2 flex flex-col">
                                <div id="chart-speed-time" class="flex-1 w-full"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Video section (hidden initially) -->
                <div id="video-section" class="bg-gray-900 dark:bg-gray-950 border-t border-gray-800 dark:border-gray-800 flex-shrink-0 hidden flex flex-col transition-all duration-200">
                    <div class="bg-gray-800 dark:bg-gray-900 px-4 py-2 flex justify-between items-center border-b border-gray-700 dark:border-gray-800">
                        <h3 class="text-gray-300 text-xs font-bold flex items-center gap-2 uppercase tracking-wider">
                            <i class="ph-fill ph-film-strip text-brand-500"></i> Video Synchronization
                        </h3>
                        <div class="flex items-center gap-3 bg-gray-900/50 dark:bg-black/20 px-3 py-1 rounded-lg">
                            <i class="ph ph-monitor text-gray-500 text-sm"></i>
                            <input type="range" id="video-size-slider" min="200" max="800" value="350" class="w-24">
                        </div>
                    </div>
                    <div class="flex-1 p-3 overflow-x-auto overflow-y-hidden flex gap-3 items-center justify-start custom-scrollbar" id="video-grid">
                        <!-- Populated via JS -->
                    </div>
                </div>
            </div>
        </main>
    </div>

    <!-- ==================== PLAYBACK BAR (hidden initially) ==================== -->
    <footer id="playback-bar" class="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center gap-6 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.2)] z-30 hidden transition-colors flex-shrink-0">

        <div class="flex items-center gap-3">
            <button id="prev-frame-btn" class="p-2 text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all" title="Previous Frame (-0.04s)">
                <i class="ph-fill ph-skip-back text-xl"></i>
            </button>
            <button id="play-btn" class="w-12 h-12 flex items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-500 hover:shadow-lg hover:shadow-brand-500/30 transition-all shadow-md active:scale-95 flex-shrink-0">
                <i class="ph-fill ph-play text-2xl ml-1"></i>
            </button>
            <button id="next-frame-btn" class="p-2 text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all" title="Next Frame (+0.04s)">
                <i class="ph-fill ph-skip-forward text-xl"></i>
            </button>
        </div>

        <div class="h-10 w-px bg-gray-200 dark:bg-gray-800 mx-2"></div>

        <div class="flex-1 flex flex-col justify-center gap-2">
            <div class="flex justify-between text-xs font-bold text-gray-500 dark:text-gray-400 font-mono tracking-wide">
                <span id="scrubber-current" class="text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">0.00</span>
                <span id="scrubber-total">0.00</span>
            </div>
            <input type="range" id="main-scrubber" min="0" max="100" value="0" step="0.01" class="w-full">
        </div>

        <div class="h-10 w-px bg-gray-200 dark:bg-gray-800 mx-2"></div>

        <div class="flex items-center gap-4">
            <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex-shrink-0 border border-gray-200 dark:border-gray-700">
                <button id="mode-dist" class="px-4 py-1.5 text-xs font-bold rounded-md bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm transition-all">Distance</button>
                <button id="mode-time" class="px-4 py-1.5 text-xs font-bold rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all">Time</button>
            </div>
            <div class="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div class="px-2 py-1.5 text-gray-400 dark:text-gray-500 bg-gray-200/50 dark:bg-gray-700/50 flex items-center border-r border-gray-200 dark:border-gray-700">
                    <i class="ph ph-gauge text-sm"></i>
                </div>
                <select id="playback-speed" class="bg-transparent border-none text-xs font-bold text-gray-700 dark:text-gray-200 pl-2 pr-4 py-1.5 outline-none focus:ring-0 cursor-pointer appearance-none">
                    <option value="0.25">0.25x</option>
                    <option value="0.5">0.5x</option>
                    <option value="1" selected>1.0x</option>
                    <option value="2">2.0x</option>
                    <option value="4">4.0x</option>
                    <option value="8">8.0x</option>
                </select>
            </div>
        </div>
    </footer>

    <!-- Main scripts -->
    <script type="module" src="app.js"></script>
</body>
</html>
```

---

## Step 3: Create `styles/global.css`

Create `C:\Users\Chaitanya Jain\Desktop\CJ\MyDev\KartData\src\styles\global.css`:

```css
/* ========== Base ========== */
body { -webkit-font-smoothing: antialiased; }
#map { height: 100%; width: 100%; z-index: 0; cursor: crosshair; }

/* ========== Custom Scrollbar ========== */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
.dark ::-webkit-scrollbar-thumb { background: #334155; }
.dark ::-webkit-scrollbar-thumb:hover { background: #475569; }

/* ========== Custom Range Input ========== */
input[type=range] { -webkit-appearance: none; background: transparent; }
input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%;
    background: #ef4444; cursor: pointer; margin-top: -5px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: transform 0.1s;
}
input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.2); }
input[type=range]::-webkit-slider-runnable-track {
    width: 100%; height: 4px; cursor: pointer; background: #e2e8f0; border-radius: 2px;
}
.dark input[type=range]::-webkit-slider-runnable-track { background: #334155; }

/* ========== Custom Checkbox (Lap Selection) ========== */
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

/* ========== Utility ========== */
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.custom-scrollbar { scrollbar-width: thin; }

/* ========== Video Card ========== */
.video-card video { width: 100%; height: 100%; object-fit: cover; border-radius: 0.5rem; background: #000; }
.video-card .error-overlay { display: none; }
.video-card.has-error .error-overlay { display: flex; }

/* ========== Drag Overlay (phase 7) ========== */
.drag-overlay {
    display: none;
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(10, 13, 20, 0.85);
    backdrop-filter: blur(4px);
    align-items: center; justify-content: center;
    border: 3px dashed #ef4444;
}
.drag-overlay.is-active { display: flex; }
body.drag-over .drag-overlay { display: flex; }

/* ========== Resize Handles (phase 16) ========== */
.resize-handle { flex-shrink: 0; position: relative; z-index: 10; background: transparent; transition: background 0.15s; }
.resize-handle--vertical { width: 6px; cursor: col-resize; }
.resize-handle--vertical:hover { background: rgba(239, 68, 68, 0.08); }
.resize-handle--vertical .resize-handle__line {
    position: absolute; top: 0; bottom: 0; left: 2px; width: 2px;
    background: #2a3143; border-radius: 1px; transition: background 0.15s;
}
.resize-handle--vertical:hover .resize-handle__line { background: #ef4444; }
.resize-handle--horizontal { height: 6px; cursor: row-resize; }
.resize-handle--horizontal .resize-handle__line {
    position: absolute; left: 0; right: 0; top: 2px; height: 2px;
    background: #2a3143; border-radius: 1px;
}
.resize-handle--horizontal:hover .resize-handle__line { background: #ef4444; }
.resize-handle.is-dragging .resize-handle__line { background: #ef4444; }

/* ========== Panel Hidden (phase 16) ========== */
.panel-hidden {
    flex: 0 0 0 !important;
    overflow: hidden;
    padding: 0 !important;
    margin: 0 !important;
    opacity: 0;
    pointer-events: none;
}

/* ========== Toast (phase 7) ========== */
#toast-container {
    position: fixed; bottom: 1rem; right: 1rem; z-index: 9999;
    display: flex; flex-direction: column; gap: 0.5rem;
    pointer-events: none;
}
.toast {
    pointer-events: auto;
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    background: white; color: #1e293b;
    border: 1px solid #e2e8f0;
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    animation: toast-slide-in 0.3s ease-out;
    max-width: 400px;
}
.dark .toast {
    background: #1e293b; color: #f8fafc;
    border-color: #334155;
}
.toast--success { border-left: 3px solid #22c55e; }
.toast--error { border-left: 3px solid #ef4444; }
.toast--warning { border-left: 3px solid #eab308; }
.toast--info { border-left: 3px solid #3b82f6; }

@keyframes toast-slide-in {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
@keyframes toast-slide-out {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
}

/* ========== Reduced Motion ========== */
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}

/* ========== Focus Visible ========== */
:focus-visible {
    outline: 2px solid #ef4444;
    outline-offset: 2px;
}
```

---

## Step 4: Create Placeholder JS Files

Create empty placeholder files for all module directories. Each file should contain a comment documenting its purpose:

**`core/state.js`**:
```js
// KartData Global State Manager
// Pub/Sub pattern for reactive UI updates
// Phase 0: Placeholder — state lives in global variables initially
// Later phases: migrate to getter/setter + subscription pattern
export const state = {};
```

**`core/math.js`**:
```js
// KartData Math Utilities
// Haversine distance, data smoothing, gate intersection
export function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {}
export function deg2rad(deg) {}
export function smoothData(data, windowSize) {}
export function intersects(a, b, c, d, p, q, r, s) {}
```

Create similar placeholders for all other modules (empty exports, just documenting their future role).

---

## Step 5: Create `app.js` Bootstrapper

Create `C:\Users\Chaitanya Jain\Desktop\CJ\MyDev\KartData\src\app.js`:

```js
// KartData Application Bootstrapper
// Import all modules and initialize the application

// Phase 0: Minimal bootstrap — just confirms the DOM is ready
// Later phases: import and wire all module inits

import { initMap, setupEventListeners } from './modules/mapping/map.js';
import { state } from './core/state.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('KartData v3 — Precision Telemetry Suite');
    
    // Initialize core modules
    initMap();
    setupEventListeners();
    
    // Auto-detect dark mode
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
    }
    
    console.log('KartData ready — waiting for telemetry data...');
});
```

For early phases (1-6), all code will be inline in `index.html`'s `<script>` tag for simplicity. The module system is activated from phase 7+ when the codebase grows large enough to warrant splitting.

---

## Step 6: Create `todo.md`

Create `C:\Users\Chaitanya Jain\Desktop\CJ\MyDev\KartData\todo.md`:

```markdown
# KartData — Implementation Tracker

## Current Phase: 0 (Project Setup)

- [x] Create directory structure
- [x] Create index.html with all CDN dependencies
- [x] Create styles/global.css with all custom styles
- [x] Create placeholder JS module files
- [x] Create app.js bootstrapper
- [x] Verify page loads without errors in browser

## Phase Plan References

| Phase | File | Status |
|---|---|---|
| 00 — Project Setup | `project_plan_v3/phase_00_project_setup.md` | ✅ Done |
| 01 — Core CSV + Map | `project_plan_v3/phase_01_core_csv_map.md` | ⬜ |
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
```

---

## Step 7: Verification

Test that the project loads correctly:

1. **Start a local server** in the project root:
   ```bash
   npx serve src
   # or
   python -m http.server 8080 -d src
   # or use VS Code "Live Server" extension on src/index.html
   ```

2. **Open in browser** at the local server URL (e.g., `http://localhost:3000` or `http://localhost:8080`).

3. **Verify the following in browser DevTools Console:**
   - No 404 errors for any CDN resource
   - No JavaScript errors on load
   - Console shows: `KartData v3 — Precision Telemetry Suite`
   - `tailwind`, `L`, `Plotly`, `Papa`, `MP4Box` are all defined in global scope

4. **Verify visual appearance:**
   - Dark mode by default (if `prefers-color-scheme: dark`) or light mode
   - Header visible with logo "KARTDATA", upload buttons, theme toggle
   - Empty state visible in main area (checkered flag icon + upload prompt)
   - Sidebar NOT visible (hidden by default)
   - Playback bar NOT visible (hidden by default)
   - Toggle theme button → colors switch, moon/sun icon swaps

5. **Verify localStorage is accessible** (for future phases):
   ```js
   localStorage.setItem('kartdata-test', 'ok');
   console.log(localStorage.getItem('kartdata-test')); // 'ok'
   localStorage.removeItem('kartdata-test');
   ```

---

## Files Created in This Phase

| File | Purpose |
|---|---|
| `src/index.html` | Main HTML scaffold with all CDN dependencies and DOM structure |
| `src/styles/global.css` | All custom CSS (scrollbar, range, checkbox, video card, resize handles, toast, panel hidden, focus, reduced motion) |
| `src/core/state.js` | Placeholder — future global state manager |
| `src/core/math.js` | Placeholder — future math utilities |
| `src/modules/extractor/mp4box.js` | Placeholder |
| `src/modules/extractor/csvBuilder.js` | Placeholder |
| `src/modules/extractor/parseCSV.js` | Placeholder |
| `src/modules/mapping/map.js` | Placeholder |
| `src/modules/mapping/gate.js` | Placeholder |
| `src/modules/charts/plots.js` | Placeholder |
| `src/modules/charts/sync.js` | Placeholder |
| `src/modules/video/uploader.js` | Placeholder |
| `src/modules/video/player.js` | Placeholder |
| `src/modules/ui/layout.js` | Placeholder |
| `src/modules/ui/theme.js` | Placeholder |
| `src/modules/ui/playback.js` | Placeholder |
| `src/modules/ui/lapList.js` | Placeholder |
| `src/modules/ui/toast.js` | Placeholder |
| `src/modules/ui/shortcuts.js` | Placeholder |
| `src/modules/ui/bookmarks.js` | Placeholder |
| `src/modules/ui/settings.js` | Placeholder |
| `src/modules/ui/dataTable.js` | Placeholder |
| `src/app.js` | Application bootstrapper |
| `todo.md` | Implementation tracker |

---

**Proceed to Phase 01** when the page loads without errors and shows the empty state with header.
