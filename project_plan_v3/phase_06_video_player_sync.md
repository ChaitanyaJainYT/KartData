# Phase 6: Video Player & Synchronization

**Builds on:** Phase 5 (playback works with cursor + map marker)
**Deliverable:** Video upload, a single primary video player with thumbnail strip, and full audio/video synchronization with the telemetry playback timeline.

---

## Goal

Upload a video file and synchronize it with telemetry playback. A single primary video player shows the video, color-coded to the currently active lap. Thumbnail cards below let the user switch sync target. Video playback rate adapts in distance mode.

---

## Features & Implementation Specs

### 1. Video Upload

**HTML (already in header):**
```html
<label id="video-upload-label" class="cursor-pointer ...">
    <i id="video-upload-icon" class="ph ph-video-camera ..."></i>
    <span id="video-btn-text">Add Video</span>
    <input type="file" id="video-upload" accept="video/*" class="hidden" />
</label>
```

**`handleVideoUpload(event)`**:
- Get file from `event.target.files[0]`; guard `if (!file) return`
- Call `setVideoUploadState(true, truncatedName)` — show spinner
- **Revoke old `videoBlobUrl`** before creating new: `if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl)`
- Create new blob URL: `videoBlobUrl = URL.createObjectURL(file)`
- Check if CSV already uploaded (`csv-upload.files.length > 0`). If not and `extractMetadataEnabled` is true:
  - `await extractTelemetryFromVideo(file)` (from Phase 1/3 — MP4Box GPMD extraction)
- `finally`: `setVideoUploadState(false)` — restore button to default state
- If `lapsData.length > 0`: call `updateVisualization()`

**`setVideoUploadState(isLoading, labelText)`**:
- Toggle `opacity-80` on label
- If loading: swap icon to `ph-spinner-gap animate-spin` with brand-red color, set text to truncated filename
- If not loading: restore icon to `ph-video-camera`, text to "Add Video"

### 2. Video Section HTML

```html
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
```

- Hidden until video loaded
- Size slider (`#video-size-slider`) controls video player width (200-800px, default 350px)
- Section height adjusts dynamically: `Math.round(currentVideoSize * 9 / 16) + 50` (for thumbnail strip)

### 3. Single Primary Video + Thumbnail Strip

**`renderVideoMonitorGrid(lapsToRender)`**:

- Guard: if no `videoBlobUrl`, hide `#video-section` and return
- Show video section, clear grid, reset `videoElements = []`
- Determine which laps to show:
  - If `selectedLapIndices.has('all')` and more than 4 laps selected: show only first 4, display a message: "Showing first 4 of N videos. Filter laps to view others."
  - Otherwise: show all selected laps

- For each lap to display, create a **thumbnail card**:
  ```html
  <div class="video-card relative bg-black rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all shadow-lg"
       style="border-color: {color}; width: {size}px; height: {size*9/16}px">
      <video src="{videoBlobUrl}" muted preload="auto" playsInline></video>
      <div class="error-overlay absolute inset-0 flex flex-col items-center justify-center bg-gray-950/95 text-white text-center p-4 z-20">
          <i class="ph ph-warning-octagon text-3xl text-red-500 mb-2"></i>
          <p class="text-sm font-bold">Playback Error</p>
          <p class="text-[10px] text-gray-400 mt-1">Check codec support.</p>
      </div>
      <div class="absolute top-2 left-2 bg-black/80 backdrop-blur text-white text-xs px-2.5 py-1 rounded-lg font-bold z-10 flex items-center gap-1.5 shadow-sm border border-white/10">
          <div class="w-2.5 h-2.5 rounded-full" style="background-color: {color}"></div>Lap {index + 1}
      </div>
  </div>
  ```

- The first card is the **primary** player (full size from slider); subsequent cards are **thumbnails** (same size)
- Bind events on each video:
  - `loadeddata`: if `video.videoWidth === 0`, add `has-error` class to wrapper
  - `error`: add `has-error` class to wrapper
- Push to `videoElements` array: `{ lapIndex: index, element: video, lapData: lap, lastIndex: 0 }`
- Click on a thumbnail card → switch primary sync target to that lap (update border color)
- After rendering: `syncVideosToStateTimeline(true)`

### 4. Video Elements Data Structure

```js
let videoElements = []; // Array<{ lapIndex, element, lapData, lastIndex }>
```

| Property | Type | Description |
|---|---|---|
| `lapIndex` | integer | Which lap this video element tracks |
| `element` | HTMLVideoElement | The `<video>` DOM element |
| `lapData` | Lap | Reference to the lap data for frame calculation |
| `lastIndex` | integer | Cached index of the last found point (optimization for linear search) |

Only one video element is actively synced at a time (the primary). Thumbnails follow the same source but may show different frames.

### 5. Timeline Synchronization (Enhanced from Phase 5)

**`syncVideosToStateTimeline(forceSeek)`** — Phase 5 version enhanced with video seeking:

**Video sync block** (new from Phase 5):
- For each element in `videoElements`:
  - Compute `targetFileTime`:
    - **Distance mode**: Find point where `lap[i].lapDistance >= currentValue`. Use that point's `.time` as `targetFileTime`. If beyond max distance, use lap's last point's time.
    - **Time mode**: `targetFileTime = lap[0].time + currentValue`. Clamped to `lap[lastPoint].time`.
  - Calculate drift: `diff = Math.abs(video.currentTime - targetFileTime)`
  - If `forceSeek` is true OR diff exceeds threshold:
    - Distance mode threshold: `0.15` seconds
    - Time mode threshold: `0.35` seconds
    - Set `video.currentTime = targetFileTime`

**Cursor and map sync** (from Phase 5, unchanged):
- Update `#scrubber-current` label
- For each selected lap, find matching point, update `lapMarkers`, `currentPositionMarker`, live telemetry
- Restyle chart cursor traces

### 6. Video Playback Rate Adjustment

**`updateVideoPlaybackRates()`**:
- Only active when `playbackState.isPlaying === true`
- For each video element:
  - **Time mode**: `element.playbackRate = playbackState.baseSpeed` (simple multiplier, 1x = real time)
  - **Distance mode**:
    1. Find the data point where `lap[i].lapDistance >= playbackState.currentValue` (starting from `lastIndex`)
    2. If point found and `pt.speedMS > 0.5`:
       - `targetSpeed = distanceSimSpeed * baseSpeed`
       - `rate = targetSpeed / pt.speedMS`
       - Clamp rate to `[0.15, 5.0]`. If outside clamp, use `1.0`
    3. If no point found or speed too low: use `1.0`

### 7. Video Size Slider

- `#video-size-slider`: `<input type="range" min="200" max="800" value="350">`
- On `input`: update `currentVideoSize`, resize all `.video-card` elements (width + 16:9 height), resize `#video-section` height
- Height formula: `Math.round(currentVideoSize * 9 / 16) + 60`

### 8. Blob URL Lifecycle

- On new video upload: `if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl)` before creating new
- All video elements share the same `src = videoBlobUrl`
- On session clear: revoke `videoBlobUrl`

### 9. Error Handling

- If `videoWidth === 0` after `loadeddata` event: add `has-error` class to `.video-card`
- Error overlay shows: warning octagon icon, "Playback Error", "Check codec support."
- CSS hidden by default: `.video-card .error-overlay { display: none; }`
- CSS shown: `.video-card.has-error .error-overlay { display: flex; }`

### 10. Chart Click + Video Seek

Chart click (from Phase 5) already calls `manualSeek()`, which calls `syncVideosToStateTimeline(true)` with `forceSeek=true`. This automatically seeks the video to the matching frame. No additional changes needed.

### 11. Video Play/Pause Sync

- `startPlayback()`: calls `v.element.play()` on all video elements (catch DOMException silently)
- `pausePlayback()`: calls `v.element.pause()` on all video elements
- `stepFrame()`: calls `pausePlayback()` first, so videos stay paused during frame stepping

---

## State Variables Added / Modified

| Variable | Type | Initial | Description |
|---|---|---|---|
| `videoBlobUrl` | string | `null` | Blob URL for uploaded video file. Created by `handleVideoUpload()` |
| `videoElements` | Array | `[]` | Array of `{ lapIndex, element, lapData, lastIndex }`. Set by `renderVideoMonitorGrid()` |
| `currentVideoSize` | integer | `350` | Video card width in pixels (200-800). Set by video size slider |
| `isUploadingVideo` | boolean | `false` | Prevents re-entrant video upload. Set by `setVideoUploadState()` |

---

## Functions Added / Modified

| Function | Change |
|---|---|
| `handleVideoUpload(event)` | NEW — file picker, blob URL creation, extraction trigger |
| `setVideoUploadState(isLoading, labelText)` | NEW — spinner/loading state for upload button |
| `renderVideoMonitorGrid(lapsToRender)` | NEW — primary player + thumbnail strip rendering |
| `syncVideosToStateTimeline(forceSeek)` | ENHANCED — now seeks video elements to matching frame |
| `updateVideoPlaybackRates()` | ENHANCED — distance mode adaptive rate logic |
| `updateVisualization()` | ENHANCED — now includes `renderVideoMonitorGrid()` |
| `startPlayback()` | ENHANCED — calls `play()` on video elements |
| `pausePlayback()` | ENHANCED — calls `pause()` on video elements |

---

## CSS Additions

| Selector | Purpose |
|---|---|
| `.video-card video` | Fill card, object-fit cover, black background, rounded |
| `.video-card .error-overlay` | Hidden by default |
| `.video-card.has-error .error-overlay` | Flex display on error |
| `#video-section` | Dark background, hidden until video loaded |

---

## Event Listeners Added

| Element ID | Event | Handler |
|---|---|---|
| `video-upload` | `change` | `handleVideoUpload` |
| `video-size-slider` | `input` | Resize all video cards + section height |
| Per-video `<video>` | `loadeddata` | Check `videoWidth === 0` → add `has-error` |
| Per-video `<video>` | `error` | Add `has-error` class |

---

## Testing Instructions

1. **After Phase 5**, upload a GoPro MP4 video file → video section appears below the charts with a single primary video player
2. **Play with video**: Click play → video plays synchronized with chart cursor and map marker. Speed, time, and lap display update in the live telemetry panel
3. **Scrubber seek**: Drag scrubber → video seeks to the matching frame (may show a different frame than the primary if a thumbnail is actively synced)
4. **Time mode**: Switch to Time mode → video playback rate matches `baseSpeed` (1x = real time)
5. **Distance mode**: Switch to Distance mode → video rate adapts based on `distanceSimSpeed / actualSpeedMS`, clamped to [0.15, 5.0]. Faster telemetry speed → faster video playback
6. **Thumbnail cards**: Multiple thumbnail cards appear per selected lap (max 4). Each shows a color dot and lap number. Click a thumbnail → that lap becomes the primary sync target
7. **Video size slider**: Drag the video size slider → video player width changes (200-800px), height maintains 16:9 ratio
8. **New video upload**: Upload a second video → old blob URL cleaned up, new video replaces the old one. Verify no memory leaks via browser devtools
9. **Error overlay**: If the browser doesn't support the video codec, the error overlay appears ("Playback Error" with warning icon)
10. **Chart click seeks video**: Click a point on the speed chart → video seeks to the matching frame (forceSeek = true)
