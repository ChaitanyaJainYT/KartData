# Phase 14: Sectors & A-B Loop — 3 Equal-Distance Sectors, Sector Coloring, A-B Loop Markers on Scrubber

**Builds on:** Phase 13 (reference lap and statistics work)

**Goal:** Split each lap into 3 equal-distance sectors with times displayed. A-B loop markers on scrubber for corner analysis.

---

## Features & Implementation Specs

### 1. Sector Breakdown

After lap calculation, for each lap divide into 3 equal-distance sectors.

#### 1.1 Sector Computation

```js
function computeSectors(lap) {
    if (!lap || lap.length < 3) return null;

    const maxDist = lap.maxDistance;
    if (maxDist <= 0) return null;

    const threshold33 = maxDist * 0.33;
    const threshold66 = maxDist * 0.66;

    // Find indices where lapDistance crosses each threshold
    let idx33 = lap.length - 1;
    let idx66 = lap.length - 1;

    for (let i = 0; i < lap.length; i++) {
        if (lap[i].lapDistance >= threshold33 && idx33 === lap.length - 1) {
            idx33 = i;
        }
        if (lap[i].lapDistance >= threshold66 && idx66 === lap.length - 1) {
            idx66 = i;
        }
    }

    // Clamp to valid bounds
    idx33 = Math.max(1, Math.min(idx33, lap.length - 1));
    idx66 = Math.max(idx33 + 1, Math.min(idx66, lap.length - 1));

    return [
        {
            startIndex: 0,
            endIndex: idx33,
            time: lap[idx33].time - lap[0].time,
            distance: lap[idx33].lapDistance - lap[0].lapDistance
        },
        {
            startIndex: idx33,
            endIndex: idx66,
            time: lap[idx66].time - lap[idx33].time,
            distance: lap[idx66].lapDistance - lap[idx33].lapDistance
        },
        {
            startIndex: idx66,
            endIndex: lap.length - 1,
            time: lap[lap.length - 1].time - lap[idx66].time,
            distance: lap[lap.length - 1].lapDistance - lap[idx66].lapDistance
        }
    ];
}
```

**Integration in lap calculation:**

```js
// In calculateLapsWithGate() and calculateDefaultSingleLap(), after each lap is built:
lap.sectors = computeSectors(lap);
```

**Best sector tracking:**

```js
let bestSectors = { s1: Infinity, s2: Infinity, s3: Infinity };

function computeBestSectors() {
    bestSectors = { s1: Infinity, s2: Infinity, s3: Infinity };

    lapsData.forEach(lap => {
        if (!lap.sectors) return;
        if (lap.sectors[0]?.time > 0 && lap.sectors[0].time < bestSectors.s1) {
            bestSectors.s1 = lap.sectors[0].time;
        }
        if (lap.sectors[1]?.time > 0 && lap.sectors[1].time < bestSectors.s2) {
            bestSectors.s2 = lap.sectors[1].time;
        }
        if (lap.sectors[2]?.time > 0 && lap.sectors[2].time < bestSectors.s3) {
            bestSectors.s3 = lap.sectors[2].time;
        }
    });
}
```

#### 1.2 Expandable Lap List Rows

Each lap item in the sidebar becomes expandable. Clicking the lap row toggles visibility of sector sub-rows.

```js
// Modify createFilterItem to include a click-to-expand area
function createFilterItem(label, value, checked, color, duration, isBest, delta, sectors) {
    // ... existing code ...

    // Wrap the label in an expandable structure
    const itemDiv = document.createElement('div');
    itemDiv.className = 'lap-item';

    // Main row (checkbox + color dot + label + duration + delta)
    const mainRow = document.createElement('div');
    mainRow.className = 'flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700 select-none';
    mainRow.innerHTML = `
        <input type="checkbox" value="${value}" class="lap-checkbox focus:ring-0" ${checked ? 'checked' : ''}>
        <div class="w-3 h-3 rounded-full shadow-sm flex-shrink-0" style="background-color: ${color}"></div>
        <span class="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate flex-1">${label}</span>
        ${durationHtml}
        ${deltaHtml || ''}
        <i class="ph ph-caret-down text-xs text-gray-400 transition-transform duration-200 ml-1 sector-expand-icon"></i>
    `;

    // Sector sub-rows (hidden by default)
    let sectorsHtml = '';
    if (value !== 'all' && sectors) {
        const s1Best = bestSectors.s1;
        const s2Best = bestSectors.s2;
        const s3Best = bestSectors.s3;

        sectors.forEach((s, i) => {
            const isBestSector = s.time > 0 && Math.abs(s.time - [s1Best, s2Best, s3Best][i]) < 0.001;
            const sectorColor = isBestSector ? '#b138ff' : '#94a3b8';

            sectorsHtml += `<div class="flex items-center gap-2 px-8 py-1 text-xs font-mono text-gray-400 dark:text-gray-500">
                <span class="font-bold" style="color: ${sectorColor}">S${i + 1}</span>
                <span style="color: ${sectorColor}">${formatTime(s.time)}</span>
                <span class="text-gray-500">(${s.distance.toFixed(0)}m)</span>
            </div>`;
        });
    }

    const sectorsContainer = document.createElement('div');
    sectorsContainer.className = 'sectors-container hidden';
    sectorsContainer.innerHTML = sectorsHtml;

    // Toggle on main row click (not checkbox)
    mainRow.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return; // let checkbox handle its own event
        sectorsContainer.classList.toggle('hidden');
        const icon = mainRow.querySelector('.sector-expand-icon');
        if (icon) {
            icon.style.transform = sectorsContainer.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    });

    itemDiv.appendChild(mainRow);
    itemDiv.appendChild(sectorsContainer);

    // Bind checkbox change event
    itemDiv.querySelector('.lap-checkbox').addEventListener('change', (e) => {
        handleFilterChange(value, e.target.checked);
    });

    return itemDiv;
}
```

**Context menu target update:** When right-clicking a lap row, ensure `contextMenuTarget` uses the parent `.lap-item` or the main row's lap index.

#### 1.3 Sector Coloring on Map

Each lap polyline is drawn as 3 segments with different colors based on sector rank vs best.

```js
function renderSectorMapPolylines(lapsToRender) {
    if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
    ghostLayer = L.layerGroup().addTo(map);

    lapsToRender.forEach((item) => {
        const { lap, index } = item;
        if (!lap.sectors || lap.sectors.length !== 3) {
            // Fallback: solid color polyline
            renderSingleLapPolyline(lap, index);
            return;
        }

        const baseColor = COLORS[index % COLORS.length];

        lap.sectors.forEach((sector, sIdx) => {
            const segPoints = lap.slice(sector.startIndex, sector.endIndex + 1);
            if (segPoints.length < 2) return;

            // Determine sector color vs best
            const bestTime = [bestSectors.s1, bestSectors.s2, bestSectors.s3][sIdx];
            let segColor;

            if (!bestTime || bestTime <= 0) {
                segColor = baseColor;
            } else if (Math.abs(sector.time - bestTime) < 0.001) {
                // Best sector — green
                segColor = '#22c55e';
            } else if (sector.time > bestTime * 1.1) {
                // More than 10% worse than best — red
                segColor = '#ef4444';
            } else {
                // Neutral — white/gray
                segColor = '#94a3b8';
            }

            const latlngs = segPoints.map(p => [p.lat, p.lon]);
            L.polyline(latlngs, {
                color: segColor,
                weight: 3,
                opacity: 0.9,
                smoothFactor: 1
            }).addTo(ghostLayer);
        });
    });
}
```

**Integration in renderMap:**

```js
// In renderMap(), replace the solid polyline rendering:
if (lap.sectors && lap.sectors.length === 3) {
    // Sector-colored rendering
    renderSectorSegments(lap, index);
} else {
    // Solid color polyline (existing logic)
    const latlngs = lap.map(p => [p.lat, p.lon]);
    L.polyline(latlngs, { ... }).addTo(polylineLayerGroup);
}
```

### 2. A-B Loop

Add markers on the scrubber for defining a loop region.

#### 2.1 State Variables

Add to `playbackState`:

| Variable | Type | Initial | Description |
|---|---|---|---|
| `markerA` | float \| null | `null` | Scrubber position for marker A (in current mode units) |
| `markerB` | float \| null | `null` | Scrubber position for marker B |
| `loopMode` | `'full'` \| `'ab'` | `'full'` | Loop mode: full session or A-B range |

#### 2.2 DOM Elements

```html
<!-- In playback bar, near scrubber -->
<div class="flex items-center gap-1">
    <button id="ab-loop-a-btn" class="px-2 py-1 text-xs font-bold font-mono text-gray-400 dark:text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors" aria-label="Set Marker A">[A]</button>
    <button id="ab-loop-b-btn" class="px-2 py-1 text-xs font-bold font-mono text-gray-400 dark:text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors" aria-label="Set Marker B">[B]</button>
    <button id="ab-loop-toggle" class="px-2 py-1 text-xs font-bold font-mono rounded transition-colors ${loopMode === 'ab' ? 'bg-brand-600/20 text-brand-400 border border-brand-600/40' : 'text-gray-400 dark:text-gray-500 hover:text-white hover:bg-gray-700'}" aria-label="Toggle A-B Loop">Loop A↔B</button>
</div>
```

#### 2.3 Event Handlers

```js
document.getElementById('ab-loop-a-btn')?.addEventListener('click', () => {
    playbackState.markerA = playbackState.currentValue;
    updateScrubberMarkers();
    showToast('info', `Marker A set at ${formatPosition(playbackState.markerA)}`);
});

document.getElementById('ab-loop-b-btn')?.addEventListener('click', () => {
    playbackState.markerB = playbackState.currentValue;
    updateScrubberMarkers();
    showToast('info', `Marker B set at ${formatPosition(playbackState.markerB)}`);
});

document.getElementById('ab-loop-toggle')?.addEventListener('click', () => {
    if (playbackState.markerA === null || playbackState.markerB === null) {
        showToast('warning', 'Set both Marker A and B before enabling A-B loop.');
        return;
    }

    playbackState.loopMode = playbackState.loopMode === 'ab' ? 'full' : 'ab';
    const btn = document.getElementById('ab-loop-toggle');
    if (playbackState.loopMode === 'ab') {
        btn.classList.add('bg-brand-600/20', 'text-brand-400', 'border', 'border-brand-600/40');
        showToast('info', 'A-B Loop enabled.');
    } else {
        btn.classList.remove('bg-brand-600/20', 'text-brand-400', 'border', 'border-brand-600/40');
        showToast('info', 'Full session loop enabled.');
    }
    updateScrubberMarkers();
});

function formatPosition(value) {
    return playbackState.mode === 'distance'
        ? `${value.toFixed(0)}m`
        : formatTime(value);
}
```

#### 2.4 Scrubber Visual Markers

The scrubber rail needs visual markers for A and B positions, plus a shaded region between them.

```js
function updateScrubberMarkers() {
    const scrubber = document.getElementById('main-scrubber');
    if (!scrubber) return;

    // Remove existing marker elements
    document.querySelectorAll('.ab-marker, .ab-region').forEach(el => el.remove());

    const scrubberRect = scrubber.getBoundingClientRect();
    const scrubberParent = scrubber.parentElement;
    if (!scrubberParent) return;

    const maxVal = playbackState.maxValue || 1;
    const range = scrubber.max - scrubber.min || 1;

    // Shaded region between A and B
    if (playbackState.markerA !== null && playbackState.markerB !== null) {
        const pctA = ((playbackState.markerA - scrubber.min) / range) * 100;
        const pctB = ((playbackState.markerB - scrubber.min) / range) * 100;
        const left = Math.min(pctA, pctB);
        const width = Math.abs(pctB - pctA);

        const region = document.createElement('div');
        region.className = 'ab-region absolute top-1/2 -translate-y-1/2 h-3 pointer-events-none z-[5]';
        region.style.cssText = `left: ${left}%; width: ${width}%; background: rgba(239,68,68,0.1); border-radius: 2px;`;
        scrubberParent.style.position = 'relative';
        scrubberParent.appendChild(region);
    }

    // Vertical tick marks
    ['markerA', 'markerB'].forEach(key => {
        const value = playbackState[key];
        if (value === null) return;

        const pct = ((value - scrubber.min) / range) * 100;
        const label = key === 'markerA' ? 'A' : 'B';

        const marker = document.createElement('div');
        marker.className = `ab-marker absolute top-0 -translate-x-1/2 z-10 flex flex-col items-center pointer-events-none`;
        marker.style.cssText = `left: ${pct}%;`;

        const tick = document.createElement('div');
        tick.className = 'w-0.5 h-4 bg-brand-400';

        const labelEl = document.createElement('span');
        labelEl.className = 'text-[9px] font-bold font-mono text-brand-400 mt-0.5';
        labelEl.textContent = label;

        marker.appendChild(tick);
        marker.appendChild(labelEl);
        scrubberParent?.appendChild(marker);
    });
}

// Call updateScrubberMarkers after scrubber max changes and on mode switch
```

#### 2.5 Playback Loop Modification

```js
// In playbackLoop(), modify the end-of-session reset:
function playbackLoop() {
    if (!playbackState.isPlaying) return;

    const now = performance.now();
    let dt = (now - playbackState.lastFrameTime) / 1000;
    dt = Math.min(dt, 0.1); // Cap to prevent tab-switch jumps
    playbackState.lastFrameTime = now;

    let increment;
    if (playbackState.mode === 'time') {
        increment = dt * playbackState.baseSpeed;
    } else {
        increment = distanceSimSpeed * playbackState.baseSpeed * dt;
    }

    playbackState.currentValue += increment;

    // Loop logic
    if (playbackState.currentValue > playbackState.maxValue) {
        if (playbackState.loopMode === 'ab' && playbackState.markerA !== null) {
            playbackState.currentValue = playbackState.markerA;
            // Reset video lastIndex values
            playbackState.lastIndices?.forEach((_, i) => playbackState.lastIndices[i] = 0);
        } else {
            playbackState.currentValue = 0;
            if (playbackState.lastIndices) playbackState.lastIndices.fill(0);
        }
        // Also handle the A-B loop within the range
    } else if (playbackState.loopMode === 'ab' &&
               playbackState.markerB !== null &&
               playbackState.currentValue >= playbackState.markerB) {
        playbackState.currentValue = playbackState.markerA;
        if (playbackState.lastIndices) playbackState.lastIndices.fill(0);
    }

    // Update scrubber
    const scrubber = document.getElementById('main-scrubber');
    if (scrubber) scrubber.value = playbackState.currentValue;

    syncVideosToStateTimeline(false);
    updateVideoPlaybackRates();
    playbackState.animFrameId = requestAnimationFrame(playbackLoop);
}
```

#### 2.6 Manual Seek Within Range

```js
// In manualSeek(), clamp to [A, B] if loopMode === 'ab':
function manualSeek(val) {
    if (playbackState.loopMode === 'ab' &&
        playbackState.markerA !== null &&
        playbackState.markerB !== null) {
        const minRange = Math.min(playbackState.markerA, playbackState.markerB);
        const maxRange = Math.max(playbackState.markerA, playbackState.markerB);
        val = Math.max(minRange, Math.min(maxRange, val));
    }

    playbackState.currentValue = val;
    // Reset video lastIndex
    if (playbackState.lastIndices) playbackState.lastIndices.fill(0);
    syncVideosToStateTimeline(true);
}
```

#### 2.7 Clear Markers on New Session

```js
// When gate is reset or new session starts:
function clearABMarkers() {
    playbackState.markerA = null;
    playbackState.markerB = null;
    playbackState.loopMode = 'full';

    const btn = document.getElementById('ab-loop-toggle');
    if (btn) {
        btn.classList.remove('bg-brand-600/20', 'text-brand-400', 'border', 'border-brand-600/40');
    }

    updateScrubberMarkers();
}

// Call clearABMarkers() in resetGate() and resetAllData()
```

#### 2.8 Tooltip on Marker Hover

```js
// Add hover tooltip to A/B marker elements
function addMarkerTooltips() {
    document.querySelectorAll('.ab-marker').forEach(marker => {
        const isA = marker.querySelector('span')?.textContent === 'A';
        const value = isA ? playbackState.markerA : playbackState.markerB;
        const label = isA ? 'A' : 'B';
        const formatted = playbackState.mode === 'distance'
            ? `${value?.toFixed(0)}m`
            : formatTime(value || 0);

        marker.title = `Marker ${label}: ${formatted}`;
    });
}
```

---

## State Variables Added

| Variable | Type | Initial | Description |
|---|---|---|---|
| `lap.sectors` | Array | `null` | Array of 3 sector objects `{ startIndex, endIndex, time, distance }` |
| `bestSectors` | Object | `{ s1: Infinity, s2: Infinity, s3: Infinity }` | Best sector times across all laps |
| `playbackState.markerA` | float \| null | `null` | Scrubber position for marker A |
| `playbackState.markerB` | float \| null | `null` | Scrubber position for marker B |
| `playbackState.loopMode` | `'full'` \| `'ab'` | `'full'` | Current loop mode |

---

## Functions Added / Modified

| Function | Change |
|---|---|
| `computeSectors(lap)` | NEW — divides lap into 3 equal-distance sectors |
| `computeBestSectors()` | NEW — finds best sector times across all laps |
| `createFilterItem(...)` | MODIFIED — supports expandable sector sub-rows with caret icon toggle |
| `renderSectorMapPolylines(lapsToRender)` | NEW — renders lap polylines as 3 colored segments (green/white/red vs best) |
| `renderMap(lapsToRender)` | MODIFIED — checks for sectors; calls sector rendering when available |
| `updateScrubberMarkers()` | NEW — renders A/B tick marks and shaded region on scrubber rail |
| `clearABMarkers()` | NEW — clears A/B markers, resets loop mode to full |
| `playbackLoop()` | MODIFIED — respects A-B loop boundaries for end-of-session and within-range reset |
| `manualSeek(val)` | MODIFIED — clamps seek value to [A, B] range when loopMode is 'ab' |
| `resetGate()` | MODIFIED — calls `clearABMarkers()` |
| `resetAllData()` | MODIFIED — calls `clearABMarkers()` |
| `calculateLapsWithGate()` | MODIFIED — calls `computeSectors` for each lap |
| `calculateDefaultSingleLap()` | MODIFIED — calls `computeSectors` for single lap, calls `computeBestSectors()` |

---

## Testing Instructions

1. After Phase 13, upload CSV with 3+ laps → click a lap in the list → expands to show `S1 12.340s | S2 13.100s | S3 12.890s` with distances
2. Best sector across all laps highlighted in purple (`#b138ff`) in the sector sub-rows
3. Look at map → each lap has 3 colored segments: green (best), white/gray (neutral), red (worst)
4. Click `[A]` button → "Marker A set at ..." toast, vertical tick mark appears on scrubber rail with "A" label
5. Scrub to another position, click `[B]` → second marker appears with "B" label
6. Click "Loop A↔B" → shaded region (brand-red at 10% opacity) appears between markers, button highlights
7. Click play → playback loops within A-B range, resets to A when hitting B
8. Scrub manually → position clamped to [A, B] range
9. Hover over A/B markers → tooltip shows "Marker A: 325m" or "Marker B: 12.5s"
10. Click "Loop A↔B" again → loops full session again, button returns to normal
11. Reset gate → A/B markers clear, loop mode resets to 'full'
12. All previous functionality (reference lap, statistics, map click-to-seek, keyboard shortcuts) still works
