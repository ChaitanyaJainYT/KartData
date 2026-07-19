# Phase 17: Mobile Responsive, PWA, Accessibility & Performance

**Builds on:** Phase 16 (Layout Manager works)

**Goal:** Mobile-responsive layout at <768px, PWA support for offline paddock use, WCAG AA accessibility compliance, performance hardening (dt cap, visibility detection, binary search), and session report export.

---

## Mobile Responsive (<768px)

### Media Query Breakpoint

All mobile styles activate at @media (max-width: 767px).

### Sidebar — Full-Screen Overlay Drawer

- Triggered by hamburger icon in header.
- Semi-transparent backdrop (g-black/50), click to close.
- Drawer slides in from left, width: 85vw (max 320px).
- Close triggers: tap backdrop, Esc key, or close (x) button in sidebar header.
- Drawer contains all sidebar content (lap list, statistics panel, gate controls, bookmarks).

### Main Area Layout Changes

| Desktop | Mobile |
|---|---|
| Sidebar inline (280px) | Sidebar = overlay drawer |
| Map + charts side-by-side (row) | Map + charts stacked (column) |
| Map ~55%, Charts ~45% | Map full width, ~50vh height |
| Charts column beside map | Charts tabbed below map (Speed / Altitude / G-Force / G-G) |
| Video beside charts | Video full width, below charts |

### Chart Tabs on Mobile

- Tab bar at top of chart area with 4 options: "Speed" / "Altitude" / "G-Force" / "G-G"
- Only one chart visible at a time.
- Swipe left/right on chart area to switch tabs.
- Default tab: "Speed" (shows Speed vs Distance and Speed vs Time stacked).

### Video Section on Mobile

- Primary player: 100% width.
- Thumbnail cards scroll horizontally below the player.

### Playback Bar Simplified

| Desktop | Mobile |
|---|---|
| Frame-step buttons visible | Frame-step buttons hidden (too small for touch) |
| Scrubber height: 4px track | Scrubber height: 24px track (easier to touch) |
| Mode buttons: text labels | Mode buttons: icons only |
| Live telemetry: full text | Live telemetry: compact row pinned above playback bar |

### Touch Targets

All buttons and interactive elements must have a minimum touch target of **44x44px** (per WCAG 2.5.8 / Apple HIG).

### Header on Mobile

- Subtitle "Precision Telemetry Suite" hidden (hidden md:block).
- Fewer header controls visible; overflow into a "more" menu if needed.

### Layout Presets Disabled on Mobile

Preset dropdown is hidden at <768px (too complex for small screens). The layout manager still works but only with drag handles and toggle buttons.

---

## Touch Gestures

| Gesture | Element | Action |
|---|---|---|
| Swipe left / right | Scrubber | Seek forward / backward by 1 second |
| Double-tap | Map | Zoom in (native Leaflet behavior) |
| Two-finger pinch | Charts | Zoom in/out (Plotly built-in) |
| Tap | Video player | Toggle HUD overlay visibility |

Touch events are passive where possible. Swipe detection uses 	ouchstart/	ouchmove/	ouchend with delta threshold of 30px to distinguish swipe from scroll.

---

## PWA Support

### manifest.json

`json
{
  "name": "KartData",
  "short_name": "KartData",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#0a0d14",
  "theme_color": "#ef4444",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
`

### Service Worker (sw.js)

Strategy: **Cache-first** for all static assets (HTML, CSS, JS, fonts, CDN libraries). No network-first needed — all data is local.

`js
const CACHE_NAME = 'kartdata-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/styles/global.css',
  '/app.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.plot.ly/plotly-2.27.0.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js',
  'https://unpkg.com/@phosphor-icons/web@latest',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});
`

### Registration (in main HTML)

`html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#ef4444">
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
</script>
`

---

## Accessibility

### ARIA Labels on All Icon-Only Buttons

| Element | ria-label |
|---|---|
| Theme toggle button | "Toggle dark mode" |
| Play/Pause button | "Play" or "Pause" (dynamic) |
| Frame step backward | "Step backward 0.04s" |
| Frame step forward | "Step forward 0.04s" |
| Distance mode button | "Distance mode" |
| Time mode button | "Time mode" |
| Draw gate button | "Draw gate line" |
| Reset gate button | "Reset gate" |
| Sidebar toggle | "Toggle sidebar" |
| Fullscreen button | "Toggle fullscreen" |
| Map toggle button | "Toggle map panel" |
| Charts toggle button | "Toggle charts panel" |
| Video toggle button | "Toggle video section" |
| Download CSV button | "Download telemetry CSV" |
| New Session button | "Start new session" |
| Settings button | "Open settings" |
| Bookmark button | "Place bookmark" |

### Live Regions

- #stepText: ria-live="polite" — announces gate drawing state changes to screen readers.
- #toast-container: ria-live="polite" — announces toast notifications.

### Focus Indicators

`css
:focus-visible {
  outline: 2px solid #ef4444;
  outline-offset: 2px;
}
`

Applied to all interactive elements (buttons, inputs, selects, links).

### Keyboard Tab Order

Tab order follows visual layout: Header -> Sidebar -> Main (map, charts) -> Playback bar.

- All interactive elements reachable via Tab.
- No 	abindex values greater than 0 (use document order).
- Skip-link provided: "Skip to main content" as first focusable element.

### prefers-reduced-motion

`css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`

Disables all animations: sidebar expand/collapse, panel hide/show transitions, button scale transforms, pulse animations, toast slide-in.

### Color Contrast

All text meets WCAG AA (4.5:1 minimum contrast ratio) against its background. Verify using browser DevTools accessibility inspector:

- Text on --bg-app (#0a0d14) -> #94a3b8 (gray-400): ratio ~7.5:1 (pass)
- Text on --bg-panel (#151924) -> #cbd5e1 (gray-300): ratio ~7.0:1 (pass)
- Text on --bg-card (#1e293b) -> #f8fafc (gray-50): ratio ~13.5:1 (pass)
- Brand red (#ef4444) on dark backgrounds: ratio ~4.6:1 (pass)

---

## Performance Hardening

### Delta-Time Cap in playbackLoop()

In the playbackLoop() function, cap the frame delta to prevent massive jumps after tab switch or UI blocking:

`js
function playbackLoop() {
  if (!playbackState.isPlaying) return;
  const now = performance.now();
  let dt = (now - playbackState.lastFrameTime) / 1000;
  dt = Math.min(dt, 0.1); // cap at 100ms
  playbackState.lastFrameTime = now;

  if (playbackState.mode === 'time') {
    playbackState.currentValue += dt * playbackState.baseSpeed;
  } else {
    playbackState.currentValue += playbackState.distanceSimSpeed * playbackState.baseSpeed * dt;
  }

  if (playbackState.currentValue > playbackState.maxValue) {
    playbackState.currentValue = 0;
  }

  document.getElementById('main-scrubber').value = playbackState.currentValue;
  syncVideosToStateTimeline(false);
  updateVideoPlaybackRates();
  requestAnimationFrame(playbackLoop);
}
`

### Visibility Detection

Automatically pause playback when user switches tabs or minimizes window:

`js
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playbackState.isPlaying) {
    pausePlayback();
  }
});
`

Resume is manual (user clicks Play). This prevents the video from playing in the background and avoids the large dt cap from firing on tab return.

### Binary Search for Seek

Replace the linear ind() in syncVideosToStateTimeline with pre-computed binary search lookup tables.

**Build lookup tables once per lap (after lap calculation):**

In calculateLapsWithGate() and calculateDefaultSingleLap(), add:

`js
lap._distanceLookup = lap.map((p, i) => ({
  dist: p.lapDistance,
  time: p.time,
  index: i
}));
lap._timeLookup = lap.map((p, i) => ({
  time: p.time - lap[0].time,
  dist: p.lapDistance,
  index: i
}));
`

**Binary search function:**

`js
function binarySearch(arr, target, key = 'dist') {
  if (!arr || arr.length === 0) return null;
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid][key] < target) lo = mid + 1;
    else hi = mid;
  }
  return arr[lo] || arr[arr.length - 1];
}
`

**In syncVideosToStateTimeline, use:**

`js
// Distance mode: find point by lapDistance
const lookup = lapData._distanceLookup;
const pt = binarySearch(lookup, currentValue, 'dist');

// Time mode: find point by relative time
// const pt = binarySearch(lapData._timeLookup, currentValue, 'time');
`

This reduces seek complexity from O(n) to O(log n) per frame.

---

## Session Report Export

### Trigger

Button in header or settings: "Export Report". Disabled until lapsData.length > 0.

### Generated Content

An HTML document (opened in a new tab) containing:

1. **Session info:** filename, date, lap count, telemetry source (CSV/video).
2. **Lap table:** all lap times, delta to best, sector times (if sectors computed).
3. **Best lap summary:** highlighted row with green accent, trophy icon.
4. **Statistics table:** per-lap avg speed, max speed, min speed, max lateral G, distance (from phase 13).
5. **Chart screenshots:**
   - Uses Plotly.toImage('chart-speed-dist', { format: 'png', width: 800, height: 400 }) for each visible chart.
   - Embeds as base64 PNG <img src="data:image/png;base64,...">.
6. **Bookmarks list:** all bookmarks with timestamps and notes.
7. **Map image (optional):** Uses map.getContainer() to capture current map view via html2canvas or similar library. Falls back to a link if library unavailable.

### Implementation

`js
function exportReport() {
  const doc = window.open('', '_blank');
  let html = '<!DOCTYPE html><html><head><title>KartData Report</title>';
  html += '<style>body{font-family:Inter,sans-serif;background:#fff;color:#1e293b;padding:40px;max-width:900px;margin:auto}';
  html += 'table{width:100%;border-collapse:collapse;margin:16px 0}';
  html += 'th,td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left;font-size:14px}';
  html += 'th{background:#f8fafc;font-weight:600}.best{background:#f0fdf4}';
  html += 'h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:24px 0 8px;border-bottom:2px solid #ef4444;padding-bottom:4px}';
  html += '.meta{color:#64748b;font-size:14px;margin-bottom:24px}</style></head><body>';

  html += <h1>KartData Session Report</h1>;
  html += <div class="meta">File:  | Laps:  | Source: </div>;

  // Lap table
  html += '<h2>Lap Times</h2><table><thead><tr><th>Lap</th><th>Time</th><th>Delta</th><th>Avg Speed</th><th>Max Speed</th></tr></thead><tbody>';
  const bestTime = Math.min(...lapsData.map(l => l.duration).filter(d => d > 0));
  lapsData.forEach((lap, i) => {
    const isBest = lap.duration === bestTime && lapsData.length > 1;
    const delta = isBest ? '—' : +s;
    const avgSpeed = (lap.reduce((s, p) => s + p.speed, 0) / lap.length).toFixed(1);
    const maxSpeed = Math.max(...lap.map(p => p.speed)).toFixed(1);
    html += <tr><td>Lap </td><td></td><td></td><td></td><td></td></tr>;
  });
  html += '</tbody></table>';

  // Charts
  html += '<h2>Charts</h2>';
  document.querySelectorAll('[id^="chart-"]').forEach(el => {
    if (el.data) {
      Plotly.toImage(el, { format: 'png', width: 800, height: 400 }).then(url => {
        html += <img src="" style="max-width:100%;margin:8px 0;border:1px solid #e2e8f0;border-radius:8px">;
      });
    }
  });

  // Map snapshot
  html += '<h2>Map</h2>';
  if (map) {
    try {
      const mapCanvas = document.createElement('canvas');
      const leafletContainer = map.getContainer();
      html2canvas(leafletContainer).then(canvas => {
        html += <img src="" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px">;
      }).catch(() => {
        html += '<p>Map snapshot unavailable.</p>';
      });
    } catch (e) {
      html += '<p>Map snapshot unavailable.</p>';
    }
  }

  // Bookmarks
  const bookmarks = JSON.parse(localStorage.getItem('kartdata-bookmarks') || '[]');
  if (bookmarks.length > 0) {
    html += '<h2>Bookmarks</h2><ul>';
    bookmarks.forEach(b => {
      html += <li><strong></strong> (Lap ) — </li>;
    });
    html += '</ul>';
  }

  html += '<p style="margin-top:40px;color:#94a3b8;font-size:12px">Generated by KartData</p>';
  html += '</body></html>';
  doc.document.write(html);
  doc.document.close();
}
`

---

## Testing

1. **Mobile sidebar drawer:** Open on mobile device (or Chrome DevTools mobile mode, 375x812) -> sidebar becomes a full-screen overlay drawer with semi-transparent backdrop.
2. **Hamburger opens sidebar:** Tap hamburger icon -> sidebar slides in from left with backdrop visible. Tap backdrop -> sidebar closes.
3. **Esc closes sidebar:** Open sidebar on mobile -> press Esc -> sidebar closes.
4. **Stacked layout on mobile:** Map takes full width (approx 50vh), charts stack below, video below charts.
5. **Chart tabs on mobile:** Tab bar at top of chart area shows "Speed" / "Altitude" / "G-Force" / "G-G". Tapping switches visible chart.
6. **Swipe on scrubber:** Swipe left/right on scrubber -> seeks forward/backward by 1s.
7. **Touch targets:** Use DevTools to inspect all buttons -> every interactive element is at least 44x44px.
8. **44px min touch target verification:** In DevTools, select any button, check computed dimensions -> min 44px in both axes.
9. **Simplified playback bar on mobile:** Frame-step buttons hidden. Scrubber track height is 24px. Mode buttons show icons only.
10. **Layout presets hidden on mobile:** Preset dropdown is not visible at <768px.
11. **Tab through controls:** Press Tab repeatedly -> visible focus ring (2px solid #ef4444, offset 2px) appears on each interactive element in correct visual order.
12. **prefers-reduced-motion:** Enable in OS/DevTools (Settings > Rendering > Emulate CSS media feature prefers-reduced-motion: reduce) -> all animations disabled, transitions instant.
13. **ARIA labels on all icon buttons:** Use DevTools accessibility panel to inspect every icon-only button -> each has a descriptive ria-label.
14. **ria-live regions:** Screen reader reads stepText and toast container announcements.
15. **Install PWA:** In Chrome, click "Add to Home Screen" -> app installs and opens as standalone window (no browser chrome).
16. **manifest.json loads:** DevTools > Application > Manifest -> verify name, short_name, icons, theme_color.
17. **Service worker registered:** DevTools > Application > Service Workers -> sw.js is registered and active.
18. **Cache-first strategy:** Load app online -> verify core assets cached. Go offline -> reload -> app still loads from cache.
19. **Offline functionality:** With network disconnected, all core features work (CSV parsing, map rendering, charts, video playback from blob URL).
20. **Tab away pauses playback:** Start playback -> switch to another tab -> playback pauses automatically. Switch back -> still paused.
21. **Delta-time cap:** After pausing and resuming quickly, verify no massive scrubber jump (capped at 0.1s per frame).
22. **Binary search performance:** In DevTools console, compare inarySearch() vs Array.find() for same lookup on a large lap array (5000 points) -> binary search is significantly faster.
23. **Export Report:** Click "Export Report" button -> new tab opens with formatted HTML document showing lap table, best lap highlighted, statistics, chart images, bookmarks.
24. **Export lap times table:** Verify all laps listed with times, deltas, avg/max speed. Best lap has trophy icon and green background.
25. **Export chart screenshots:** Each visible Plotly chart appears as a base64 PNG image in the report.
26. **Export bookmarks:** If bookmarks exist, they appear as a list in the report with timestamps and notes.
27. **Print report:** From the report tab, Ctrl+P -> prints a well-formatted document suitable for PDF save.
