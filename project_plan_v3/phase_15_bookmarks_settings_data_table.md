# Phase 15: Bookmarks, Settings & Data Table — Marker System, Preferences Panel, Raw Telemetry Table

**Builds on:** Phase 14 (sectors, A-B loop work)

**Goal:** Bookmark system for marking interesting points. Settings/preferences panel persisted in localStorage. Raw telemetry data table view.

---

## Features & Implementation Specs

### 1. Bookmark / Marker System

#### 1.1 State

```js
let bookmarks = []; // Array<{ id, name, time, distance, lapIndex, note }>
```

**Bookmark object:**

| Property | Type | Description |
|---|---|---|
| `id` | string | Unique ID (`'bm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)`) |
| `name` | string | Auto-generated "Bookmark N" or user-entered name |
| `time` | float | Absolute session time in seconds at bookmark position |
| `distance` | float | Absolute session distance in meters at bookmark position |
| `lapIndex` | integer | Which lap the bookmark belongs to (or 0) |
| `note` | string | Optional user note (empty string by default) |

#### 1.2 Add Bookmark

```js
const BOOKMARK_MAX = 50;

function addBookmark() {
    if (bookmarks.length >= BOOKMARK_MAX) {
        showToast('warning', `Maximum ${BOOKMARK_MAX} bookmarks reached. Remove existing bookmarks to add more.`);
        return;
    }

    const currentValue = playbackState.currentValue;
    const mode = playbackState.mode;

    // Find the nearest point in rawData
    let nearestPoint = null;
    for (const lap of lapsData) {
        for (const p of lap) {
            const pos = mode === 'distance' ? p.lapDistance : (p.time - lap[0].time);
            if (Math.abs(pos - currentValue) < 0.5) { // within 0.5 units
                nearestPoint = p;
                break;
            }
        }
        if (nearestPoint) break;
    }

    const bookmark = {
        id: 'bm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: `Bookmark ${bookmarks.length + 1}`,
        time: nearestPoint?.time || currentValue,
        distance: nearestPoint?.totalDistance || currentValue,
        lapIndex: nearestPoint?.lap || 0,
        note: ''
    };

    bookmarks.push(bookmark);
    renderBookmarks();
    updateBookmarkAnnotations();
    showToast('success', `Bookmark "${bookmark.name}" added.`);
}
```

**Trigger methods:**
- Press `B` key → `addBookmark()` (keyboard shortcut from Appendix B)
- Click bookmark icon in sidebar
- Right-click on chart → "Add Bookmark Here" context menu option

```js
// In handleContextAction:
case 'add-bookmark-here':
    if (target.type === 'chart') {
        // Use the x-axis value from the click event
        const clickValue = target.clickXValue;
        if (clickValue !== undefined) {
            // Temporarily seek to that x-value to get context
            const prevValue = playbackState.currentValue;
            manualSeek(clickValue);
            addBookmark();
            manualSeek(prevValue);
        }
    }
    break;
```

#### 1.3 Bookmark Display — Sidebar List

```html
<div id="bookmarks-section" class="mt-2 border-t border-gray-200 dark:border-gray-800 pt-2">
    <button id="bookmarks-toggle" class="flex items-center justify-between w-full px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
        <span>Bookmarks</span>
        <i class="ph ph-caret-down text-sm transition-transform duration-200" id="bookmarks-chevron"></i>
    </button>
    <div id="bookmarks-content" class="max-h-48 overflow-y-auto">
        <!-- Dynamic bookmark list -->
    </div>
</div>
```

```js
function renderBookmarks() {
    const container = document.getElementById('bookmarks-content');
    if (!container) return;

    if (bookmarks.length === 0) {
        container.innerHTML = `<div class="px-2 py-3 text-xs text-gray-400 dark:text-gray-600 text-center">No bookmarks yet.<br>Press <kbd class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-mono">B</kbd> to add one.</div>`;
        return;
    }

    container.innerHTML = bookmarks.map((bm, i) => `
        <div class="bookmark-item flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors group" data-bookmark-id="${bm.id}">
            <i class="ph-fill ph-bookmark text-[#b138ff] text-xs flex-shrink-0"></i>
            <div class="flex-1 min-w-0">
                <span class="text-xs font-semibold text-gray-700 dark:text-gray-300 bookmark-name" data-id="${bm.id}">${bm.name}</span>
                <span class="text-[10px] text-gray-400 dark:text-gray-500 ml-1 font-mono">
                    ${formatTime(bm.time)} / ${bm.distance.toFixed(0)}m
                </span>
                <span class="text-[10px] text-gray-500">L${bm.lapIndex + 1}</span>
            </div>
            <button class="bookmark-delete opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all p-0.5" data-id="${bm.id}" title="Delete bookmark">
                <i class="ph ph-x text-sm"></i>
            </button>
        </div>
    `).join('');

    // Click to seek
    container.querySelectorAll('.bookmark-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.bookmark-delete')) return;
            const id = el.dataset.bookmarkId;
            seekToBookmark(id);
        });
    });

    // Delete button
    container.querySelectorAll('.bookmark-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeBookmark(btn.dataset.id);
        });
    });

    // Double-click to rename
    container.querySelectorAll('.bookmark-name').forEach(span => {
        span.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const id = span.dataset.id;
            const currentName = span.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'text-xs font-semibold bg-transparent border-b border-brand-400 outline-none text-gray-700 dark:text-gray-300 w-full';
            input.style.fontFamily = 'inherit';

            span.replaceWith(input);
            input.focus();
            input.select();

            input.addEventListener('blur', () => {
                const newName = input.value.trim() || currentName;
                renameBookmark(id, newName);
            });

            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    input.blur();
                } else if (ev.key === 'Escape') {
                    input.value = currentName;
                    input.blur();
                }
            });
        });
    });
}
```

#### 1.4 Bookmark CRUD

```js
function removeBookmark(id) {
    const idx = bookmarks.findIndex(b => b.id === id);
    if (idx === -1) return;
    const name = bookmarks[idx].name;
    bookmarks.splice(idx, 1);
    renderBookmarks();
    updateBookmarkAnnotations();
    showToast('info', `Bookmark "${name}" removed.`);
}

function renameBookmark(id, newName) {
    const bm = bookmarks.find(b => b.id === id);
    if (!bm) return;
    bm.name = newName;
    renderBookmarks();
    updateBookmarkAnnotations();
}

function seekToBookmark(id) {
    const bm = bookmarks.find(b => b.id === id);
    if (!bm) return;
    const seekValue = playbackState.mode === 'distance' ? bm.distance : bm.time;
    manualSeek(seekValue);
}
```

#### 1.5 Bookmark Annotations on Charts

Add triangle/pin markers as Plotly shapes on all chart x-axes at bookmark positions.

```js
function updateBookmarkAnnotations() {
    // For each visible chart div
    document.querySelectorAll('[id^="chart-"]').forEach(chartDiv => {
        const shapes = [];
        const annotations = [];

        bookmarks.forEach((bm, i) => {
            const x = playbackState.mode === 'distance' ? bm.distance : bm.time;

            // Vertical line shape
            shapes.push({
                type: 'line',
                x0: x,
                x1: x,
                y0: 0,
                y1: 1,
                yref: 'paper',
                line: {
                    color: 'rgba(177,56,255,0.4)',
                    width: 1,
                    dash: 'dot'
                }
            });

            // Triangle marker from x-axis
            annotations.push({
                x: x,
                y: 0,
                yref: 'paper',
                yshift: -15,
                text: `▼`,
                font: { color: '#b138ff', size: 12 },
                showarrow: false,
                hovertext: `${bm.name}: ${formatTime(bm.time)} / ${bm.distance.toFixed(0)}m`
            });
        });

        Plotly.relayout(chartDiv, {
            shapes: shapes,
            annotations: annotations
        });
    });
}

// Call updateBookmarkAnnotations() after each chart render
```

#### 1.6 Bookmark Pins on Map

```js
let bookmarkMarkerLayer = null;

function renderBookmarkMapPins() {
    if (bookmarkMarkerLayer) {
        map.removeLayer(bookmarkMarkerLayer);
    }
    bookmarkMarkerLayer = L.layerGroup().addTo(map);

    bookmarks.forEach(bm => {
        // Find lat/lon from rawData at the bookmark's time/distance
        let nearestPoint = null;
        for (const lap of lapsData) {
            for (const p of lap) {
                if (Math.abs(p.time - bm.time) < 0.1 || Math.abs(p.totalDistance - bm.distance) < 1) {
                    nearestPoint = p;
                    break;
                }
            }
            if (nearestPoint) break;
        }

        if (!nearestPoint) return;

        const pinIcon = L.divIcon({
            className: 'bookmark-pin',
            html: `<div style="
                width: 24px; height: 24px;
                background: #b138ff;
                border: 2px solid white;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                cursor: pointer;
            "><span style="
                transform: rotate(45deg);
                color: white;
                font-size: 10px;
                font-weight: 900;
                font-family: JetBrains Mono, monospace;
            ">★</span></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 24]
        });

        const marker = L.marker([nearestPoint.lat, nearestPoint.lon], { icon: pinIcon });
        marker.bindPopup(`
            <div style="font-family: Inter, sans-serif; font-size: 12px;">
                <strong>${bm.name}</strong><br>
                Time: ${formatTime(bm.time)}<br>
                Distance: ${bm.distance.toFixed(0)}m<br>
                Lap: ${bm.lapIndex + 1}
            </div>
        `);

        marker.on('click', () => {
            seekToBookmark(bm.id);
        });

        bookmarkMarkerLayer.addLayer(marker);
    });
}

// Call renderBookmarkMapPins() alongside updateBookmarkAnnotations() and renderBookmarks()
```

#### 1.7 Clear Bookmarks on New Session

```js
function clearBookmarks() {
    bookmarks = [];
    renderBookmarks();
    if (bookmarkMarkerLayer) {
        map.removeLayer(bookmarkMarkerLayer);
        bookmarkMarkerLayer = null;
    }
    // Clear chart annotations
    document.querySelectorAll('[id^="chart-"]').forEach(chartDiv => {
        Plotly.relayout(chartDiv, { shapes: [], annotations: [] });
    });
}

// Call clearBookmarks() in resetAllData()
```

### 2. Settings / Preferences Panel

#### 2.1 DOM Structure

```html
<div id="settings-overlay" class="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm hidden transition-opacity duration-300" aria-hidden="true">
    <div id="settings-drawer" class="fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-white dark:bg-gray-900 shadow-2xl transform translate-x-0 transition-transform duration-300 overflow-y-auto" role="dialog" aria-label="Settings">
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
            <h2 class="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Settings</h2>
            <button id="settings-close" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1" aria-label="Close settings">
                <i class="ph ph-x text-lg"></i>
            </button>
        </div>
        <div class="p-4 space-y-5">
            <!-- Default Playback Speed -->
            <div class="space-y-1">
                <label class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Default Playback Speed</label>
                <select id="setting-speed" class="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                    <option value="0.25">0.25x</option>
                    <option value="0.5">0.5x</option>
                    <option value="1" selected>1.0x</option>
                    <option value="2">2.0x</option>
                    <option value="4">4.0x</option>
                    <option value="8">8.0x</option>
                </select>
            </div>

            <!-- Default Mode -->
            <div class="space-y-1">
                <label class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Default Mode</label>
                <div class="flex gap-2">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="setting-mode" value="distance" class="text-brand-400 focus:ring-brand-400">
                        <span class="text-sm text-gray-700 dark:text-gray-300">Distance</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="setting-mode" value="time" checked class="text-brand-400 focus:ring-brand-400">
                        <span class="text-sm text-gray-700 dark:text-gray-300">Time</span>
                    </label>
                </div>
            </div>

            <!-- Default Smoothing Window -->
            <div class="space-y-1">
                <label class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Default Smoothing Window</label>
                <div class="flex items-center gap-3">
                    <input type="range" id="setting-smoothing" min="0" max="20" value="0" step="1" class="flex-1">
                    <span id="setting-smoothing-value" class="text-sm font-mono text-gray-600 dark:text-gray-400 w-6 text-right">0</span>
                </div>
            </div>

            <!-- Map Tile Preference -->
            <div class="space-y-1">
                <label class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Map Tiles</label>
                <select id="setting-map-tiles" class="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                    <option value="dark">Dark (CartoDB)</option>
                    <option value="light">Light (OpenStreetMap)</option>
                    <option value="satellite">Satellite</option>
                </select>
            </div>

            <!-- Chart Line Thickness -->
            <div class="space-y-1">
                <label class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Chart Line Thickness</label>
                <div class="flex items-center gap-3">
                    <input type="range" id="setting-line-thickness" min="1" max="5" value="2.5" step="0.5" class="flex-1">
                    <span id="setting-line-thickness-value" class="text-sm font-mono text-gray-600 dark:text-gray-400 w-6 text-right">2.5</span>
                </div>
            </div>

            <!-- Video HUD Always On -->
            <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Video HUD Always On</label>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="setting-hud-always-on" class="sr-only peer">
                    <div class="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-400"></div>
                </label>
            </div>

            <!-- Auto-Loop -->
            <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Auto-Loop</label>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="setting-auto-loop" checked class="sr-only peer">
                    <div class="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-400"></div>
                </label>
            </div>
        </div>
    </div>
</div>
```

#### 2.2 Persistence

```js
const SETTINGS_KEY = 'kartdata-settings';

const defaultSettings = {
    playbackSpeed: 1.0,
    mode: 'time',
    smoothing: 0,
    mapTiles: 'dark',
    lineThickness: 2.5,
    hudAlwaysOn: false,
    autoLoop: true
};

let userSettings = { ...defaultSettings };

function loadSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            userSettings = { ...defaultSettings, ...parsed };
        }
    } catch (e) {
        // Corrupt settings — use defaults
        userSettings = { ...defaultSettings };
    }
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(userSettings));
    } catch (e) {
        // localStorage full or unavailable — silently fail
    }
}

function applySettings() {
    // Apply playback speed
    const speedSelect = document.getElementById('playback-speed');
    if (speedSelect) speedSelect.value = String(userSettings.playbackSpeed);
    playbackState.baseSpeed = userSettings.playbackSpeed;

    // Apply mode
    if (userSettings.mode === 'distance') {
        document.getElementById('mode-dist')?.click();
    } else {
        document.getElementById('mode-time')?.click();
    }

    // Apply smoothing
    const smoothSlider = document.getElementById('smoothing-slider');
    if (smoothSlider) {
        smoothSlider.value = String(userSettings.smoothing);
        currentSmoothing = userSettings.smoothing;
        document.getElementById('smoothing-value').textContent = userSettings.smoothing;
    }

    // Apply map tiles (handled by toggleTheme or direct tile swap)
    if (userSettings.mapTiles !== (isDarkMode ? 'dark' : 'light')) {
        // Swap tiles if needed
    }

    // Apply auto-loop
    if (!userSettings.autoLoop) {
        // Disable auto-loop by setting loopMode to 'full' and preventing auto-restart
    }
}

function openSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    // Populate UI from current settings
    document.getElementById('setting-speed').value = String(userSettings.playbackSpeed);
    document.querySelector(`input[name="setting-mode"][value="${userSettings.mode}"]`).checked = true;
    document.getElementById('setting-smoothing').value = userSettings.smoothing;
    document.getElementById('setting-smoothing-value').textContent = userSettings.smoothing;
    document.getElementById('setting-map-tiles').value = userSettings.mapTiles;
    document.getElementById('setting-line-thickness').value = userSettings.lineThickness;
    document.getElementById('setting-line-thickness-value').textContent = userSettings.lineThickness;
    document.getElementById('setting-hud-always-on').checked = userSettings.hudAlwaysOn;
    document.getElementById('setting-auto-loop').checked = userSettings.autoLoop;
}

function closeSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');

    // Collect values
    userSettings.playbackSpeed = parseFloat(document.getElementById('setting-speed').value);
    userSettings.mode = document.querySelector('input[name="setting-mode"]:checked')?.value || 'time';
    userSettings.smoothing = parseInt(document.getElementById('setting-smoothing').value);
    userSettings.mapTiles = document.getElementById('setting-map-tiles').value;
    userSettings.lineThickness = parseFloat(document.getElementById('setting-line-thickness').value);
    userSettings.hudAlwaysOn = document.getElementById('setting-hud-always-on').checked;
    userSettings.autoLoop = document.getElementById('setting-auto-loop').checked;

    saveSettings();
    applySettings();
}
```

#### 2.3 Event Wiring

```js
// Gear icon triggers open
document.getElementById('settings-gear')?.addEventListener('click', openSettings);

// Close button
document.getElementById('settings-close')?.addEventListener('click', closeSettings);

// Click outside drawer (on overlay) closes
document.getElementById('settings-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
});

// Esc key closes settings
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('settings-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            closeSettings();
            e.preventDefault();
        }
    }
});

// Live preview while adjusting
document.getElementById('setting-smoothing')?.addEventListener('input', (e) => {
    document.getElementById('setting-smoothing-value').textContent = e.target.value;
});
document.getElementById('setting-line-thickness')?.addEventListener('input', (e) => {
    document.getElementById('setting-line-thickness-value').textContent = e.target.value;
});
```

#### 2.4 Load Settings on Boot

```js
// In DOMContentLoaded handler:
loadSettings();
// Apply settings after initMap and before first updateVisualization
```

### 3. Data Table View

#### 3.1 Toggle Button

```html
<!-- In header or main area toolbar -->
<button id="toggle-data-table" class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors
    text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800
    data-active="false" aria-label="Toggle data table">
    <i class="ph ph-table text-sm mr-1"></i> Data
</button>
```

#### 3.2 Data Table Container

```html
<div id="data-table-view" class="hidden flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 overflow-hidden">
    <div class="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div class="flex items-center gap-2">
            <i class="ph ph-table text-sm text-gray-400"></i>
            <span class="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Data Table</span>
        </div>
        <div class="flex items-center gap-2">
            <input type="text" id="data-table-search" placeholder="Filter..." class="w-40 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded font-mono text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none focus:border-brand-400">
            <button id="data-table-export" class="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" title="Export visible rows as CSV">
                <i class="ph ph-download-simple text-sm"></i>
            </button>
            <button id="data-table-close" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5" aria-label="Close data table">
                <i class="ph ph-x text-sm"></i>
            </button>
        </div>
    </div>
    <div class="flex-1 overflow-auto" id="data-table-scroll">
        <table id="data-table" class="w-full text-[11px] font-mono border-collapse">
            <thead class="sticky top-0 z-10">
                <tr class="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th class="data-th px-2 py-1 text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap" data-col="index">#</th>
                    <th class="data-th px-2 py-1 text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap" data-col="lat">Lat</th>
                    <th class="data-th px-2 py-1 text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap" data-col="lon">Lon</th>
                    <th class="data-th px-2 py-1 text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap" data-col="speed">Speed</th>
                    <th class="data-th px-2 py-1 text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap" data-col="time">Time</th>
                    <th class="data-th px-2 py-1 text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap" data-col="lap">Lap</th>
                    <th class="data-th px-2 py-1 text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap" data-col="lapDistance">Lap Dist</th>
                    <th class="data-th px-2 py-1 text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap" data-col="totalDistance">Total Dist</th>
                </tr>
            </thead>
            <tbody id="data-table-body">
                <!-- Dynamic rows -->
            </tbody>
        </table>
    </div>
</div>
```

#### 3.3 Build and Render

```js
let dataTableSortKey = 'index';
let dataTableSortAsc = true;
let dataTableFilter = '';

function buildDataTableRows() {
    const filteredLaps = getSelectedLaps();
    const lapIndices = new Set(filteredLaps.map(l => l.index));

    const rows = [];
    lapsData.forEach((lap, lapIdx) => {
        if (!lapIndices.has(lapIdx)) return;

        lap.forEach((point, pointIdx) => {
            rows.push({
                index: point.index ?? pointIdx,
                lat: point.lat,
                lon: point.lon,
                speed: point.speed,
                time: point.time,
                lap: lapIdx + 1,
                lapDistance: point.lapDistance,
                totalDistance: point.totalDistance
            });
        });
    });

    // Apply filter
    if (dataTableFilter) {
        const q = dataTableFilter.toLowerCase();
        return rows.filter(r =>
            String(r.index).includes(q) ||
            String(r.lat).includes(q) ||
            String(r.lon).includes(q) ||
            String(r.speed).includes(q) ||
            String(r.time).includes(q) ||
            String(r.lap).includes(q) ||
            String(r.lapDistance.toFixed(1)).includes(q) ||
            String(r.totalDistance.toFixed(1)).includes(q)
        );
    }

    return rows;
}

function renderDataTable() {
    let rows = buildDataTableRows();

    // Sort
    rows.sort((a, b) => {
        const aVal = a[dataTableSortKey];
        const bVal = b[dataTableSortKey];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return dataTableSortAsc ? cmp : -cmp;
    });

    const tbody = document.getElementById('data-table-body');
    if (!tbody) return;

    tbody.innerHTML = rows.map((r, i) => `
        <tr class="${i % 2 === 0 ? 'bg-transparent' : 'bg-gray-50/50 dark:bg-gray-800/30'} hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors border-b border-gray-100 dark:border-gray-800/30">
            <td class="px-2 py-0.5 text-gray-500 dark:text-gray-400">${r.index}</td>
            <td class="px-2 py-0.5 text-gray-600 dark:text-gray-300">${r.lat.toFixed(6)}</td>
            <td class="px-2 py-0.5 text-gray-600 dark:text-gray-300">${r.lon.toFixed(6)}</td>
            <td class="px-2 py-0.5 text-right font-semibold text-gray-700 dark:text-gray-200">${r.speed.toFixed(1)}</td>
            <td class="px-2 py-0.5 text-right text-gray-600 dark:text-gray-400 font-mono">${r.time.toFixed(3)}</td>
            <td class="px-2 py-0.5 text-right text-gray-500 dark:text-gray-400">${r.lap}</td>
            <td class="px-2 py-0.5 text-right text-gray-600 dark:text-gray-400">${r.lapDistance.toFixed(1)}</td>
            <td class="px-2 py-0.5 text-right text-gray-600 dark:text-gray-400">${r.totalDistance.toFixed(1)}</td>
        </tr>
    `).join('');
}

function toggleDataTableView() {
    const dataTable = document.getElementById('data-table-view');
    const chartsColumn = document.getElementById('charts-column');
    if (!dataTable || !chartsColumn) return;

    const isOpen = !dataTable.classList.contains('hidden');
    if (isOpen) {
        // Close data table, show charts
        dataTable.classList.add('hidden');
        dataTable.classList.remove('flex');
        chartsColumn.classList.remove('hidden');
    } else {
        // Show data table, hide charts
        chartsColumn.classList.add('hidden');
        dataTable.classList.remove('hidden');
        dataTable.classList.add('flex');
        renderDataTable();
        // Trigger resize for map
        setTimeout(() => map?.invalidateSize(), 50);
    }

    // Update button state
    const btn = document.getElementById('toggle-data-table');
    if (btn) {
        btn.dataset.active = String(!isOpen);
        btn.classList.toggle('text-brand-400', !isOpen);
        btn.classList.toggle('dark:text-brand-400', !isOpen);
    }
}
```

#### 3.4 Sortable Column Headers

```js
document.getElementById('data-table')?.addEventListener('click', (e) => {
    const th = e.target.closest('.data-th');
    if (!th) return;

    const col = th.dataset.col;
    if (col === dataTableSortKey) {
        dataTableSortAsc = !dataTableSortAsc;
    } else {
        dataTableSortKey = col;
        dataTableSortAsc = true;
    }

    // Update header indicators
    document.querySelectorAll('.data-th').forEach(h => {
        h.classList.remove('text-brand-400');
    });
    th.classList.add('text-brand-400');

    renderDataTable();
});
```

#### 3.5 Filter Input

```js
document.getElementById('data-table-search')?.addEventListener('input', (e) => {
    dataTableFilter = e.target.value;
    renderDataTable();
});
```

#### 3.6 Export to CSV

```js
document.getElementById('data-table-export')?.addEventListener('click', () => {
    const rows = buildDataTableRows();

    if (rows.length === 0) {
        showToast('warning', 'No data rows to export.');
        return;
    }

    const headers = ['Index', 'Lat', 'Lon', 'Speed (km/h)', 'Time (s)', 'Lap', 'Lap Distance (m)', 'Total Distance (m)'];
    const csvRows = [headers.join(',')];

    rows.forEach(r => {
        csvRows.push([
            r.index,
            r.lat.toFixed(6),
            r.lon.toFixed(6),
            r.speed.toFixed(1),
            r.time.toFixed(3),
            r.lap,
            r.lapDistance.toFixed(1),
            r.totalDistance.toFixed(1)
        ].join(','));
    });

    const csvText = csvRows.join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'telemetry_data_table.csv';
    link.click();
    URL.revokeObjectURL(url);

    showToast('success', `Exported ${rows.length} rows.`);
});
```

#### 3.7 Close

```js
document.getElementById('data-table-close')?.addEventListener('click', () => {
    const dataTable = document.getElementById('data-table-view');
    const chartsColumn = document.getElementById('charts-column');
    if (dataTable) {
        dataTable.classList.add('hidden');
        dataTable.classList.remove('flex');
    }
    if (chartsColumn) chartsColumn.classList.remove('hidden');
    const btn = document.getElementById('toggle-data-table');
    if (btn) {
        btn.dataset.active = 'false';
        btn.classList.remove('text-brand-400', 'dark:text-brand-400');
    }
});
```

---

## State Variables Added

| Variable | Type | Initial | Description |
|---|---|---|---|
| `bookmarks` | Array | `[]` | Array of bookmark objects |
| `bookmarkMarkerLayer` | L.LayerGroup | `null` | Leaflet layer group for bookmark pin markers |
| `userSettings` | Object | `{...defaults}` | User preferences loaded from localStorage |
| `dataTableSortKey` | string | `'index'` | Current data table sort column |
| `dataTableSortAsc` | boolean | `true` | Current data table sort direction |
| `dataTableFilter` | string | `''` | Current data table search/filter string |

---

## Functions Added / Modified

| Function | Change |
|---|---|
| `addBookmark()` | NEW — creates bookmark at current playback position |
| `removeBookmark(id)` | NEW — removes a bookmark by ID |
| `renameBookmark(id, newName)` | NEW — renames a bookmark |
| `seekToBookmark(id)` | NEW — seeks playback to a bookmark's position |
| `renderBookmarks()` | NEW — renders bookmark list in sidebar |
| `updateBookmarkAnnotations()` | NEW — updates Plotly shapes/annotations for all bookmarks |
| `renderBookmarkMapPins()` | NEW — renders bookmark pin markers on map |
| `clearBookmarks()` | NEW — clears all bookmarks |
| `loadSettings()` | NEW — loads settings from localStorage |
| `saveSettings()` | NEW — saves settings to localStorage |
| `applySettings()` | NEW — applies all settings to UI and behavior |
| `openSettings()` | NEW — opens settings drawer |
| `closeSettings()` | NEW — closes settings drawer and saves |
| `buildDataTableRows()` | NEW — builds filtered data rows from selected laps |
| `renderDataTable()` | NEW — renders raw telemetry data table |
| `toggleDataTableView()` | NEW — toggles between data table and chart view |
| `resetAllData()` | MODIFIED — calls `clearBookmarks()` |
| `renderCharts()` | MODIFIED — calls `updateBookmarkAnnotations()` after render |
| `renderMap()` | MODIFIED — calls `renderBookmarkMapPins()` after polylines |

---

## Testing Instructions

1. After Phase 14, press `B` → bookmark created with auto-name "Bookmark 1", toast confirmed
2. Pin marker appears on map (purple diamond pin with ★), vertical dotted line on all chart x-axes
3. Bookmark appears in sidebar "Bookmarks" collapsible list with name, time, distance, lap number
4. Click bookmark in sidebar list → playback seeks to that position
5. Click bookmark pin on map → popup shows bookmark info, clicking popup seeks to position
6. Right-click on chart → "Add Bookmark Here" context menu option → bookmark at clicked x-value
7. Double-click bookmark name → inline edit field appears → type new name → press Enter → name updates
8. Click × on bookmark → bookmark removed
9. Click gear icon in header → settings drawer slides open from right
10. Change default speed to 2x, close settings → speed selector defaults to 2.0x
11. Close settings, reload page → speed defaults to 2.0x (persisted)
12. Toggle "Data" button → data table replaces charts column, shows sortable columns with all telemetry points from selected laps
13. Search in data table filter input → rows filter in real-time by any column value
14. Click column headers (e.g. "Speed") → rows sort by that column ascending; click again → descending
15. Click "Export to CSV" → downloads `telemetry_data_table.csv` with visible rows
16. Close data table → charts column returns
17. All previous functionality (sectors, A-B loop, reference lap, statistics, map interactions) still works
