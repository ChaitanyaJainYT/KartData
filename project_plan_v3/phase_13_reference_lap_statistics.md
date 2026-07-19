# Phase 13: Reference Lap & Statistics — Auto-Mark Fastest Lap, Delta Display, Lap Statistics Panel

**Builds on:** Phase 12 (map interactions, keyboard shortcuts work)

**Goal:** Auto-mark fastest lap as reference, show delta to reference in lap list and charts. Add per-lap statistics panel with sortable columns.

---

## Features & Implementation Specs

### 1. Reference Lap Auto-Selection

On lap calculation (`calculateLapsWithGate` or `calculateDefaultSingleLap`), find the fastest lap and store it.

```js
// In calculateLapsWithGate() and calculateDefaultSingleLap(), after lapsData is built:
function autoSelectReferenceLap() {
    if (!lapsData || lapsData.length === 0) return;

    let fastestIndex = 0;
    let fastestTime = Infinity;

    lapsData.forEach((lap, i) => {
        const d = lap.duration || 0;
        if (d > 0 && d < fastestTime) {
            fastestTime = d;
            fastestIndex = i;
        }
    });

    if (fastestTime === Infinity) {
        // No valid durations — fallback to index 0
        referenceLapId = 0;
        return;
    }

    referenceLapId = fastestIndex;
}

// Call from calculateLapsWithGate() and calculateDefaultSingleLap() right after
// lapsData is populated and before updateVisualization().
```

**Reference lap state variable:**

| Variable | Type | Initial | Description |
|---|---|---|---|
| `referenceLapId` | integer | `-1` | Index into `lapsData` for the reference (fastest) lap. Set by `autoSelectReferenceLap()`. `-1` means no reference (single lap or no valid data). |

**Reference lap trace color:** Always `#b138ff` (Neon Purple, from palette `--reference-trace`) regardless of COLORS index. In `renderCharts`, when rendering the reference lap trace, override its line color:

```js
// In renderCharts(), when building traces:
const lineColor = (index === referenceLapId) ? '#b138ff' : COLORS[index % COLORS.length];
```

### 2. Lap List Delta Column

In `createFilterItem`, add delta to reference display.

```js
function createFilterItem(label, value, checked, color, duration, isBest, delta) {
    // ... existing code for checkbox, color dot, label, duration ...

    // Delta column (new):
    let deltaHtml = '';
    if (delta !== undefined && delta !== null) {
        if (delta === 0) {
            // This is the reference lap (best)
            deltaHtml = `<span class="text-xs font-mono font-bold text-[#22c55e] flex items-center gap-1 ml-auto">
                <i class="ph-fill ph-trophy text-[10px]"></i> Best
            </span>`;
        } else {
            const sign = delta > 0 ? '+' : '';
            const colorClass = delta > 0 ? '#ef4444' : '#22c55e';
            deltaHtml = `<span class="text-xs font-mono font-bold ml-auto" style="color: ${colorClass}">
                ${sign}${delta.toFixed(3)}s
            </span>`;
        }
    }

    // Append deltaHtml after durationHtml in the label innerHTML
}
```

**Integration in `renderLapList`:**

```js
// After computing bestTime, compute delta for each lap:
lapsToDisplay.forEach((item) => {
    const { lap, index } = item;
    const delta = (referenceLapId >= 0 && index !== referenceLapId && lapsData[referenceLapId]?.duration > 0)
        ? lap.duration - lapsData[referenceLapId].duration
        : (index === referenceLapId ? 0 : null);
    // Pass delta to createFilterItem
});
```

**Delta column styling:**
- Reference lap: trophy icon + "Best" in green (`#22c55e`)
- All other laps: `+N.NNNs` in red (`#ef4444`)
- Same compact monospace font as duration

### 3. Chart Delta Overlay

In `renderCharts`, after reference lap trace, for each other selected lap compute and render a delta array as a filled scatter trace.

```js
function renderDeltaOverlay(chartDiv, lapsToRender, referenceLap, isDarkMode) {
    // For each non-reference selected lap:
    lapsToRender.forEach((item) => {
        const { lap, index } = item;
        if (index === referenceLapId || referenceLapId < 0) return;

        // Compute delta array: for each point in lap, find corresponding point
        // in reference lap at the same distance
        const deltas = [];
        const lapDistances = [];

        lap.forEach((point) => {
            // Find the reference point at closest lapDistance
            const refPoint = findClosestByDistance(referenceLap, point.lapDistance);
            if (refPoint && refPoint.time !== undefined) {
                const delta = point.time - refPoint.time;
                deltas.push(delta);
                lapDistances.push(point.lapDistance);
            }
        });

        if (deltas.length === 0) return;

        // Determine fill color: if any delta is negative (faster than ref), use green
        const hasNegative = deltas.some(d => d < 0);
        const fillColor = hasNegative
            ? 'rgba(34,197,94,0.15)'  // green for faster
            : 'rgba(239,68,68,0.15)';  // red for slower

        const deltaTrace = {
            x: lapDistances,
            y: deltas,
            fill: 'tozeroy',
            fillcolor: fillColor,
            line: { width: 0 },
            name: `Lap ${index + 1} delta`,
            yaxis: 'y2',
            hoverinfo: 'skip',
            showlegend: false
        };

        // Append to existing data array
        Plotly.addTraces(chartDiv, deltaTrace);
    });
}

function findClosestByDistance(lap, targetDistance) {
    // Binary search or linear scan — binary preferred for performance
    let closest = lap[0];
    let minDiff = Infinity;

    for (const p of lap) {
        const diff = Math.abs(p.lapDistance - targetDistance);
        if (diff < minDiff) {
            minDiff = diff;
            closest = p;
        }
    }

    return closest;
}
```

**Secondary Y-axis for delta:**

```js
// In the chart layout update, add yaxis2:
{
    yaxis2: {
        title: { text: 'Delta (s)', font: { family: 'Inter, sans-serif', size: 11, color: fontColor } },
        overlaying: 'y',
        side: 'right',
        gridcolor: gridColor,
        tickfont: { family: 'Inter, sans-serif', size: 10, color: fontColor },
        fixedrange: false
    }
}
```

**Axes update after adding delta traces:**

```js
// After adding all delta traces, relayout to configure yaxis2
Plotly.relayout(chartDiv, {
    'yaxis2.title.text': 'Delta (s)',
    'yaxis2.overlaying': 'y',
    'yaxis2.side': 'right',
    'yaxis2.gridcolor': gridColor,
    'yaxis2.tickfont': { family: 'Inter, sans-serif', size: 10, color: fontColor },
    'yaxis2.fixedrange': false
});
```

### 4. Manual Reference Selection

Right-click lap → "Set as Reference" context menu option (already scaffolded in Phase 12).

```js
// Update handleContextAction for 'set-reference':
function handleContextAction(action, target) {
    switch (action) {
        case 'set-reference':
            if (target.type === 'lap') {
                referenceLapId = target.index;
                showToast('info', `Set Lap ${target.index + 1} as reference.`);
                updateVisualization();
            }
            break;
        // ... existing cases ...
    }
}
```

When `referenceLapId` changes, re-render:
- Lap list (delta values change)
- Charts (reference trace moves, delta overlays recalculate)

### 5. Statistics Panel

Collapsible section below the lap list in the sidebar.

#### 5.1 Panel Structure

```html
<div id="statistics-panel" class="mt-2 border-t border-gray-200 dark:border-gray-800 pt-2">
    <button id="stats-toggle" class="flex items-center justify-between w-full px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
        <span>Lap Statistics</span>
        <i class="ph ph-caret-down text-sm transition-transform duration-200" id="stats-chevron"></i>
    </button>
    <div id="stats-content" class="overflow-x-auto">
        <table class="w-full text-xs font-mono">
            <thead>
                <tr class="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-800">
                    <th class="stats-header px-1 py-1 text-left cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" data-sort="lap">Lap</th>
                    <th class="stats-header px-1 py-1 text-right cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" data-sort="time">Time</th>
                    <th class="stats-header px-1 py-1 text-right cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" data-sort="avgSpeed">Avg Speed</th>
                    <th class="stats-header px-1 py-1 text-right cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" data-sort="maxSpeed">Max Speed</th>
                    <th class="stats-header px-1 py-1 text-right cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" data-sort="minSpeed">Min Speed</th>
                    <th class="stats-header px-1 py-1 text-right cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" data-sort="maxLatG">Max Lat G</th>
                    <th class="stats-header px-1 py-1 text-right cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" data-sort="distance">Dist</th>
                    <th class="stats-header px-1 py-1 text-right cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" data-sort="delta">Delta</th>
                </tr>
            </thead>
            <tbody id="stats-body">
                <!-- Dynamic rows -->
            </tbody>
        </table>
    </div>
</div>
```

#### 5.2 Data Computation

```js
function computeLapStatistics(lap) {
    const speeds = lap.map(p => p.speed).filter(s => !isNaN(s) && s > 0);
    const timedPoints = speeds.length;

    const avgSpeed = timedPoints > 0
        ? speeds.reduce((a, b) => a + b, 0) / timedPoints
        : (lap.maxDistance / lap.duration) * 3.6;

    const maxSpeed = timedPoints > 0 ? Math.max(...speeds) : 0;
    const minSpeed = timedPoints > 0 ? Math.min(...speeds) : 0;

    // Compute lateral G for all points, find max absolute
    let maxLatG = 0;
    for (let i = 1; i < lap.length; i++) {
        const g = computeLateralG(lap[i - 1], lap[i]);
        const absG = Math.abs(g);
        if (absG > maxLatG) maxLatG = absG;
    }

    return {
        avgSpeed: avgSpeed.toFixed(1),
        maxSpeed: maxSpeed.toFixed(1),
        minSpeed: minSpeed.toFixed(1),
        maxLatG: maxLatG.toFixed(3),
        distance: lap.maxDistance.toFixed(0)
    };
}

function computeLateralG(p1, p2) {
    // Approximate lateral G from GPS path curvature
    // Using three-point method: speed^2 / radius, converted to G
    // Simplified: cross-track acceleration = (v^2 * delta_heading) / (g * delta_t)
    const speedMS = (p1.speedMS + p2.speedMS) / 2;
    if (speedMS < 0.5) return 0;

    const dTime = p2.time - p1.time;
    if (dTime <= 0) return 0;

    const dLat = deg2rad(p2.lat - p1.lat);
    const dLon = deg2rad(p2.lon - p1.lon);
    const avgLat = deg2rad((p1.lat + p2.lat) / 2);

    // Heading change (simplified)
    const heading1 = Math.atan2(
        Math.sin(deg2rad(p2.lon - p1.lon)) * Math.cos(deg2rad(p2.lat)),
        Math.cos(deg2rad(p1.lat)) * Math.sin(deg2rad(p2.lat)) -
        Math.sin(deg2rad(p1.lat)) * Math.cos(deg2rad(p2.lat)) * Math.cos(deg2rad(p2.lon - p1.lon))
    );
    // (heading2 would use p2->p3 — simplified here using sequential points)

    const dist = getDistanceFromLatLonInM(p1.lat, p1.lon, p2.lat, p2.lon);
    if (dist < 0.1) return 0;

    const v = speedMS;
    const radius = (dist * dist) / (2 * Math.abs(p2.lapDistance - p1.lapDistance) || 1); // simplified curvature

    const latG = (v * v) / (radius * 9.81);
    return latG;
}
```

#### 5.3 Render Statistics Table

```js
function renderStatisticsPanel() {
    const tbody = document.getElementById('stats-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const bestTime = referenceLapId >= 0 ? lapsData[referenceLapId]?.duration : Math.min(...lapsData.map(l => l.duration).filter(d => d > 0));

    lapsData.forEach((lap, i) => {
        const stats = computeLapStatistics(lap);
        const delta = (referenceLapId >= 0 && i !== referenceLapId && lapsData[referenceLapId]?.duration > 0)
            ? lap.duration - lapsData[referenceLapId].duration
            : 0;
        const isBest = delta === 0 && lapsData.length > 1;
        const rowClass = isBest ? 'bg-[#22c55e]/10' : '';

        const tr = document.createElement('tr');
        tr.className = `border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${rowClass}`;
        tr.innerHTML = `
            <td class="px-1 py-1 text-left font-semibold text-gray-700 dark:text-gray-300">${i + 1}</td>
            <td class="px-1 py-1 text-right text-gray-600 dark:text-gray-400">${formatTime(lap.duration)}</td>
            <td class="px-1 py-1 text-right text-gray-600 dark:text-gray-400">${stats.avgSpeed}</td>
            <td class="px-1 py-1 text-right text-gray-600 dark:text-gray-400 font-semibold">${stats.maxSpeed}</td>
            <td class="px-1 py-1 text-right text-gray-600 dark:text-gray-400">${stats.minSpeed}</td>
            <td class="px-1 py-1 text-right text-gray-600 dark:text-gray-400">${stats.maxLatG}</td>
            <td class="px-1 py-1 text-right text-gray-600 dark:text-gray-400">${stats.distance}m</td>
            <td class="px-1 py-1 text-right font-semibold ${isBest ? 'text-[#22c55e]' : 'text-[#ef4444]'}">
                ${isBest ? 'Best' : `+${delta.toFixed(3)}s`}
            </td>
        `;
        tbody.appendChild(tr);
    });
}
```

#### 5.4 Sortable Columns

```js
let statsSortKey = 'lap';
let statsSortAsc = true;

// Event delegation on stats header clicks
document.getElementById('stats-body')?.closest('table')?.addEventListener('click', (e) => {
    const header = e.target.closest('.stats-header');
    if (!header) return;

    const key = header.dataset.sort;
    if (key === statsSortKey) {
        statsSortAsc = !statsSortAsc;
    } else {
        statsSortKey = key;
        statsSortAsc = key === 'lap'; // default ascending for lap number
    }

    // Re-sort and re-render
    renderStatisticsPanel();
});
```

**Sorting logic in `renderStatisticsPanel`:**

```js
// Build sorted indices based on current sortKey and direction
let sortedIndices = lapsData.map((_, i) => i);

if (statsSortKey === 'time') {
    sortedIndices.sort((a, b) => (lapsData[a].duration - lapsData[b].duration) * (statsSortAsc ? 1 : -1));
} else if (statsSortKey === 'avgSpeed') {
    const avgs = lapsData.map(l => computeLapStatistics(l).avgSpeed);
    sortedIndices.sort((a, b) => (parseFloat(avgs[a]) - parseFloat(avgs[b])) * (statsSortAsc ? 1 : -1));
} else if (statsSortKey === 'maxSpeed') {
    const maxs = lapsData.map(l => Math.max(...l.map(p => p.speed)));
    sortedIndices.sort((a, b) => (maxs[a] - maxs[b]) * (statsSortAsc ? 1 : -1));
} // ... similar for minSpeed, maxLatG, distance, delta
```

#### 5.5 Collapse/Expand Toggle

```js
document.getElementById('stats-toggle')?.addEventListener('click', () => {
    const content = document.getElementById('stats-content');
    const chevron = document.getElementById('stats-chevron');
    if (!content || !chevron) return;

    const isOpen = !content.classList.contains('hidden');
    content.classList.toggle('hidden');
    chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
});
```

---

## State Variables Added

| Variable | Type | Initial | Description |
|---|---|---|---|
| `referenceLapId` | integer | `-1` | Index of the reference (fastest) lap. Set by `autoSelectReferenceLap()`. |
| `statsSortKey` | string | `'lap'` | Current statistics table sort column. |
| `statsSortAsc` | boolean | `true` | Current statistics sort direction. |

---

## Functions Added / Modified

| Function | Change |
|---|---|
| `autoSelectReferenceLap()` | NEW — finds fastest lap and sets `referenceLapId` |
| `findClosestByDistance(lap, targetDistance)` | NEW — binary/linear search for corresponding point at same distance |
| `renderDeltaOverlay(chartDiv, lapsToRender, referenceLap)` | NEW — adds filled scatter traces for delta to reference |
| `computeLapStatistics(lap)` | NEW — computes avg/max/min speed, max lat G, distance for a lap |
| `computeLateralG(p1, p2)` | NEW — approximate lateral G from GPS path curvature |
| `renderStatisticsPanel()` | NEW — renders statistics table in sidebar |
| `createFilterItem(...)` | MODIFIED — adds delta column to lap list items |
| `renderLapList()` | MODIFIED — computes and passes delta for each lap |
| `renderCharts(lapsToRender)` | MODIFIED — renders reference trace in purple, calls `renderDeltaOverlay` |
| `calculateLapsWithGate()` | MODIFIED — calls `autoSelectReferenceLap()` after lap calculation |
| `calculateDefaultSingleLap()` | MODIFIED — calls `autoSelectReferenceLap()` after lap creation |
| `handleContextAction(action, target)` | MODIFIED — implements 'set-reference' to update `referenceLapId` and re-render |
| `updateVisualization()` | MODIFIED — calls `renderStatisticsPanel()` |

---

## Testing Instructions

1. After Phase 12, upload CSV with 3+ laps → fastest lap automatically shows purple trace on charts (`#b138ff`)
2. Check lap list → delta column shows "+1.234s" in red for non-fastest laps, "Best" with trophy icon in green for fastest lap
3. View charts → delta shaded region visible for non-reference laps (red fill for slower sections)
4. Right-click a lap → "Set as Reference" → delta recalculates, reference trace moves to that lap in purple
5. Expand Statistics panel (click "Lap Statistics ▾") → table shows all lap metrics: Lap #, Time, Avg Speed, Max Speed, Min Speed, Max Lat G, Distance, Delta
6. Click "Max Speed" column header → laps sort by max speed descending
7. Click again → ascending
8. Best lap row in statistics table has green background tint (`bg-[#22c55e]/10`)
9. All previous functionality (map click-to-seek, speed heatmap, gate drawing, keyboard shortcuts, context menus) still works
