# Phase 8: Direct MP4 GPMD Telemetry Extraction

**Builds on:** Phase 7 (toasts, drag-drop work; video upload creates blob URL)
**Deliverable:** Extract GPMD telemetry from GoPro MP4 files directly — no CSV file needed. Generate downloadable CSV matching the exact 27-column schema. All user feedback via toast notifications.

---

## Goal

When a user uploads an MP4 video with a GoPro GPMD telemetry track, the application extracts GPS, accelerometer, gyroscope, gravity, and orientation data directly from the video file. The extracted data follows the same processing pipeline as a CSV upload, so the map, charts, and playback all work identically.

---

## Features & Implementation Specs

### 1. `extractTelemetryFromVideo(file)` — Async Extraction

This function already exists in the v5 codebase as a scaffold. This phase completes and refines it.

```js
async function extractTelemetryFromVideo(file) {
    // Guard: MP4Box must be loaded
    if (!window.MP4Box) {
        showToast('error', 'MP4Box library failed to load. Please reload the page.');
        return;
    }

    const fileNameBase = file.name.replace(/\.[^/.]+$/, "");
    const sensors = { ACCL: [], GYRO: [], GPS9: [], GRAV: [], CORI: [] };
    let gpmdTrackId = null;
    let timescale = 1000;

    // Show progress toast
    const toastId = showToast('info', `Extracting telemetry from ${fileNameBase}...`, { duration: 0 });
    const totalChunks = Math.max(1, Math.ceil(file.size / 65536));
    let chunkCount = 0;

    const mp4box = MP4Box.createFile();
    const extractionPromise = new Promise((resolve, reject) => {
        mp4box.onReady = (info) => {
            const track = info.tracks.find(t => t.codec === 'gpmd');
            if (!track) {
                reject(new Error('No GPMD telemetry track found in this video. Upload a CSV instead.'));
                return;
            }
            gpmdTrackId = track.id;
            timescale = track.timescale;
            mp4box.setExtractionOptions(gpmdTrackId);
            mp4box.start();
        };

        mp4box.onError = (error) => reject(error);

        mp4box.onSamples = (id, user, samples) => {
            if (id !== gpmdTrackId) return;
            samples.forEach(sample => {
                const ctsMs = (sample.cts / timescale) * 1000;
                const durMs = (sample.duration / timescale) * 1000;
                parseGPMD(sample.data, ctsMs, durMs, sensors);
            });
        };

        const reader = file.stream().getReader();
        let offset = 0;

        const readChunk = async () => {
            const { done, value } = await reader.read();
            if (done) {
                mp4box.flush();
                resolve();
                return;
            }
            const buffer = value.buffer;
            buffer.fileStart = offset;
            offset += buffer.byteLength;
            mp4box.appendBuffer(buffer);

            // Update progress
            chunkCount++;
            if (chunkCount % 20 === 0) {
                const pct = Math.min(100, Math.round((chunkCount / totalChunks) * 100));
                updateToastProgress(toastId, pct);
            }

            await readChunk();
        };

        readChunk().catch(reject);
    });

    try {
        await extractionPromise;
    } catch (error) {
        console.error(error);
        dismissToast(toastId);
        showToast('error', error.message || 'Telemetry extraction failed. The video may not contain GoPro telemetry data.');
        return;
    }

    // Build CSV from extracted sensors
    dismissToast(toastId);
    telemetryCsvText = buildCombinedTelemetryCsv(sensors, fileNameBase);
    const totalPoints = Object.values(sensors).reduce((sum, arr) => sum + arr.length, 0);
    showToast('success', `Telemetry extracted: ${totalPoints} data points.`);

    telemetrySource = 'video';
    telemetryDownloadName = `${fileNameBase}_Full_Telemetry.csv`;
    document.getElementById('download-csv-btn').classList.remove('hidden');
    document.getElementById('filename-display').textContent = `${fileNameBase} \u2022 extracted`;

    // Parse the built CSV and process it through the same pipeline
    Papa.parse(telemetryCsvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
            if (results.errors.length > 0) {
                showToast('warning', `Telemetry CSV built with ${results.errors.length} warnings.`);
            }
            processIncomingCSV(results.data);
        },
        error: (err) => {
            showToast('error', 'Telemetry parsing failed: ' + err.message);
        }
    });
}
```

#### Error Handling Within Extraction:

| Scenario | Toast | Action |
|---|---|---|
| `window.MP4Box` undefined | `showToast('error', 'MP4Box library failed to load...')` | Return early |
| No track with `codec === 'gpmd'` | `showToast('error', 'No GPMD telemetry track found...')` | Reject promise |
| `mp4box.onError` fires | `showToast('error', 'Telemetry extraction failed...')` | Reject promise |
| Read stream error | `showToast('error', 'Unable to read video file...')` | Reject promise |
| Zero samples extracted | `showToast('warning', 'No telemetry data extracted...')` | Still build CSV (just headers) |

---

### 2. `parseGPMD(data, baseCts, duration, sensors)` — KLV Parser

Recursive parser for the GoPro KLV (Key-Length-Value) metadata format embedded in MP4 GPMD tracks.

#### 2.1 Header Format

Each KLV entry has an 8-byte header:

| Offset | Size | Field | Type | Description |
|--------|------|-------|------|-------------|
| 0 | 4 | fourcc | ASCII | Four-character code: `DEVC`, `STRM`, `TAMP`, `ACCL`, `GYRO`, `GRAV`, `CORI`, `GPS9` |
| 4 | 1 | type | ASCII | Data type: `f` (float), `s` (signed int16), `c` (char), `l` (signed int32) |
| 5 | 1 | size | uint8 | Bytes per sample element |
| 6 | 2 | count | uint16 BE | Number of samples |

Payload size: `pSize = size * count`

#### 2.2 Four-Char Codes and Parsing

**Container codes** (recurse into payload):
- `DEVC`, `STRM` → recursive call into payload region

**Data codes:**

| Code | Structure | Bytes/Sample | Parsing |
|------|-----------|-------------|---------|
| `TAMP` | int16 | 2 | `view.getInt16(pOff) / 100` — store as `currentTemp`, used by subsequent ACCL/GYRO blocks |
| `ACCL` | float: 3×float32 (12B) or int16: 3×int16 (6B) | 12 or 6 | `x: isFloat ? float32 : int16/100`, `y, z` same. Push `{ ts, x, y, z, temp }` |
| `GYRO` | float: 3×float32 (12B) or int16: 3×int16 (6B) | 12 or 6 | Same as ACCL but int16 divisor = 1000. Push `{ ts, x, y, z, temp }` |
| `GRAV` | float: 3×float32 (12B) or int16: 3×int16 (6B) | 12 or 6 | Same structure, int16 divisor = 4096. Push `{ ts, x, y, z }` |
| `CORI` | float: 4×float32 (16B) or int16: 4×int16 (8B) | 16 or 8 | `w, x, y, z`. Float or int16/32767. Push `{ ts, w, x, y, z }` |
| `GPS9` | Fixed 32B per sample | 32 | `lat: int32/1e7`, `lon: int32/1e7`, `alt: int32/1000`, `speed2d: int32/1000`, `speed3d: int32/1000`, `days: uint32`, `secs: uint32/1000`, `dop: uint16/100`, `fix: uint16`, `altSys: 'MSLV'`. Push `{ ts, lat, lon, alt, speed2d, speed3d, days, secs, dop, fix, altSys }` |

#### 2.3 Timestamp Assignment

Each sample's absolute timestamp is computed as:
```
sampleTs = baseCts + (sampleIndex * (duration / totalSamples))
```

Where `baseCts` is the sample's CTS in milliseconds (computed as `(sample.cts / timescale) * 1000`) and `duration` is the sample's duration in milliseconds.

#### 2.4 4-Byte Alignment

After processing a KLV entry, advance the position by:
```js
i += 8 + Math.ceil(pSize / 4) * 4;
```

This ensures alignment to 4-byte boundaries (GPMD spec requirement).

#### 2.5 Edge Cases

- Unknown fourcc → silently skip (advance by aligned length)
- Partial last sample → `Math.floor(pSize / bytesPerSample)` for graceful truncation
- Zero-length payload → advance by 8 (header only), skip processing
- No TAMP before ACCL/GYRO → `currentTemp` remains null, `temp` field is empty in output

---

### 3. `buildCombinedTelemetryCsv(sensors, fileName)` — CSV Builder

Already implemented in v5; this phase ensures it matches the exact 27-column schema from Section 16 of the master plan.

#### 3.1 Algorithm

1. Collect all unique timestamps from all 5 sensor arrays
2. Sort timestamps numerically (parse float)
3. For each sensor type, build a `Map<string, point>` keyed by `ts.toFixed(6)`
4. Iterate sorted timestamps, combine data from all 5 maps
5. Compute ISO date from GPS `days` + `secs` (reference date: `2000-01-01T00:00:00.000Z`)
6. Output exactly 27 columns in order

#### 3.2 CSV Column Order (Exact)

```
cts,date,ACCL_x,ACCL_y,ACCL_z,temp_ACCL,GYRO_x,GYRO_y,GYRO_z,temp_GYRO,GRAV_x,GRAV_y,GRAV_z,CORI_w,CORI_x,CORI_y,CORI_z,GPS (Lat.) [deg],GPS (Long.) [deg],GPS (Alt.) [m],GPS (2D) [m/s],GPS (3D) [m/s],GPS (days) [deg],GPS (secs) [s],GPS (DOP) [deg],GPS (fix) [deg],altitude system
```

#### 3.3 Missing Values

Any field not present for a given timestamp → output as empty string `""` (not `null`, not `undefined`, not `"null"`).

#### 3.4 Interleaved Data Behavior

Different sensors fire at different rates:
- ACCL, GYRO: ~200 Hz
- GRAV: ~60 Hz
- GPS9: ~18 Hz
- CORI: ~200 Hz

The merge produces rows where some fields are filled and others are empty. For example, a row at timestamp `0.000000` may have ACCL data but no GPS data, and the next row at `0.005000` may have GPS data but no ACCL data.

#### 3.5 Date Computation (Known Approximation)

```js
const gpsBaseDate = new Date(Date.UTC(2000, 0, 1));
// GPS days + secs → relative to this reference
const d = new Date(gpsBaseDate.getTime() + (gps.days * 86400000) + (gps.secs * 1000));
currentDateStr = d.toISOString();
```

**Note:** The GPS epoch is actually January 6, 1980, but `buildCombinedTelemetryCsv` in v5 hardcodes `2000-01-01` as the reference. This is a known approximation that may produce incorrect dates. If more accurate dates are needed, the reference should be updated to `1980-01-06`.

---

### 4. Extract Telemetry Toggle

The checkbox `#extract-telemetry-toggle` controls whether auto-extraction runs:

```html
<label class="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    <input type="checkbox" id="extract-telemetry-toggle" class="rounded text-brand-600 focus:ring-0" checked>
    <span>Extract from video</span>
</label>
```

```js
// In setupEventListeners:
document.getElementById('extract-telemetry-toggle').addEventListener('change', (e) => {
    extractMetadataEnabled = e.target.checked;
});
```

When unchecked, `handleVideoUpload` skips `extractTelemetryFromVideo()` entirely — just creates the blob URL for video playback. This is useful when the user already has telemetry from a CSV upload and only wants the video.

---

### 5. Download CSV Button

```html
<button id="download-csv-btn" class="hidden items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 transition-all hover:bg-gray-50 dark:hover:bg-gray-700">
    <i class="ph ph-download-simple text-base"></i>
    Download CSV
</button>
```

Behavior:
- Hidden by default (`class="hidden"`)
- Shown by `extractTelemetryFromVideo` after successful extraction
- Also shown by `handleFileUpload` after reading CSV content
- Click → `downloadTelemetryCsv()` creates Blob download:

```js
function downloadTelemetryCsv() {
    if (!telemetryCsvText) return;
    const blob = new Blob([telemetryCsvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = telemetryDownloadName;
    link.click();
    URL.revokeObjectURL(url);
}
```

#### Download Naming Convention

| Source | Download Name |
|--------|--------------|
| CSV upload | `{originalFileName}_Telemetry.csv` |
| Video extraction | `{videoFileName}_Full_Telemetry.csv` |

---

### 6. Upload Loading State

`setVideoUploadState(isLoading, labelText)` toggles the video upload button:

| State | Icon | Text | Opacity |
|-------|------|------|---------|
| Default | `ph-video-camera` (gray) | "Add Video" | 100% |
| Loading | `ph-spinner-gap animate-spin` (brand-red) | Truncated filename (15 chars max) | 80% |

```js
function setVideoUploadState(isLoading, labelText) {
    isUploadingVideo = isLoading;
    const label = document.getElementById('video-upload-label');
    const icon = document.getElementById('video-upload-icon');
    const text = document.getElementById('video-btn-text');
    if (!label || !icon || !text) return;

    label.classList.toggle('opacity-80', isLoading);
    if (isLoading) {
        icon.className = 'ph ph-spinner-gap animate-spin text-lg text-brand-600';
        text.textContent = labelText || 'Uploading...';
        text.classList.add('text-brand-600', 'font-bold');
    } else {
        icon.className = 'ph ph-video-camera text-lg text-gray-500 dark:text-gray-400';
        text.textContent = 'Add Video';
        text.classList.remove('text-brand-600', 'font-bold');
    }
}
```

---

### 7. Video Upload Flow (Modified)

`handleVideoUpload(event)` now includes extraction logic:

```js
async function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file size
    if (file.size > 4 * 1024 * 1024 * 1024) {
        showToast('warning', 'File is very large (>4GB). Processing may be slow.');
    }

    const truncatedName = file.name.length > 15
        ? file.name.substring(0, 15) + '...'
        : file.name;
    setVideoUploadState(true, truncatedName);

    // Revoke old blob URL before creating new
    if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    videoBlobUrl = URL.createObjectURL(file);

    const hasCsvUpload = document.getElementById('csv-upload').files &&
                         document.getElementById('csv-upload').files.length > 0;

    try {
        if (!hasCsvUpload && extractMetadataEnabled) {
            await extractTelemetryFromVideo(file);
        } else {
            // No extraction — hide download button if we already have a CSV
            if (hasCsvUpload) {
                document.getElementById('download-csv-btn').classList.add('hidden');
            }
        }
    } catch (err) {
        console.error('Video upload error:', err);
        showToast('error', 'Video upload failed: ' + err.message);
    } finally {
        setVideoUploadState(false);
    }

    if (lapsData.length > 0) updateVisualization();
}
```

---

### 8. State Variables Used / Modified

| Variable | Type | Description |
|---|---|---|
| `sensors` | Object | `{ ACCL: [], GYRO: [], GPS9: [], GRAV: [], CORI: [] }` — populated during extraction |
| `telemetryCsvText` | string | Set to the built CSV text after extraction |
| `telemetrySource` | string | Set to `'video'` |
| `telemetryDownloadName` | string | Derived from video filename |
| `extractMetadataEnabled` | boolean | Controls whether extraction runs (from toggle checkbox) |
| `isUploadingVideo` | boolean | Guards against re-entrant upload |

---

### 9. Functions Added / Modified

| Function | Change |
|---|---|
| `extractTelemetryFromVideo(file)` | ENHANCED — full implementation with progress toast, error handling via toast, CSV pipeline |
| `parseGPMD(data, baseCts, duration, sensors)` | ENHANCED — complete KLV parser for all 5 sensor types + TAMP + container recursion |
| `buildCombinedTelemetryCsv(sensors, fileName)` | ENHANCED — ensured exact 27-column output matching Section 16 |
| `handleVideoUpload(event)` | ENHANCED — file size validation, extraction call, error handling |
| `setVideoUploadState(isLoading, labelText)` | ENHANCED — loading spinner state |
| `downloadTelemetryCsv()` | ENHANCED — filename logic for extracted data |

---

### 10. Sensor Data Timestamps

All sensor timestamps are in **milliseconds** (ctsMs), representing the absolute time since the video file's start. When combined into the CSV, they are output in **seconds** (cts / 1000) in the `cts` column.

The timestamp key for merging uses `toFixed(6)` (microsecond precision) to avoid floating-point comparison issues across sensors that fired at slightly different nominal times.

---

### 11. Upload with Both CSV and Video

When a user uploads both a CSV (containing GPS data) and a video:
1. The CSV is processed first
2. The video blob URL is created
3. Since `hasCsvUpload === true`, extraction is **skipped**
4. The video plays synchronized with the CSV telemetry

When a user uploads only a video:
1. The video blob URL is created
2. If `extractMetadataEnabled` is true and no CSV exists, extraction runs
3. The extracted data is treated exactly as if it came from a CSV upload

---

## Testing Instructions

1. **After Phase 7**, upload a GoPro MP4 with GPMD track → progress toast updates during extraction, then "Telemetry extracted: N data points" success toast
2. Verify: map shows GPS track, speed charts display data, playback bar works, live telemetry updates
3. Click Download CSV → file downloads with all 27 columns matching the schema from Section 16
4. Open the downloaded CSV in a text editor → verify column order: `cts,date,ACCL_x,...,altitude system`
5. Uncheck "Extract from video" → upload video → only video appears, no telemetry extracted, no telemetry toast
6. Upload MP4 without GPMD track → toast "No GPMD telemetry track found in this video. Upload a CSV instead."
7. Upload CSV first, then upload video → CSV data preserved, video added for playback, no extraction run
8. Upload MP4 only (telemetry extracted) → all features (gate drawing, lap split, chart zoom, frame stepping, video sync) work identically to CSV upload
9. Verify blob URL cleanup: upload second video → first video's blob URL revoked, only second video plays
