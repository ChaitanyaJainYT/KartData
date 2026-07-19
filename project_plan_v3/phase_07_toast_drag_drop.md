# Phase 7: Toast Notifications & Drag-and-Drop Upload

**Builds on:** Phase 6 (CSV upload, video, playback all work)
**Deliverable:** Replace all `alert()` calls with toast notifications. Add drag-and-drop file upload, upload progress feedback, and a New Session button to clear all data.

---

## Goal

Eliminate all native `alert()` dialogs with a polished toast notification system. Enable drag-and-drop file upload from the OS file explorer. Show upload progress for large CSVs and video extraction. Provide a New Session button to cleanly reset all state with undo support.

---

## Features & Implementation Specs

### 1. Toast Notification System

#### 1.1 Container

Add to the HTML body (as the last child of `<body>`):

```html
<div id="toast-container" class="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-2 pointer-events-none"></div>
```

- `pointer-events-none` on container; each toast has `pointer-events-auto` so clicks work
- Bottom-right positioning
- `z-50` ensures toasts appear above all other content
- `flex-col-reverse` so newest toasts appear at the bottom

#### 1.2 Toast Types

| Type | Left Border Color | Phosphor Icon | Auto-Dismiss |
|------|------------------|---------------|--------------|
| `success` | `#22c55e` (green) | `ph-check-circle` | 4s |
| `error` | `#ef4444` (red) | `ph-x-circle` | 8s |
| `warning` | `#eab308` (yellow) | `ph-warning` | 8s |
| `info` | `#3b82f6` (blue) | `ph-info` | 4s |

#### 1.3 Toast HTML Structure

```html
<div class="toast toast-{type} pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg mb-0 animate-slide-in max-w-sm"
     role="alert" data-toast-id="{id}">
    <i class="ph-fill ph-{icon} text-lg flex-shrink-0 mt-0.5" style="color: {borderColor}"></i>
    <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-800 dark:text-gray-200 break-words">{message}</p>
        {undoButton}
        {progressBar}
    </div>
    <button class="toast-dismiss flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-lg leading-none" aria-label="Dismiss">&times;</button>
</div>
```

- Left border accent via `border-l-4` with `style="border-left-color: {typeColor}"`
- Undo button: `<button class="toast-undo mt-1.5 text-xs font-bold text-brand-600 hover:text-brand-500 transition-colors" data-action="undo">[Undo]</button>`
- Progress bar: `<div class="toast-progress mt-1.5 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-brand-500 rounded-full transition-all duration-200" style="width: {percent}%"></div></div>`

#### 1.4 Toast JavaScript API

```js
let toastIdCounter = 0;
let visibleToasts = []; // Array of { id, type, message, timeout, undoAction }

function showToast(type, message, options = {}) {
    // options: { duration, undoAction, progress }
    const id = ++toastIdCounter;
    const typeConfig = {
        success: { color: '#22c55e', icon: 'check-circle', defaultDuration: 4000 },
        error:   { color: '#ef4444', icon: 'x-circle',      defaultDuration: 8000 },
        warning: { color: '#eab308', icon: 'warning',       defaultDuration: 8000 },
        info:    { color: '#3b82f6', icon: 'info',          defaultDuration: 4000 }
    };
    const config = typeConfig[type];
    const duration = options.duration || config.defaultDuration;

    // Enforce max 3 visible toasts — remove oldest if at limit
    while (visibleToasts.length >= 3) {
        const oldest = visibleToasts.shift();
        dismissToast(oldest.id);
    }

    const container = document.getElementById('toast-container');
    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type} pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg mb-0 max-w-sm`;
    toastEl.style.borderLeft = `4px solid ${config.color}`;
    toastEl.setAttribute('role', 'alert');
    toastEl.dataset.toastId = id;

    let undoHtml = '';
    if (options.undoAction) {
        undoHtml = `<button class="toast-undo mt-1.5 text-xs font-bold text-brand-600 hover:text-brand-500 transition-colors" data-action="undo">[Undo]</button>`;
    }

    let progressHtml = '';
    if (options.progress !== undefined) {
        progressHtml = `<div class="toast-progress mt-1.5 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-brand-500 rounded-full transition-all duration-200" style="width: ${options.progress}%"></div></div>`;
    }

    toastEl.innerHTML = `
        <i class="ph-fill ph-${config.icon} text-lg flex-shrink-0 mt-0.5" style="color: ${config.color}"></i>
        <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-800 dark:text-gray-200 break-words">${message}</p>
            ${undoHtml}
            ${progressHtml}
        </div>
        <button class="toast-dismiss flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-lg leading-none" aria-label="Dismiss">&times;</button>
    `;

    container.appendChild(toastEl);

    // Animate slide-in using CSS
    requestAnimationFrame(() => {
        toastEl.style.transition = 'all 0.3s ease-out';
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateX(100%)';
        requestAnimationFrame(() => {
            toastEl.style.opacity = '1';
            toastEl.style.transform = 'translateX(0)';
        });
    });

    // Dismiss button
    toastEl.querySelector('.toast-dismiss').addEventListener('click', () => dismissToast(id));

    // Undo button
    if (options.undoAction) {
        toastEl.querySelector('.toast-undo').addEventListener('click', () => {
            options.undoAction();
            dismissToast(id);
        });
    }

    // Pause timer on hover
    let dismissTimer = setTimeout(() => dismissToast(id), duration);
    toastEl.addEventListener('mouseenter', () => clearTimeout(dismissTimer));
    toastEl.addEventListener('mouseleave', () => {
        dismissTimer = setTimeout(() => dismissToast(id), duration);
    });

    const toastRecord = { id, type, message, el: toastEl, dismissTimer };
    visibleToasts.push(toastRecord);

    return id;
}

function dismissToast(id) {
    const idx = visibleToasts.findIndex(t => t.id === id);
    if (idx === -1) return;
    const record = visibleToasts[idx];
    clearTimeout(record.dismissTimer);
    const el = record.el;
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    setTimeout(() => {
        el.remove();
        visibleToasts.splice(idx, 1);
    }, 300);
}

function updateToastProgress(id, percent) {
    const record = visibleToasts.find(t => t.id === id);
    if (!record) return;
    const bar = record.el.querySelector('.toast-progress div');
    if (bar) bar.style.width = `${percent}%`;
}
```

#### 1.5 CSS Additions

```css
@keyframes slide-in {
    from { opacity: 0; transform: translateX(100%); }
    to { opacity: 1; transform: translateX(0); }
}
.animate-slide-in { animation: slide-in 0.3s ease-out; }
```

Also add styles for the drag-over overlay (section 2.2).

---

### 2. Drag-and-Drop File Upload

#### 2.1 Window-Level Events

Register three event listeners on `window` (in `setupEventListeners()`):

**`window dragover`:**
```js
window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    document.body.classList.add('drag-over');
});
```

**`window dragleave`:**
```js
window.addEventListener('dragleave', (e) => {
    // Only remove if the drag leaves the window entirely (not child elements)
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        document.body.classList.remove('drag-over');
    }
});
```

**`window drop`:**
```js
window.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    handleFileDrop(files[0]);
});
```

#### 2.2 Drag-Over Overlay

Add to HTML (hidden by default, shown via `.drag-over` on `<body>`):

```html
<div id="drag-overlay" class="fixed inset-0 z-40 bg-gray-950/70 backdrop-blur-sm hidden items-center justify-center">
    <div class="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-brand-500 p-12 text-center shadow-2xl">
        <i class="ph-fill ph-upload-simple text-5xl text-brand-500 mb-4"></i>
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Drop CSV or video here</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">Supports .csv telemetry files and video files</p>
    </div>
</div>
```

CSS:
```css
body.drag-over #drag-overlay { display: flex; }
#drag-overlay { transition: opacity 0.2s; }
```

#### 2.3 `handleFileDrop(file)` Function

```js
function handleFileDrop(file) {
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith('.csv');
    const isVideo = file.type.startsWith('video/');

    if (!isCsv && !isVideo) {
        showToast('warning', 'Unsupported file type. Please upload a CSV or video file.');
        return;
    }

    if (isCsv) {
        // Validate file size before parsing
        if (file.size > 50 * 1024 * 1024) {
            showToast('warning', 'File is very large (>50MB). Processing may be slow.');
        }
        showToast('info', `Loading ${file.name}...`);
        // Reuse CSV upload logic by simulating file input change
        const input = document.getElementById('csv-upload');
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
    } else {
        // Validate video size
        if (file.size > 4 * 1024 * 1024 * 1024) {
            showToast('warning', 'File is very large (>4GB). Processing may be slow.');
        }
        showToast('info', `Processing ${file.name}...`);
        const input = document.getElementById('video-upload');
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
    }
}
```

---

### 3. Upload Progress Feedback

#### 3.1 CSV Progress (Large Files)

For CSVs >5MB or >50k rows, use PapaParse's `step` callback to update a toast:

```js
// In handleFileUpload, after checking file size:
let progressToastId = null;
if (file.size > 5 * 1024 * 1024 || estimatedRowCount > 50000) {
    progressToastId = showToast('info', 'Parsing CSV...', { duration: 0 }); // no auto-dismiss
}

Papa.parse(file, {
    header: true, dynamicTyping: true, skipEmptyLines: true,
    step: (row, parser) => {
        if (progressToastId) {
            const meta = parser.getMeta();
            const pct = Math.min(100, Math.round((meta.cursor / file.size) * 100));
            updateToastProgress(progressToastId, pct);
        }
    },
    complete: (results) => {
        if (progressToastId) dismissToast(progressToastId);
        if (results.errors.length > 0) {
            showToast('warning', `CSV parsed with ${results.errors.length} errors. Some data may be incomplete.`);
        }
        processIncomingCSV(results.data);
        showToast('success', `Loaded ${results.data.length} data points.`);
    },
    error: (err) => {
        if (progressToastId) dismissToast(progressToastId);
        showToast('error', 'CSV parsing failed: ' + err.message);
    }
});
```

#### 3.2 Video Extraction Progress

In `extractTelemetryFromVideo`, track chunk count vs estimated total:

```js
let extractionToastId = showToast('info', 'Extracting telemetry from video...', { duration: 0 });
let chunkCount = 0;
let totalChunks = Math.ceil(file.size / 65536); // 64KB chunks estimate

// In readChunk loop:
chunkCount++;
if (chunkCount % 10 === 0) {
    const pct = Math.min(100, Math.round((chunkCount / totalChunks) * 100));
    updateToastProgress(extractionToastId, pct);
}

// On success:
dismissToast(extractionToastId);
const totalPoints = Object.values(sensors).reduce((sum, arr) => sum + arr.length, 0);
showToast('success', `Telemetry extracted: ${totalPoints} data points.`);
```

---

### 4. New Session Button

#### 4.1 HTML Addition

Add to the header, after the playback speed controls:

```html
<button id="new-session-btn" class="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors hidden" title="New Session" aria-label="Start a new session">
    <i class="ph ph-trash text-xl"></i>
</button>
```

Hidden until data is loaded (shown by `updateUIState()` alongside `file-info`).

#### 4.2 `resetAllData()` Function

```js
let undoState = null; // Stores snapshot for undo

function resetAllData() {
    // Snapshot current state for undo
    undoState = {
        rawData: [...rawData],
        lapsData: [...lapsData],
        videoBlobUrl: videoBlobUrl,
        telemetryCsvText: telemetryCsvText,
        telemetryDownloadName: telemetryDownloadName,
        telemetrySource: telemetrySource
    };

    // Clean up video blob URL
    if (videoBlobUrl) {
        URL.revokeObjectURL(videoBlobUrl);
        videoBlobUrl = null;
    }
    videoElements.forEach(v => {
        v.element.pause();
        v.element.removeAttribute('src');
        v.element.load();
    });
    videoElements = [];

    // Reset all state variables
    rawData = [];
    lapsData = [];
    selectedLapIndices = new Set(['all']);
    telemetryCsvText = '';
    telemetryDownloadName = 'telemetry.csv';
    telemetrySource = null;
    gatePoints = [];
    isDrawingGate = false;
    if (gateLayer) { map.removeLayer(gateLayer); gateLayer = null; }
    if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
    playbackState.currentValue = 0;
    playbackState.isPlaying = false;
    cancelAnimationFrame(playbackState.animFrameId);
    if (currentPositionMarker) { map.removeLayer(currentPositionMarker); currentPositionMarker = null; }

    // Reset UI
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('app-sidebar').classList.add('hidden');
    document.getElementById('dashboard-content').classList.add('hidden');
    document.getElementById('file-info').classList.add('hidden');
    document.getElementById('file-info').classList.remove('flex');
    document.getElementById('playback-bar').classList.add('hidden');
    document.getElementById('video-section').classList.add('hidden');
    document.getElementById('new-session-btn').classList.add('hidden');
    document.getElementById('draw-gate-btn').disabled = true;
    document.getElementById('download-csv-btn').classList.add('hidden');
    document.getElementById('filename-display').textContent = '';
    document.getElementById('lap-count-display').textContent = '';
    document.getElementById('csv-upload').value = '';

    showToast('info', 'Session cleared.', {
        undoAction: restoreSession
    });
}

function restoreSession() {
    if (!undoState) return;
    rawData = undoState.rawData;
    videoBlobUrl = undoState.videoBlobUrl;
    telemetryCsvText = undoState.telemetryCsvText;
    telemetryDownloadName = undoState.telemetryDownloadName;
    telemetrySource = undoState.telemetrySource;

    if (rawData.length > 0) {
        calculateDefaultSingleLap();
        showToast('success', 'Session restored.');
    }
    undoState = null;
}
```

The undo button in the toast has a 5-second window. After that, `undoState` is cleared:

```js
setTimeout(() => { undoState = null; }, 5000);
```

---

### 5. Replace All `alert()` Calls

Every `alert()` in the codebase must be replaced with `showToast()`. Here is the complete mapping (from Appendix A of the master plan):

| File / Location | Old Call | New Toast Call |
|---|---|---|
| `handleFileUpload` PapaParse error | `alert("Parsing Failure: " + err.message)` | `showToast('error', 'CSV parsing failed: ' + err.message)` |
| `handleFileUpload` FileReader error | `alert("Unable to read CSV file.")` | `showToast('error', 'Unable to read file. It may be corrupted.')` |
| `extractTelemetryFromVideo` MP4Box check | `alert("MP4Box is not available...")` | `showToast('error', 'MP4Box library failed to load. Please reload the page.')` |
| `extractTelemetryFromVideo` catch | `alert(error.message \|\| 'Telemetry extraction failed.')` | `showToast('error', 'Telemetry extraction failed. The video may not contain GoPro telemetry data.')` |
| `extractTelemetryFromVideo` PapaParse error | `alert('Telemetry parsing failed: ' + err.message)` | `showToast('error', 'Telemetry parsing failed: ' + err.message)` |
| `processIncomingCSV` no GPS columns | (implicit return) | `showToast('warning', 'No GPS data found in CSV. Check column names.')` |
| `processIncomingCSV` all NaN GPS | (implicit empty clean) | `showToast('warning', 'All GPS values are invalid.')` |
| Gate drawing cancelled (Esc) | (no feedback) | `showToast('info', 'Gate drawing cancelled.')` |
| Gate reset | (no feedback) | `showToast('info', 'Gate reset. Reverted to single lap.', { undoAction: restoreGate })` |
| Video codec unsupported | (no toast) | `showToast('warning', 'Video codec not supported in this browser.')` |
| No GPMD track | (console error) | `showToast('error', 'No GPMD telemetry track found in this video. Upload a CSV instead.')` |
| Bookmark at limit (50) | (no feedback) | `showToast('warning', 'Maximum 50 bookmarks reached. Remove existing bookmarks to add more.')` |

#### `restoreGate()` Function for Undo Support:

```js
let gateUndoState = null;

function resetGate() {
    // Snapshot before reset
    gateUndoState = {
        gatePoints: [...gatePoints],
        gateLayer: gateLayer,
        lapsData: [...lapsData],
        selectedLapIndices: new Set(selectedLapIndices)
    };

    // ... existing resetGate logic ...

    showToast('info', 'Gate reset. Reverted to single lap.', {
        undoAction: () => {
            if (gateUndoState) {
                gatePoints = gateUndoState.gatePoints;
                lapsData = gateUndoState.lapsData;
                selectedLapIndices = gateUndoState.selectedLapIndices;
                if (gateLayer) map.removeLayer(gateLayer);
                gateLayer = L.polyline(gatePoints, { color: '#ef4444', weight: 5, opacity: 1 }).addTo(map);
                updateUIState();
                updateVisualization();
                showToast('success', 'Gate restored.');
                gateUndoState = null;
            }
        }
    });
}
```

---

### 6. File Size Validation

Before parsing any file:

- **CSV > 50MB:** `showToast('warning', 'File is very large (>50MB). Processing may be slow.')` — still proceed
- **Video > 4GB:** `showToast('warning', 'File is very large (>4GB). Processing may be slow.')` — still proceed

Validate in both `handleFileUpload`, `handleVideoUpload`, and `handleFileDrop`.

---

### 7. Event Listeners Added

| Element ID | Event | Handler |
|---|---|---|
| `window` | `dragover` | Prevent default, set dropEffect, add `.drag-over` on body |
| `window` | `dragleave` | Remove `.drag-over` when drag leaves window |
| `window` | `drop` | `handleFileDrop(e)` — route CSV/video to upload handlers |
| `new-session-btn` | `click` | `resetAllData()` — clear all state with undo toast |
| Per-toast `.toast-dismiss` | `click` | Dismiss specific toast |
| Per-toast `.toast-undo` | `click` | Execute undo action then dismiss |

---

### 8. State Variables Added

| Variable | Type | Initial | Description |
|---|---|---|---|
| `toastIdCounter` | integer | `0` | Incrementing ID for toast instances |
| `visibleToasts` | Array | `[]` | Currently displayed toast records |
| `undoState` | object | `null` | Snapshot of state before session clear for undo |
| `gateUndoState` | object | `null` | Snapshot of gate state before reset for undo |

---

### 9. Functions Added / Modified

| Function | Change |
|---|---|
| `showToast(type, message, options)` | NEW — creates and displays a toast |
| `dismissToast(id)` | NEW — removes a toast with slide-out animation |
| `updateToastProgress(id, percent)` | NEW — updates progress bar on a toast |
| `handleFileDrop(file)` | NEW — routes dropped files to CSV/video handlers |
| `resetAllData()` | NEW — clears all state, revokes blob URLs, shows empty state |
| `restoreSession()` | NEW — restores previous session after undo |
| `restoreGate()` | NEW — restores gate and lap split after undo |
| `resetGate()` | MODIFIED — now snapshots state and shows undo toast |
| `handleFileUpload()` | MODIFIED — progress toast for large CSVs, replaces alert with toast |
| `handleVideoUpload()` | MODIFIED — progress toast for extraction, replaces alert with toast |
| `extractTelemetryFromVideo()` | MODIFIED — chunk-count progress toast |
| `updateUIState()` | MODIFIED — shows `new-session-btn` |
| `setupEventListeners()` | MODIFIED — registers dragover/dragleave/drop + new-session-btn click |

---

## CSS Additions

| Selector | Purpose |
|---|---|
| `#toast-container` | Fixed bottom-right, z-50, pointer-events-none |
| `.toast` | White/dark card, rounded-xl, shadow-lg, left border accent |
| `.toast-dismiss` | × button, hover turns darker |
| `.toast-undo` | Small brand-red text button |
| `.toast-progress` | 4px brand-red progress bar |
| `@keyframes slide-in` / `.animate-slide-in` | Slide in from right, 300ms ease-out |
| `#drag-overlay` | Full-window dashed overlay, hidden by default |
| `body.drag-over #drag-overlay` | Show overlay when dragging files |

---

## Testing Instructions

1. **After Phase 6**, drag a CSV file from Explorer onto the browser window → dashed overlay appears, drop it → toast "Loaded N data points" appears, auto-dismisses after 4s
2. Drag a `.txt` file → toast "Unsupported file type." warning (yellow, auto-dismiss 8s)
3. Drag a video file → toast "Processing filename..." appears during extraction
4. Click Gate Reset → toast "Gate reset. Reverted to single lap." with [Undo] button, click Undo → gate and lap splits restore
5. Click New Session → toast "Session cleared." + [Undo] button, wait 5s → state fully resets to empty state, no undo possible after 5s
6. Click New Session, then immediately click Undo → session restores (data, video, gate all back)
7. Upload a CSV >5MB → progress toast updates "Parsing row N of M..." during parse
8. Upload a video >4GB → warning toast "File is very large (>4GB). Processing may be slow."
9. Rapidly trigger 5 toasts → only 3 visible at a time, oldest auto-dismissed
10. Hover over a toast → auto-dismiss timer pauses, resume on mouseleave
11. Unsupported file via drag-drop → warning toast appears
12. All previous functionality (CSV upload, video playback, gate drawing, lap selection, chart zoom sync, playback bar) still works
