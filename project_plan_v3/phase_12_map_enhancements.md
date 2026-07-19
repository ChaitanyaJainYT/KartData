# Phase 12: Map Enhancements — Click to Seek, Speed Heatmap, GPS Display, Gate Badge, Draggable Endpoints, Context Menus

**Builds on:** Phase 11 (keyboard shortcuts work)

**Goal:** Click map to seek playback position. Speed heatmap on track. GPS coordinate display. Gate mode badge. Draggable gate endpoints. Right-click context menus.

---

## Features & Implementation Specs

### 1. Click Map to Seek Playback

On map click (when NOT in gate drawing mode), find the nearest GPS point across all laps to the clicked lat/lon.

```js
function findNearestPoint(latlng) {
    let minDist = Infinity, nearest = null;

    for (const lap of lapsData) {
        for (const p of lap) {
            const d = getDistanceFromLatLonInM(latlng.lat, latlng.lng, p.lat, p.lon);
            if (d < minDist) {
                minDist = d;
                nearest = { point: p, lapIndex: lapsData.indexOf(lap) };
            }
        }
    }

    return { point: nearest?.point || null, lapIndex: nearest?.lapIndex || 0, distance: minDist };
}
```

**Map click handler:**

```js
// In setupMapEventListeners or initMap:
map.on('click', (e) => {
    if (isDrawingGate) return; // Don't seek while drawing gate

    const result = findNearestPoint(e.latlng);

    if (!result.point || result.distance > 50) {
        // Beyond 50m threshold — do nothing
        return;
    }

    // Pause playback first
    if (playbackState.isPlaying) togglePlayback();

    // Seek to the nearest point
    if (typeof manualSeek === 'function') {
        const seekValue = playbackState.mode === 'distance'
            ? result.point.lapDistance
            : result.point.time;
        manualSeek(seekValue);
    }

    // Show brief pulse animation at click location
    showPulseAnimation(e.latlng);
});

function showPulseAnimation(latlng) {
    const pulse = L.circleMarker(latlng, {
        radius: 15,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.6,
        weight: 2,
        opacity: 1
    }).addTo(map);

    // Animate: reduce opacity and grow slightly over 500ms
    const startTime = performance.now();
    const duration = 500;

    function animatePulse(time) {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic

        pulse.setStyle({
            radius: 15 + ease * 10,
            opacity: 1 - ease,
            fillOpacity: (1 - ease) * 0.6
        });

        if (progress < 1) {
            requestAnimationFrame(animatePulse);
        } else {
            map.removeLayer(pulse);
        }
    }

    requestAnimationFrame(animatePulse);
}
```

### 2. Speed Heatmap on Track

Instead of solid-color polylines, color-code track segments by speed. Toggleable via a small button on the map corner.

#### 2.1 Speed Color Mapping

```js
function getSpeedColor(speed, minSpeed, maxSpeed) {
    const range = maxSpeed - minSpeed || 1;
    const ratio = (speed - minSpeed) / range;

    if (ratio < 0.2) return '#ef4444';  // Slow: Red
    if (ratio < 0.7) return '#eab308';  // Medium: Yellow
    return '#22c55e';                    // Fast: Green
}
```

#### 2.2 Render Speed Heatmap

```js
let speedHeatmapActive = false;

function renderSpeedHeatmap(lapsToRender) {
    if (!speedHeatmapActive) {
        // Render solid color polylines (default, existing logic)
        renderSolidMapPolylines(lapsToRender);
        return;
    }

    // Remove existing polylines/ghost layer
    if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }

    ghostLayer = L.layerGroup().addTo(map);

    lapsToRender.forEach((item) => {
        const { lap, index } = item;
        const color = COLORS[index % COLORS.length];

        if (lap.length < 5) return;

        // Compute speed range for this lap
        const speeds = lap.map(p => p.speed);
        const minSpeed = Math.min(...speeds);
        const maxSpeed = Math.max(...speeds);

        // Break into segments of ~5 GPS points
        const segmentSize = 5;
        for (let i = 0; i < lap.length - segmentSize; i += segmentSize) {
            const segment = lap.slice(i, i + segmentSize + 1);
            const avgSpeed = segment.reduce((sum, p) => sum + p.speed, 0) / segment.length;
            const segColor = getSpeedColor(avgSpeed, minSpeed, maxSpeed);

            const latlngs = segment.map(p => [p.lat, p.lon]);
            L.polyline(latlngs, {
                color: segColor,
                weight: 3,
                opacity: 0.9,
                smoothFactor: 1
            }).addTo(ghostLayer);
        }
    });
}

function renderSolidMapPolylines(lapsToRender) {
    if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }

    ghostLayer = L.layerGroup().addTo(map);

    lapsToRender.forEach((item) => {
        const { lap, index } = item;
        const color = COLORS[index % COLORS.length];
        const latlngs = lap.map(p => [p.lat, p.lon]);

        L.polyline(latlngs, {
            color: color,
            weight: 3,
            opacity: 0.9,
            smoothFactor: 1
        }).addTo(ghostLayer);
    });
}
```

#### 2.3 Toggle Button on Map

```js
// In initMap(), after other controls:
const HeatmapControl = L.Control.extend({
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        container.innerHTML = `
            <a id="speed-heatmap-btn" href="#" title="Toggle Speed Heatmap" role="button"
               class="leaflet-control-heatmap" style="
                width: 30px; height: 30px; line-height: 30px;
                display: flex; align-items: center; justify-content: center;
                background: white; color: #333; font-size: 14px;
                border-radius: 2px; cursor: pointer;
            ">
                <i class="ph ph-speedometer"></i>
            </a>
        `;
        container.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            speedHeatmapActive = !speedHeatmapActive;
            const btn = document.getElementById('speed-heatmap-btn');
            const icon = btn?.querySelector('.ph');
            if (icon) {
                icon.style.color = speedHeatmapActive ? '#3b82f6' : '#333';
            }
            renderSpeedHeatmap(getSelectedLaps());
        });
        return container;
    }
});

new HeatmapControl({ position: 'topright' }).addTo(map);
```

### 3. GPS Coordinate Display

Small overlay at map bottom-left that updates on mousemove:

```js
// In initMap():
const CoordControl = L.Control.extend({
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'coord-display');
        container.innerHTML = `<span class="coord-text">--, --</span>`;
        container.style.cssText = `
            background: rgba(0,0,0,0.7);
            color: #fff;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 4px;
            white-space: nowrap;
            backdrop-filter: blur(4px);
        `;
        return container;
    }
});

const coordControl = new CoordControl({ position: 'bottomleft' }).addTo(map);

map.on('mousemove', (e) => {
    // Hide during gate drawing (stepText replaces it)
    if (isDrawingGate) {
        coordControl.getContainer().style.display = 'none';
        return;
    }

    coordControl.getContainer().style.display = '';
    const text = coordControl.getContainer().querySelector('.coord-text');
    if (text) {
        text.textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
    }
});
```

### 4. Gate Drawing Mode Badge

When `isDrawingGate === true`, show a floating badge at map top-center:

```js
let gateBadge = null;

function showGateBadge() {
    if (gateBadge) return;

    gateBadge = L.control({ position: 'topcenter' });

    gateBadge.onAdd = function() {
        const div = L.DomUtil.create('div', 'gate-badge');
        div.innerHTML = `<div class="bg-red-600/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg z-[1000] whitespace-nowrap">
            Gate Drawing Mode — Click to place points · Esc to cancel
        </div>`;
        return div;
    };

    gateBadge.addTo(map);
}

function hideGateBadge() {
    if (gateBadge) {
        map.removeControl(gateBadge);
        gateBadge = null;
    }
}
```

**Integration with existing gate drawing flow:**

```js
// When starting gate drawing:
isDrawingGate = true;
showGateBadge();

// When gate is locked or cancelled:
isDrawingGate = false;
hideGateBadge();
```

**Note:** Leaflet does not natively support `'topcenter'` position. Implement it via CSS:

```css
.leaflet-top.leaflet-center {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    pointer-events: none;
}

.gate-badge {
    pointer-events: auto;
}
```

Or use a simple absolute-positioned div outside of Leaflet controls:

```js
// Alternative — use a DOM overlay instead of Leaflet control:
function showGateBadge() {
    const existing = document.getElementById('gate-badge');
    if (existing) return;

    const badge = document.createElement('div');
    badge.id = 'gate-badge';
    badge.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none';
    badge.innerHTML = `<div class="bg-red-600/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg whitespace-nowrap pointer-events-auto">
        Gate Drawing Mode — Click to place points · Esc to cancel
    </div>`;
    document.body.appendChild(badge);
}

function hideGateBadge() {
    const badge = document.getElementById('gate-badge');
    if (badge) badge.remove();
}
```

### 5. Draggable Gate Endpoints

After gate is set, both `gatePoints` are rendered as L.circleMarker with `draggable: true`.

```js
function renderDraggableGateEndpoints() {
    // Remove existing draggable markers
    if (window.gateMarkers) {
        gateMarkers.forEach(m => map.removeLayer(m));
    }
    gateMarkers = [];

    gatePoints.forEach((point, i) => {
        const marker = L.circleMarker(point, {
            radius: 8,
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.8,
            weight: 2,
            draggable: true
        }).addTo(map);

        marker.bindTooltip('Drag to adjust', {
            permanent: false,
            direction: 'top',
            offset: [0, -10]
        });

        marker.on('dragstart', () => {
            marker.closeTooltip();
        });

        marker.on('dragend', (e) => {
            const newPos = e.target.getLatLng();
            gatePoints[i] = [newPos.lat, newPos.lng];

            // Redraw gate line
            if (gateLayer) {
                map.removeLayer(gateLayer);
            }
            gateLayer = L.polyline(gatePoints, {
                color: '#ef4444',
                weight: 5,
                opacity: 1
            }).addTo(map);

            // Recalculate laps in real-time
            if (typeof calculateLapsWithGate === 'function') {
                calculateLapsWithGate();
                updateVisualization();
            }

            showToast('info', 'Gate endpoint adjusted. Laps recalculated.');
        });

        gateMarkers.push(marker);
    });
}
```

**Integration with existing gate flow:**

```js
// Modify the gate completion function to also call renderDraggableGateEndpoints:
function onGateComplete() {
    // ... existing gate lock logic ...

    if (gatePoints.length === 2) {
        renderDraggableGateEndpoints();
    }
}

// When gate is reset, also clean up markers:
function cleanupGateMarkers() {
    if (window.gateMarkers) {
        gateMarkers.forEach(m => map.removeLayer(m));
        gateMarkers = [];
    }
}
```

### 6. Right-Click Context Menus

#### 6.1 Context Menu Container

```html
<div id="context-menu" class="hidden fixed z-[2000] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl py-1 min-w-[180px] overflow-hidden">
    <!-- Dynamically populated -->
</div>
```

#### 6.2 Context Menu Core

```js
let contextMenuTarget = null; // Stores { type: 'lap'|'chart', index, element }

function showContextMenu(e, items) {
    e.preventDefault();
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    menu.innerHTML = items.map(item => `
        <button class="context-menu-item flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                data-action="${item.action}">
            <i class="${item.icon} text-base text-gray-400 w-5"></i>
            ${item.label}
        </button>
    `).join('');

    // Position menu at mouse
    const x = Math.min(e.clientX, window.innerWidth - 190);
    const y = Math.min(e.clientY, window.innerHeight - menu.children.length * 40 - 10);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');

    // Handle menu item clicks
    menu.querySelectorAll('.context-menu-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (contextMenuTarget) {
                handleContextAction(action, contextMenuTarget);
            }
            hideContextMenu();
        });
    });
}

function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.classList.add('hidden');
    contextMenuTarget = null;
}

// Global click to dismiss
document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu();
});
```

#### 6.3 Lap List Context Menu

```js
// On each lap row in the sidebar:
document.querySelectorAll('.lap-row').forEach(row => {
    row.addEventListener('contextmenu', (e) => {
        const lapIndex = parseInt(row.dataset.lapIndex);
        contextMenuTarget = { type: 'lap', index: lapIndex, element: row };

        showContextMenu(e, [
            { label: 'Set as Reference',     icon: 'ph ph-star',          action: 'set-reference' },
            { label: 'Hide Others',          icon: 'ph ph-eye-slash',     action: 'hide-others' },
            { label: 'Export Lap Data',      icon: 'ph ph-download-simple', action: 'export-lap-csv' }
        ]);
    });
});
```

**Action handlers:**

```js
function handleContextAction(action, target) {
    switch (action) {
        case 'set-reference':
            // Phase 13 — show placeholder toast for now
            showToast('info', `Set Lap ${target.index + 1} as reference (Phase 13).`);
            break;

        case 'hide-others':
            // Uncheck all laps except this one
            document.querySelectorAll('.lap-checkbox').forEach(cb => {
                const idx = parseInt(cb.dataset.lapIndex);
                const shouldCheck = idx === target.index;
                cb.checked = shouldCheck;
                if (shouldCheck) {
                    selectedLapIndices.add(idx);
                } else {
                    selectedLapIndices.delete(idx);
                }
                syncTracesAcrossCharts(idx, shouldCheck);
            });
            selectedLapIndices = new Set([target.index]);
            updateVisualization();
            showToast('info', `Showing only Lap ${target.index + 1}.`);
            break;

        case 'export-lap-csv':
            exportSingleLapCSV(target.index);
            break;
    }
}

function exportSingleLapCSV(lapIndex) {
    const lap = lapsData[lapIndex];
    if (!lap || lap.length === 0) {
        showToast('error', 'No data for this lap.');
        return;
    }

    const headers = Object.keys(lap[0]).filter(k => k !== '__proto__');
    const csvRows = [headers.join(',')];

    lap.forEach(point => {
        csvRows.push(headers.map(h => {
            const val = point[h];
            return val === null || val === undefined ? '' : String(val);
        }).join(','));
    });

    const csvText = csvRows.join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lap_${lapIndex + 1}_data.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('success', `Lap ${lapIndex + 1} data exported.`);
}
```

#### 6.4 Chart Context Menu

```js
document.querySelectorAll('.chart-body').forEach(chartBody => {
    chartBody.addEventListener('contextmenu', (e) => {
        const section = chartBody.closest('.chart-section');
        const chartType = section?.dataset.chartType || 'unknown';
        contextMenuTarget = { type: 'chart', chartType, element: chartBody };

        showContextMenu(e, [
            { label: 'Export as PNG', icon: 'ph ph-download-simple', action: 'export-png' }
        ]);
    });
});

// In handleContextAction:
case 'export-png':
    if (target.type === 'chart' && target.element) {
        const chartId = target.element.id;
        Plotly.toImage(chartId, { format: 'png', width: 1200, height: 600 }).then(url => {
            const link = document.createElement('a');
            link.download = `chart-${target.chartType}-${Date.now()}.png`;
            link.href = url;
            link.click();
            showToast('success', 'Chart exported.');
        }).catch(err => {
            showToast('error', 'Export failed: ' + err.message);
        });
    }
    break;
```

---

## State Variables Added

| Variable | Type | Initial | Description |
|---|---|---|---|
| `speedHeatmapActive` | boolean | `false` | Toggle state for speed heatmap rendering |
| `gateBadge` | L.Control / DOM | `null` | Reference to gate drawing mode badge |
| `gateMarkers` | Array | `[]` | Draggable L.circleMarker instances for gate endpoints |
| `contextMenuTarget` | Object | `null` | `{ type, index, chartType, element }` for context menu action dispatch |

---

## Functions Added / Modified

| Function | Change |
|---|---|
| `findNearestPoint(latlng)` | NEW — finds nearest GPS point within 50m threshold |
| `showPulseAnimation(latlng)` | NEW — brief pulse animation at click location |
| `getSpeedColor(speed, min, max)` | NEW — maps speed to red/yellow/green |
| `renderSpeedHeatmap(laps)` | NEW — renders speed-color-coded track segments |
| `renderSolidMapPolylines(laps)` | NEW — renders default solid-color polylines |
| `showGateBadge()` | NEW — shows "Gate Drawing Mode" badge at map top-center |
| `hideGateBadge()` | NEW — removes gate drawing mode badge |
| `renderDraggableGateEndpoints()` | NEW — renders draggable circle markers for gate endpoints |
| `cleanupGateMarkers()` | NEW — removes gate endpoint markers |
| `showContextMenu(e, items)` | NEW — positions and populates custom context menu |
| `hideContextMenu()` | NEW — dismisses context menu |
| `handleContextAction(action, target)` | NEW — dispatches context menu actions |
| `exportSingleLapCSV(lapIndex)` | NEW — downloads CSV of a single lap's data |
| `initMap()` | MODIFIED — adds CoordControl, HeatmapControl, click handler |
| `onGateComplete()` | MODIFIED — calls `renderDraggableGateEndpoints()` |
| `resetGate()` | MODIFIED — calls `cleanupGateMarkers()` and `hideGateBadge()` |

---

## Testing Instructions

1. After Phase 11, click on a track polyline on the map → playback seeks to that point, brief blue pulse animation appears and fades over 500ms
2. Click on empty map space (not on track, more than 50m from any point) → nothing happens, no seek
3. Click the speedometer icon button on the top-right of the map → track changes from solid color per-lap to speed gradient (red=slow, yellow=medium, green=fast)
4. Click the speedometer icon again → track reverts to solid color polylines
5. Move mouse over map → GPS coordinate display at bottom-left updates in real-time with format `lat, lon` to 6 decimal places
6. Draw a gate by clicking two points → "Gate Drawing Mode — Click to place points · Esc to cancel" badge appears at map top-center
7. Press Esc during gate drawing → badge disappears, toast "Gate drawing cancelled."
8. After gate is set, hover over a gate endpoint → tooltip "Drag to adjust" appears
9. Drag a gate endpoint → gate line redraws, laps recalculate in real-time
10. Right-click on a lap in the sidebar → context menu appears with "Set as Reference", "Hide Others", "Export Lap Data"
11. Click "Hide Others" in lap context menu → all other laps unchecked, only that lap visible
12. Click "Export Lap Data" → CSV file downloads containing only that lap's data
13. Right-click on any chart → context menu with "Export as PNG" appears
14. Click "Export as PNG" on chart context menu → PNG downloads with filename `chart-{type}-{timestamp}.png`
15. Click anywhere outside context menu → menu dismisses
16. All previous functionality (keyboard shortcuts, crosshair, legend sync, export buttons, ResizeObserver, sidebar collapse) still works
