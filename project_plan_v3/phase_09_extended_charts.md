# Phase 9: Extended Charts — Altitude, G-Forces, G-G Diagram

**Builds on:** Phase 8 (all data flows work, 2 core charts exist)
**Deliverable:** 4 new chart types (Altitude, Lateral G, Longitudinal G, G-G Diagram). Collapsible chart sections with "+ Add Chart" dropdown. Extended zoom sync across all distance-based charts. Use `Plotly.react()` for performance.

---

## Goal

Add comprehensive telemetry analysis beyond speed: elevation profile, cornering forces, braking/acceleration analysis, and a G-G Diagram (friction circle). Users can toggle which charts are visible via a "+ Add Chart" menu. All distance-based charts share synchronized X-axis zoom.

---

## Features & Implementation Specs

### 1. Chart Section HTML Structure

Each chart is wrapped in a collapsible section below the 2 core charts in `#dashboard-content`:

```html
<div class="p-4 pt-0 space-y-4" id="extended-charts-container">
    <!-- Dynamically rendered chart sections appear here -->
</div>
```

Each chart section template:

```html
<div class="chart-section bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden"
     data-chart-type="{type}" data-visible="{true|false}">
    <div class="chart-header flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors select-none">
        <div class="flex items-center gap-2">
            <span class="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">{chartName}</span>
        </div>
        <div class="flex items-center gap-1">
            <button class="chart-export p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all" title="Export as PNG" aria-label="Export chart as PNG">
                <i class="ph ph-download-simple text-sm"></i>
            </button>
            <button class="chart-toggle p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all" title="Toggle chart" aria-label="Toggle chart visibility">
                <i class="ph ph-caret-down text-sm"></i>
            </button>
        </div>
    </div>
    <div class="chart-body" id="chart-{type}" style="height: 300px;"></div>
</div>
```

Default visibility:
- `chart-speed-dist`: always visible (core chart, existing)
- `chart-speed-time`: always visible (core chart, existing)
- `chart-altitude`: hidden by default
- `chart-lateral-g`: hidden by default
- `chart-longitudinal-g`: hidden by default
- `chart-gg-diagram`: hidden by default

---

### 2. "+ Add Chart" Dropdown

Below the visible charts, add a dropdown to select new chart types to display:

```html
<div class="relative px-4 pb-4" id="add-chart-container">
    <button id="add-chart-btn"
            class="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-all text-sm font-semibold w-full justify-center">
        <i class="ph ph-plus-circle text-lg"></i>
        Add Chart
        <i class="ph ph-caret-down text-sm ml-1"></i>
    </button>
    <div id="add-chart-menu"
         class="hidden absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl z-20 overflow-hidden">
        <!-- Dynamically populated with available chart types -->
    </div>
</div>
```

#### JavaScript Behavior

```js
const CHART_TYPES = [
    { id: 'altitude',     name: 'Altitude vs Distance',     icon: 'ph-trend-up' },
    { id: 'lateral-g',    name: 'Lateral G vs Distance',    icon: 'ph-arrows-left-right' },
    { id: 'longitudinal-g', name: 'Longitudinal G vs Distance', icon: 'ph-arrows-out-line-horizontal' },
    { id: 'gg-diagram',   name: 'G-G Diagram',              icon: 'ph-target' }
];

let visibleChartTypes = new Set(); // Track which extended charts are visible

function renderAddChartMenu() {
    const menu = document.getElementById('add-chart-menu');
    const hiddenCharts = CHART_TYPES.filter(ct => !visibleChartTypes.has(ct.id));

    if (hiddenCharts.length === 0) {
        menu.innerHTML = `<div class="px-4 py-3 text-xs text-gray-400 text-center">All charts are visible</div>`;
        return;
    }

    menu.innerHTML = hiddenCharts.map(ct => `
        <button class="add-chart-option flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                data-chart-type="${ct.id}">
            <i class="${ct.icon} text-base text-gray-400"></i>
            ${ct.name}
        </button>
    `).join('');

    menu.querySelectorAll('.add-chart-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.chartType;
            addChart(type);
            document.getElementById('add-chart-menu').classList.add('hidden');
        });
    });
}

function addChart(type) {
    // If we already have 4 charts visible, remove the least-recently-used one
    if (visibleChartTypes.size >= 4) {
        // Remove the first (oldest) visible chart
        const firstType = visibleChartTypes.values().next().value;
        removeChart(firstType);
    }
    visibleChartTypes.add(type);
    renderExtendedCharts();
    renderAddChartMenu();
}

function removeChart(type) {
    visibleChartTypes.delete(type);
    const section = document.querySelector(`.chart-section[data-chart-type="${type}"]`);
    if (section) section.remove();
    renderAddChartMenu();
}
```

#### Toggle Button Behavior

- Clicking the chevron on a visible chart's header collapses that section (hides chart-body)
- When collapsed, the chart type becomes available again in the "+ Add Chart" menu
- Clicking "+ Add Chart" on a collapsed chart type re-shows it (restores to visible set)

```js
// Chart toggle (collapse/expand)
document.querySelectorAll('.chart-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const section = btn.closest('.chart-section');
        const body = section.querySelector('.chart-body');
        const icon = btn.querySelector('.ph');
        const type = section.dataset.chartType;

        const isCollapsed = body.style.display === 'none';
        body.style.display = isCollapsed ? 'block' : 'none';
        icon.className = isCollapsed ? 'ph ph-caret-down text-sm' : 'ph ph-caret-right text-sm';
        visibleChartTypes[isCollapsed ? 'add' : 'delete'](type);
        renderAddChartMenu();

        // Plotly resize after expand
        if (isCollapsed) {
            setTimeout(() => Plotly.Plots.resize(`chart-${type}`), 100);
        }
    });
});

// Chart header click also toggles (for quick collapse)
document.querySelectorAll('.chart-section .chart-header').forEach(header => {
    header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // Don't toggle if button clicked
        header.querySelector('.chart-toggle')?.click();
    });
});
```

---

### 3. Chart Type Implementations

All extended charts live in `renderCharts()` or a new `renderExtendedCharts()` function called from `updateVisualization()`.

#### 3.1 Altitude vs Distance

```js
function buildAltitudeTrace(lap, index) {
    const color = COLORS[index % COLORS.length];
    const altitudes = lap.map(d => d.alt || null); // alt from rawData if available
    // If no raw altitude data, skip or show flat line
    return {
        x: lap.map(d => d.lapDistance),
        y: altitudes,
        mode: 'lines',
        name: `Lap ${index + 1}`,
        line: { width: 2, color: color },
        hovertemplate: '<b>%{y:.1f} m</b><br>Dist: %{x:.1f} m<extra></extra>'
    };
}
```

- Y-axis: Altitude (m), title `'Altitude (m)'`
- X-axis: Lap Distance (m)
- If no altitude data (`d.alt` is undefined for CSV uploads), show a toast warning and skip
- For extracted telemetry, `alt` comes from GPS9 `alt` field (`int32/1000` → meters)

#### 3.2 Lateral G vs Distance

Lateral acceleration computed from GPS path curvature and speed:

```js
function computeLateralG(lap) {
    const gValues = [];
    for (let i = 1; i < lap.length - 1; i++) {
        const p0 = lap[i - 1], p1 = lap[i], p2 = lap[i + 1];

        // Compute radius of curvature from three consecutive GPS points
        const a = getDistanceFromLatLonInM(p0.lat, p0.lon, p1.lat, p1.lon);
        const b = getDistanceFromLatLonInM(p1.lat, p1.lon, p2.lat, p2.lon);
        const c = getDistanceFromLatLonInM(p0.lat, p0.lon, p2.lat, p2.lon);

        // Heron's formula for area
        const s = (a + b + c) / 2;
        const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));

        // Radius = (a * b * c) / (4 * area)
        let radius = (area === 0) ? Infinity : (a * b * c) / (4 * area);

        // Determine turn direction (left/right) using cross product
        const dLat1 = p1.lat - p0.lat, dLon1 = p1.lon - p0.lon;
        const dLat2 = p2.lat - p1.lat, dLon2 = p2.lon - p1.lon;
        const cross = dLat1 * dLon2 - dLon1 * dLat2;
        const sign = cross >= 0 ? 1 : -1;

        // Lateral G = v² / (r * g)
        const vMS = p1.speedMS; // speed in m/s
        const latG = (radius === Infinity || vMS === 0) ? 0 : (vMS * vMS) / (radius * 9.81);

        gValues.push({
            lapDistance: p1.lapDistance,
            latG: sign * latG
        });
    }
    return gValues;
}
```

- Y-axis: `'Lateral G'`, positive = left turns, negative = right turns
- X-axis: Lap Distance (m)
- If ACCL data is available from extraction, prefer raw ACCL values (transformed to G) over computed

#### 3.3 Longitudinal G vs Distance

Longitudinal acceleration from speed derivative:

```js
function computeLongitudinalG(lap) {
    const gValues = [];
    for (let i = 1; i < lap.length; i++) {
        const pPrev = lap[i - 1], pCurr = lap[i];
        const dt = pCurr.time - pPrev.time;
        if (dt <= 0) continue;

        const dv = pCurr.speedMS - pPrev.speedMS; // m/s change
        const lonG = dv / (dt * 9.81); // G = (dv/dt) / g

        gValues.push({
            lapDistance: pCurr.lapDistance,
            lonG: lonG
        });
    }
    return gValues;
}
```

- Y-axis: `'Longitudinal G'`, positive = acceleration, negative = braking
- X-axis: Lap Distance (m)

#### 3.4 G-G Diagram (Friction Circle)

```js
function buildGGDiagram(lapsToRender) {
    const traces = [];

    lapsToRender.forEach((item) => {
        const { lap, index } = item;
        const color = COLORS[index % COLORS.length];
        const latGData = computeLateralG(lap);
        const lonGData = computeLongitudinalG(lap);

        // Align data points (use lapDistance as join key)
        const points = [];
        latGData.forEach(lg => {
            const match = lonGData.find(lo => Math.abs(lo.lapDistance - lg.lapDistance) < 0.5);
            if (match) {
                points.push({
                    latG: lg.latG,
                    lonG: match.lonG,
                    speed: getSpeedAtDistance(lap, lg.lapDistance)
                });
            }
        });

        if (points.length === 0) return;

        traces.push({
            x: points.map(p => p.latG),
            y: points.map(p => p.lonG),
            mode: 'markers',
            type: 'scattergl',
            name: `Lap ${index + 1}`,
            marker: {
                size: 4,
                color: points.map(p => p.speed),
                colorscale: [
                    [0, '#3b82f6'],      // slow = blue
                    [0.33, '#22c55e'],   // medium = green
                    [0.66, '#eab308'],   // fast = yellow
                    [1, '#ef4444']       // very fast = red
                ],
                colorbar: { title: 'Speed (km/h)', thickness: 10, len: 0.5 },
                showscale: index === 0 // only show colorbar for first lap
            },
            hovertemplate: 'Lat G: %{x:.2f}<br>Lon G: %{y:.2f}<br>Speed: %{marker.color:.1f} km/h<extra></extra>'
        });
    });

    // Reference circle at 1.0G radius
    const theta = Array.from({ length: 73 }, (_, i) => (i / 72) * 2 * Math.PI);
    traces.push({
        x: theta.map(t => 1.0 * Math.cos(t)),
        y: theta.map(t => 1.0 * Math.sin(t)),
        mode: 'lines',
        name: '1.0G Reference',
        line: { color: 'rgba(148, 163, 184, 0.4)', width: 1, dash: 'dash' },
        hoverinfo: 'none',
        showlegend: true
    });

    // Axes equal scaling
    const maxAbs = Math.max(1.2, ...points.map(p => Math.max(Math.abs(p.latG), Math.abs(p.lonG))));

    return {
        traces,
        layout: {
            xaxis: { title: { text: 'Lateral G' }, range: [-maxAbs, maxAbs], scaleanchor: 'y', scaleratio: 1 },
            yaxis: { title: { text: 'Longitudinal G' }, range: [-maxAbs, maxAbs] }
        }
    };
}

function getSpeedAtDistance(lap, dist) {
    const pt = lap.find(p => p.lapDistance >= dist);
    return pt ? pt.speed : 0;
}
```

- X-axis: Lateral G (constrained to equal scale with Y)
- Y-axis: Longitudinal G (constrained to equal scale with X)
- Points colored by speed: blue (slow) → green → yellow → red (fast)
- Dashed reference circle at 1.0G radius
- Uses `scattergl` for WebGL-accelerated rendering (better performance with many points)

---

### 4. Extended Chart Rendering

```js
function renderExtendedCharts() {
    const container = document.getElementById('extended-charts-container');
    const lapsToRender = getSelectedLaps();
    if (lapsToRender.length === 0) return;

    const fontColor = isDarkMode ? '#cbd5e1' : '#475569';
    const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
    const axisFont = { family: 'Inter, sans-serif', size: 11, color: fontColor };
    const config = { responsive: true, displayModeBar: false };

    const layoutCommon = {
        margin: { t: 20, r: 20, l: 45, b: 35 },
        hovermode: 'closest',
        showlegend: true,
        legend: { orientation: 'h', y: 1.2, x: 1, xanchor: 'right', font: axisFont },
        plot_bgcolor: 'transparent',
        paper_bgcolor: 'transparent',
        font: { family: 'Inter, sans-serif', color: fontColor },
        xaxis: { title: { text: 'Distance (m)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false },
        hoverlabel: { bgcolor: isDarkMode ? '#1e293b' : '#ffffff', font: { color: isDarkMode ? '#f8fafc' : '#0f172a' }, bordercolor: gridColor }
    };

    visibleChartTypes.forEach(type => {
        let traces = [];
        let layout = { ...layoutCommon };

        lapsToRender.forEach((item) => {
            const { lap, index } = item;
            const color = COLORS[index % COLORS.length];

            switch (type) {
                case 'altitude': {
                    const altData = lap.map(d => d.alt !== undefined ? d.alt : null);
                    if (altData.every(a => a === null)) return; // no altitude data
                    traces.push({
                        x: lap.map(d => d.lapDistance),
                        y: altData,
                        mode: 'lines',
                        name: `Lap ${index + 1}`,
                        line: { width: 2, color },
                        hovertemplate: '<b>%{y:.1f} m</b><br>Dist: %{x:.1f} m<extra></extra>'
                    });
                    layout.yaxis = { title: { text: 'Altitude (m)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false };
                    layout.title = { text: 'Altitude vs Distance', font: { size: 13, weight: 600 }, x: 0 };
                    break;
                }
                case 'lateral-g': {
                    const latG = computeLateralG(lap);
                    traces.push({
                        x: latG.map(d => d.lapDistance),
                        y: latG.map(d => d.latG),
                        mode: 'lines',
                        name: `Lap ${index + 1}`,
                        line: { width: 2, color },
                        hovertemplate: '<b>%{y:.2f} G</b><br>Dist: %{x:.1f} m<extra></extra>'
                    });
                    layout.yaxis = { title: { text: 'Lateral G', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false, zeroline: true, zerolinecolor: gridColor };
                    layout.title = { text: 'Lateral G vs Distance', font: { size: 13, weight: 600 }, x: 0 };
                    break;
                }
                case 'longitudinal-g': {
                    const lonG = computeLongitudinalG(lap);
                    traces.push({
                        x: lonG.map(d => d.lapDistance),
                        y: lonG.map(d => d.lonG),
                        mode: 'lines',
                        name: `Lap ${index + 1}`,
                        line: { width: 2, color },
                        hovertemplate: '<b>%{y:.2f} G</b><br>Dist: %{x:.1f} m<extra></extra>'
                    });
                    layout.yaxis = { title: { text: 'Longitudinal G', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false, zeroline: true, zerolinecolor: gridColor };
                    layout.title = { text: 'Longitudinal G vs Distance', font: { size: 13, weight: 600 }, x: 0 };
                    break;
                }
                case 'gg-diagram': {
                    // Handled separately below
                    break;
                }
            }
        });

        if (type === 'gg-diagram') {
            const gg = buildGGDiagram(lapsToRender);
            traces = gg.traces;
            layout = { ...layoutCommon, ...gg.layout };
            layout.title = { text: 'G-G Diagram (Friction Circle)', font: { size: 13, weight: 600 }, x: 0 };
        }

        if (traces.length === 0) return;

        const chartId = `chart-${type}`;
        const existingEl = document.getElementById(chartId);

        if (existingEl && existingEl.data) {
            // Use Plotly.react() to update in place (better performance)
            Plotly.react(chartId, traces, layout, config);
        } else if (existingEl) {
            Plotly.newPlot(chartId, traces, layout, config);
        }
    });
}
```

---

### 5. Zoom Sync Extension

Extend `setupZoomSyncEngine` to handle all distance-based charts (not just the 2 core charts):

```js
function setupZoomSyncEngine() {
    const distanceChartIds = ['chart-speed-dist', 'chart-altitude', 'chart-lateral-g', 'chart-longitudinal-g'];
    // chart-speed-time uses time X-axis, chart-gg-diagram uses G-G axes

    distanceChartIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.on('plotly_relayout', (eventData) => {
            if (isRelayouting) return;
            if (!eventData || !eventData['xaxis.range[0]']) return;

            isRelayouting = true;
            const xStart = eventData['xaxis.range[0]'];
            const xEnd = eventData['xaxis.range[1]'];

            // Sync all other distance-based charts
            distanceChartIds.forEach(targetId => {
                if (targetId === id) return;
                const targetEl = document.getElementById(targetId);
                if (!targetEl || !targetEl.layout) return;
                Plotly.relayout(targetId, {
                    'xaxis.range[0]': xStart,
                    'xaxis.range[1]': xEnd
                });
            });

            isRelayouting = false;
        });
    });

    // Speed-vs-Time zoom sync (existing, uses time mapping)
    const timeChart = document.getElementById('chart-speed-time');
    if (timeChart) {
        timeChart.on('plotly_relayout', (eventData) => {
            if (isRelayouting) return;
            isRelayouting = true;
            // Map time zoom to distance charts (same logic as Phase 5/6)
            synchronizeTimeToDistanceZoom(eventData);
            isRelayouting = false;
        });
    }
}
```

Y-axis zoom is synced only between charts with the same unit:
- Speed charts (km/h): `chart-speed-dist`, `chart-speed-time`
- G-force charts (G): `chart-lateral-g`, `chart-longitudinal-g`

---

### 6. Chart Export (PNG Download)

Each chart header has a download button:

```js
// In setupEventListeners or chart creation:
document.querySelectorAll('.chart-export').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const section = btn.closest('.chart-section');
        const chartId = section.querySelector('.chart-body').id;
        const chartName = section.dataset.chartType;

        Plotly.toImage(chartId, { format: 'png', width: 1200, height: 700 }).then(url => {
            const link = document.createElement('a');
            link.href = url;
            link.download = `kartdata_${chartName}.png`;
            link.click();
        }).catch(err => {
            showToast('error', 'Failed to export chart: ' + err.message);
        });
    });
});
```

---

### 7. Integration with `updateVisualization()`

Modify `updateVisualization()` to also call `renderExtendedCharts()`:

```js
function updateVisualization() {
    const lapsToRender = getSelectedLaps();
    renderCharts(lapsToRender);          // Core charts (speed-vs-dist, speed-vs-time)
    renderExtendedCharts(lapsToRender);  // Extended charts (altitude, G-forces, G-G)
    renderMap(lapsToRender);
    renderVideoMonitorGrid(lapsToRender);
    updateScrubberScalingBoundaries(lapsToRender);
}
```

---

### 8. Theme Support

All extended charts use the same theme-aware colors as core charts:

```js
const fontColor = isDarkMode ? '#cbd5e1' : '#475569';
const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
```

On `toggleTheme()`, extended charts are re-rendered via `renderExtendedCharts()` (called by `updateVisualization()`).

---

### 9. State Variables Added

| Variable | Type | Initial | Description |
|---|---|---|---|
| `visibleChartTypes` | Set | `new Set()` | Set of chart type IDs currently visible: `'altitude'`, `'lateral-g'`, `'longitudinal-g'`, `'gg-diagram'` |
| `CHART_TYPES` | Array | (constant) | Metadata for all available chart types |

---

### 10. Functions Added / Modified

| Function | Change |
|---|---|
| `renderExtendedCharts()` | NEW — renders visible extended chart types using Plotly.react() |
| `buildAltitudeTrace(lap, index)` | NEW — creates altitude trace |
| `computeLateralG(lap)` | NEW — computes lateral G from GPS curvature + speed |
| `computeLongitudinalG(lap)` | NEW — computes longitudinal G from speed derivative |
| `buildGGDiagram(lapsToRender)` | NEW — builds G-G scatter with speed coloring + reference circle |
| `renderAddChartMenu()` | NEW — populates the "+ Add Chart" dropdown with hidden chart types |
| `addChart(type)` | NEW — adds a chart type to visible set, re-renders |
| `removeChart(type)` | NEW — removes a chart from display |
| `setupZoomSyncEngine()` | MODIFIED — extended to cover all distance-based charts |
| `updateVisualization()` | MODIFIED — now calls `renderExtendedCharts()` |
| `toggleTheme()` | MODIFIED — extended charts re-render with new theme |

---

## Testing Instructions

1. **After Phase 8**, upload data (CSV or video-extracted) → 2 core speed charts visible
2. Click "+ Add Chart" dropdown → menu shows "Altitude vs Distance", "Lateral G vs Distance", "Longitudinal G vs Distance", "G-G Diagram"
3. Click "Altitude vs Distance" → altitude chart appears below core charts with elevation profile (requires altitude data from extraction or CSV with alt column)
4. Click "+ Add Chart" → select "G-G Diagram" → friction circle appears with color-coded dots (blue→green→yellow→red by speed) and dashed 1.0G reference circle
5. Click "+ Add Chart" → select "Lateral G vs Distance" → lateral G trace appears, positive values for left turns, negative for right turns
6. Add all 4 charts → only 4 visible (oldest auto-removed if limit reached)
7. **Zoom sync**: Zoom on Speed vs Distance chart → Altitude, Lateral G, and Longitudinal G charts X-axis zoom synchronize
8. **Collapse**: Click chevron on a chart header → chart body collapses, chart type reappears in "+ Add Chart" menu
9. Expand collapsed chart via "+ Add Chart" → chart re-renders with data
10. **Export**: Click download icon on any chart header → PNG file downloads
11. **Theme switch**: Toggle dark/light mode → all charts re-render with correct theme colors
12. **Hover tooltip**: Hover on G-G Diagram → tooltip shows Lateral G, Longitudinal G, and Speed values
13. **Lap selection**: Uncheck a lap in sidebar → chart traces update to show only selected laps
14. **Smoothing**: Change smoothing slider → speed charts smooth, extended charts remain unaffected (they use raw data)
15. All previous functionality (upload, playback, video sync, gate drawing, toasts, drag-drop) still works
