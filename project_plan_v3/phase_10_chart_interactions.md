# Phase 10: Chart Interactions — Unified Crosshair, Clickable Legend, PNG Export, ResizeObserver

**Builds on:** Phase 9 (all 6 chart types exist)

**Goal:** Unified crosshair across all charts during hover. Clickable chart legend that syncs with sidebar checkboxes. PNG export per chart. ResizeObserver for container-aware chart sizing.

---

## Features & Implementation Specs

### 1. Unified Vertical Crosshair

Change Plotly `hovermode` from `'closest'` to `'x unified'` on all distance-based charts. When user hovers over any chart, a vertical line spans all charts at that x position, showing a unified tooltip with all trace values (Lap name, Speed, Distance, Time, Lat/Lon, G-forces).

**Implementation:** This is a Plotly built-in feature (`hovermode: 'x unified'`). All charts with the same x-axis domain get the crosshair sync automatically.

**Changes needed:**
- In `renderCharts()` and `renderExtendedCharts()`, change `hovermode: 'closest'` to `hovermode: 'x unified'` for all distance-based charts.
- For G-G Diagram (different axes): keep `hovermode: 'closest'`.

```js
// In layoutCommon:
const layoutCommon = {
    margin: { t: 20, r: 20, l: 45, b: 35 },
    hovermode: 'x unified',  // Changed from 'closest'
    // ...
};

// G-G Diagram layout overrides:
layout.hovermode = 'closest'; // Keep G-G on closest
```

### 2. Clickable Chart Legend

Each Plotly chart has `showlegend: true` with horizontal legend at top. Clicking a legend item toggles that trace's visibility (`plotly_restyle` event).

#### 2.1 Legend Configuration

```js
// Uniform legend config for all charts:
legend: {
    orientation: 'h',
    y: 1.2,
    x: 1,
    xanchor: 'right',
    font: axisFont,
    itemclick: 'toggle',       // Plotly built-in toggle on click
    itemdoubleclick: 'toggle'  // Same behavior on double-click
}
```

#### 2.2 Bidirectional Sync

When a trace is hidden via legend, also uncheck the corresponding sidebar checkbox. When a sidebar checkbox is toggled, show/hide the corresponding trace on ALL charts.

```js
// Listen for plotly_restyle to detect legend toggles
function setupLegendSync() {
    const allChartIds = ['chart-speed-dist', 'chart-speed-time', 'chart-altitude',
                         'chart-lateral-g', 'chart-longitudinal-g', 'chart-gg-diagram'];

    allChartIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        el.on('plotly_restyle', (eventData) => {
            // eventData[0] contains restyle data, e.g. { visible: [false] }
            // eventData[1] is the trace index
            if (!eventData || !eventData[0] || eventData[0].visible === undefined) return;

            const traceIndex = eventData[1]; // Index of toggled trace
            const isVisible = eventData[0].visible[0] !== false && eventData[0].visible[0] !== 'legendonly';

            // Map trace index to lap index (trace 0 = Lap 1, etc.)
            const lapIndex = traceIndex;

            if (lapIndex >= 0 && lapIndex < selectedLapIndices.size) {
                if (isVisible) {
                    selectedLapIndices.add(lapIndex);
                } else {
                    selectedLapIndices.delete(lapIndex);
                }
                syncCheckboxState(lapIndex, isVisible);
                syncTracesAcrossCharts(lapIndex, isVisible);
            }
        });
    });
}

function syncCheckboxState(lapIndex, isVisible) {
    const checkbox = document.querySelector(`.lap-checkbox[data-lap-index="${lapIndex}"]`);
    if (checkbox) checkbox.checked = isVisible;
}

function syncTracesAcrossCharts(lapIndex, isVisible) {
    const allChartIds = ['chart-speed-dist', 'chart-speed-time', 'chart-altitude',
                         'chart-lateral-g', 'chart-longitudinal-g', 'chart-gg-diagram'];

    allChartIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !el.data) return;
        // Only update if trace exists at this index
        if (el.data.length > lapIndex) {
            const update = { visible: isVisible ? true : 'legendonly' };
            Plotly.restyle(id, update, lapIndex);
        }
    });
}
```

#### 2.3 Sidebar Checkbox → Chart Sync

Modify the existing `handleFilterChange` or checkbox change handler to also call `syncTracesAcrossCharts`:

```js
// In the sidebar checkbox change handler:
document.querySelectorAll('.lap-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
        const lapIndex = parseInt(e.target.dataset.lapIndex);
        const isChecked = e.target.checked;

        if (isChecked) {
            selectedLapIndices.add(lapIndex);
        } else {
            selectedLapIndices.delete(lapIndex);
        }

        // Sync all charts
        syncTracesAcrossCharts(lapIndex, isChecked);
    });
});
```

### 3. Chart PNG Export

Each chart section header has a small camera/download icon button (`<i class="ph ph-download-simple"></i>`). On click:

```js
// In setupEventListeners or chart creation:
document.querySelectorAll('.chart-export').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const section = btn.closest('.chart-section');
        const chartBody = section.querySelector('.chart-body');
        const chartId = chartBody.id;
        const chartType = section.dataset.chartType;
        const timestamp = Date.now();

        try {
            const imgData = await Plotly.toImage(chartId, {
                format: 'png',
                width: 1200,
                height: 600
            });

            const link = document.createElement('a');
            link.download = `chart-${chartType}-${timestamp}.png`;
            link.href = imgData;
            link.click();

            showToast('success', 'Chart exported.');
        } catch (err) {
            showToast('error', 'Failed to export chart: ' + err.message);
        }
    });
});
```

Update the chart header HTML to ensure every chart has the export button:

```html
<div class="chart-header flex items-center justify-between px-4 py-3 cursor-pointer ...">
    <div class="flex items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-wider ...">{chartName}</span>
    </div>
    <div class="flex items-center gap-1">
        <button class="chart-export p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all" title="Export as PNG" aria-label="Export chart as PNG">
            <i class="ph ph-download-simple text-sm"></i>
        </button>
        <button class="chart-toggle p-1.5 rounded-lg ...">
            <i class="ph ph-caret-down text-sm"></i>
        </button>
    </div>
</div>
```

### 4. ResizeObserver for Container-Aware Sizing

Replace `window.resize` listener with `ResizeObserver` on each chart container div and on `#map-panel`:

```js
// Setup ResizeObserver (call once at boot in setupEventListeners or init)
function setupResizeObserver() {
    const ro = new ResizeObserver(entries => {
        entries.forEach(entry => {
            const target = entry.target;

            // Chart containers: .chart-body divs
            if (target.id && target.id.startsWith('chart-')) {
                if (target.data) {
                    Plotly.Plots.resize(target.id);
                }
                return;
            }

            // Map panel
            if (target.id === 'map-panel') {
                if (window.map && typeof map.invalidateSize === 'function') {
                    map.invalidateSize();
                }
                return;
            }

            // Fallback: look for a chart-body child
            const chartBody = target.querySelector('[id^="chart-"]');
            if (chartBody && chartBody.id && chartBody.data) {
                Plotly.Plots.resize(chartBody.id);
            }
        });
    });

    // Observe all chart bodies and map panel
    document.querySelectorAll('.chart-body, #map-panel').forEach(el => {
        ro.observe(el);
    });
}
```

Call `setupResizeObserver()` in the initialization flow (after charts are first created). For dynamically added charts (via "+ Add Chart"), the `renderExtendedCharts` function should also observe new `.chart-body` elements:

```js
// In renderExtendedCharts, after Plotly.newPlot:
function observeChartBody(chartId) {
    const el = document.getElementById(chartId);
    if (el && el._roObserved) return; // avoid duplicates
    if (resizeObserver && el) {
        resizeObserver.observe(el);
        el._roObserved = true;
    }
}

// Store resizeObserver globally:
let resizeObserver = null;

// In setupResizeObserver:
resizeObserver = new ResizeObserver(entries => { ... });
```

---

## State Variables Added

| Variable | Type | Initial | Description |
|---|---|---|---|
| `resizeObserver` | ResizeObserver | `null` | Global ResizeObserver instance for chart/map containers |

---

## Functions Added / Modified

| Function | Change |
|---|---|
| `setupLegendSync()` | NEW — listens for `plotly_restyle` events, syncs legend toggles with sidebar |
| `syncCheckboxState(lapIndex, isVisible)` | NEW — updates sidebar checkbox state |
| `syncTracesAcrossCharts(lapIndex, isVisible)` | NEW — shows/hides trace on all Plotly charts |
| `setupResizeObserver()` | NEW — initializes ResizeObserver for all chart bodies and map panel |
| `observeChartBody(chartId)` | NEW — observes a dynamically added chart body |
| `renderCharts()` | MODIFIED — uses `hovermode: 'x unified'` for distance charts |
| `renderExtendedCharts()` | MODIFIED — uses `hovermode: 'x unified'` for distance charts, `'closest'` for G-G |
| `setupEventListeners()` | MODIFIED — calls `setupLegendSync()` and `setupResizeObserver()` |
| `handleFilterChange()` | MODIFIED — also calls `syncTracesAcrossCharts` |

---

## Testing Instructions

1. After Phase 9, hover over Speed vs Distance chart → vertical crosshair appears on ALL charts at same x position, tooltip shows all lap speeds
2. Click a lap name in chart legend → that trace hides on all charts, sidebar checkbox unchecks
3. Check a lap in sidebar → trace reappears on all charts
4. Click camera/download icon on any chart header → PNG downloads with filename `chart-{type}-{timestamp}.png`
5. Resize the browser window (or if layout manager is active, drag a resize handle) → charts redraw to fit new container size without visual artifacts
6. Click G-G Diagram legend → only G-G chart trace toggles (no crosshair sync since it uses `'closest'`)
7. All previous functionality (upload, playback, video sync, gate, toasts, extended charts, zoom sync) still works
