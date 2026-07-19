# Phase 11: Keyboard Shortcuts & Sidebar Collapse

**Builds on:** Phase 10 (all charts and interactions work)

**Goal:** Keyboard shortcuts for all major actions. Sidebar collapse toggle. Map fullscreen button.

---

## Features & Implementation Specs

### 1. Global Keyboard Shortcut Handler

Single `document.addEventListener('keydown', handler)` at app boot:

```js
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't steal typing from form elements
        const tag = document.activeElement?.tagName || '';
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                togglePlayback();
                break;

            case 'ArrowLeft':
                e.preventDefault();
                stepFrame(e.shiftKey ? -0.5 : -0.04);
                break;

            case 'ArrowRight':
                e.preventDefault();
                stepFrame(e.shiftKey ? 0.5 : 0.04);
                break;

            case 'Home':
                e.preventDefault();
                if (typeof manualSeek === 'function') manualSeek(0);
                break;

            case 'End':
                e.preventDefault();
                if (typeof manualSeek === 'function') manualSeek(playbackState.maxValue);
                break;

            case 'f':
            case 'F':
                toggleMapFullscreen();
                break;

            case 's':
            case 'S':
                toggleSidebar();
                break;

            case 'm':
            case 'M':
                togglePanel('map-panel');
                break;

            case 'c':
            case 'C':
                togglePanel('charts-column');
                break;

            case 'v':
            case 'V':
                togglePanel('video-section');
                break;

            case 'r':
            case 'R':
                if (typeof resetGate === 'function') resetGate();
                break;

            case 'Escape':
                handleEscape();
                break;

            case 'b':
            case 'B':
                if (typeof addBookmark === 'function') addBookmark(); // Phase 15
                break;

            case '1':
                playbackState.baseSpeed = 0.25;
                updatePlaybackSpeedUI();
                break;

            case '2':
                playbackState.baseSpeed = 0.5;
                updatePlaybackSpeedUI();
                break;

            case '3':
                playbackState.baseSpeed = 1.0;
                updatePlaybackSpeedUI();
                break;

            case '4':
                playbackState.baseSpeed = 2.0;
                updatePlaybackSpeedUI();
                break;

            case 'd':
            case 'D':
                if (typeof setPlaybackMode === 'function') setPlaybackMode('distance');
                break;

            case 't':
            case 'T':
                if (typeof setPlaybackMode === 'function') setPlaybackMode('time');
                break;
        }
    });
}
```

### 2. Escape Handler

`handleEscape()` follows a priority order:

```js
function handleEscape() {
    // Priority 1: Cancel gate drawing
    if (isDrawingGate && typeof cancelGate === 'function') {
        cancelGate();
        showToast('info', 'Gate drawing cancelled.');
        return;
    }

    // Priority 2: Exit fullscreen
    if (document.fullscreenElement) {
        document.exitFullscreen();
        return;
    }

    // Priority 3: Close mobile sidebar (if sidebar is collapsed via toggle)
    if (document.body.classList.contains('sidebar-collapsed') && typeof toggleSidebar === 'function') {
        toggleSidebar(); // Re-open it
        return;
    }

    // Priority 4: Close settings panel if open
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
        settingsPanel.classList.add('hidden');
        return;
    }
}
```

### 3. Sidebar Collapse Toggle

```js
function toggleSidebar() {
    const body = document.body;
    body.classList.toggle('sidebar-collapsed');

    const isCollapsed = body.classList.contains('sidebar-collapsed');
    const sidebar = document.getElementById('app-sidebar');

    if (isCollapsed) {
        sidebar.style.width = '0';
        sidebar.style.padding = '0';
        sidebar.style.overflow = 'hidden';
    } else {
        sidebar.style.width = '320px';
        sidebar.style.padding = '';
        sidebar.style.overflow = '';
    }

    // Update hamburger icon
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const icon = toggleBtn?.querySelector('.ph');
    if (icon) {
        icon.className = isCollapsed
            ? 'ph ph-sidebar text-lg'
            : 'ph ph-x text-lg';
    }

    // Save state
    localStorage.setItem('sidebarCollapsed', isCollapsed ? 'true' : 'false');

    // Invalidate map size after transition
    setTimeout(() => {
        if (window.map && typeof map.invalidateSize === 'function') {
            map.invalidateSize();
        }
    }, 350); // Match CSS transition duration
}
```

**Sidebar toggle button in header:**

```html
<button id="sidebar-toggle-btn" class="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
        title="Toggle Sidebar" aria-label="Toggle sidebar">
    <i class="ph ph-sidebar text-lg"></i>
</button>
```

**CSS additions:**

```css
#app-sidebar {
    transition: width 0.3s ease, padding 0.3s ease, overflow 0.3s ease;
    width: 320px;
}

body.sidebar-collapsed #app-sidebar {
    width: 0;
    padding: 0;
    overflow: hidden;
}

body.sidebar-collapsed #sidebar-toggle-btn .ph {
    /* Icon handled by JS class swap */
}
```

**Restore sidebar state on boot:**

```js
// In init or setupEventListeners:
const savedSidebarState = localStorage.getItem('sidebarCollapsed');
if (savedSidebarState === 'true') {
    document.body.classList.add('sidebar-collapsed');
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) {
        sidebar.style.width = '0';
        sidebar.style.padding = '0';
        sidebar.style.overflow = 'hidden';
    }
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const icon = toggleBtn?.querySelector('.ph');
    if (icon) icon.className = 'ph ph-sidebar text-lg';
}
```

### 4. Map Fullscreen

```js
function toggleMapFullscreen() {
    const mapEl = document.getElementById('map-panel');
    if (!mapEl) return;

    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        mapEl.requestFullscreen();
    }
}
```

**Fullscreen button on map corner:**

Add a Leaflet control in `initMap()`:

```js
// Fullscreen button (top-right, next to zoom)
const FullscreenControl = L.Control.extend({
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        container.innerHTML = `
            <a id="map-fullscreen-btn" href="#" title="Toggle Fullscreen" role="button"
               class="leaflet-control-zoom-fullscreen" style="
                width: 30px; height: 30px; line-height: 30px;
                display: flex; align-items: center; justify-content: center;
                background: white; color: #333; font-size: 16px;
                border-radius: 2px; cursor: pointer;
            ">
                <i class="ph ph-arrows-out"></i>
            </a>
        `;
        container.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleMapFullscreen();
        });
        return container;
    }
});

new FullscreenControl({ position: 'topright' }).addTo(map);
```

### 5. Panel Toggle Shortcuts (M, C, V)

`togglePanel()` is defined here — the actual panel hide/show toggle buttons and resize handles come in Phase 16. For now, just the keyboard shortcuts work.

```js
function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    // Toggle via flex: 0 / restore
    const isHidden = panel.dataset.hidden === 'true';
    if (isHidden) {
        panel.dataset.hidden = 'false';
        panel.style.flex = panel.dataset.originalFlex || '1';
        panel.style.display = '';
        panel.style.overflow = '';
    } else {
        panel.dataset.hidden = 'true';
        panel.dataset.originalFlex = panel.style.flex || '1';
        panel.style.flex = '0';
        panel.style.display = 'none';
        panel.style.overflow = 'hidden';
    }

    // Invalidate map if hiding map panel
    if (panelId === 'map-panel' && window.map) {
        setTimeout(() => map.invalidateSize(), 100);
    }

    // Resize charts if hiding charts column
    if (panelId === 'charts-column' && typeof resizeObserver !== 'undefined') {
        document.querySelectorAll('.chart-body').forEach(el => {
            if (el.data) Plotly.Plots.resize(el.id);
        });
    }

    showToast('info', `${panelId} ${isHidden ? 'shown' : 'hidden'}`);
}
```

### 6. Playback Speed UI Sync

```js
function updatePlaybackSpeedUI() {
    const speedSelect = document.getElementById('playback-speed');
    if (speedSelect) {
        // Map baseSpeed to the closest select option
        const speeds = [0.25, 0.5, 1.0, 2.0];
        const closest = speeds.reduce((prev, curr) =>
            Math.abs(curr - playbackState.baseSpeed) < Math.abs(prev - playbackState.baseSpeed) ? curr : prev
        );
        speedSelect.value = closest.toString();
    }
}
```

---

## State Variables Added

| Variable | Type | Initial | Description |
|---|---|---|---|
| *(none new)* | | | All behavior is event-driven via existing state |

---

## Functions Added / Modified

| Function | Change |
|---|---|
| `setupKeyboardShortcuts()` | NEW — registers global `keydown` listener with input guard |
| `handleEscape()` | NEW — priority-based escape handler (gate > fullscreen > sidebar > settings) |
| `toggleSidebar()` | NEW — collapses/expands sidebar with animation, persists state |
| `toggleMapFullscreen()` | NEW — toggles Fullscreen API on map panel |
| `togglePanel(panelId)` | NEW — hides/shows a panel via flex toggle (M/C/V shortcuts) |
| `updatePlaybackSpeedUI()` | NEW — syncs speed select dropdown to `playbackState.baseSpeed` |
| `initMap()` | MODIFIED — adds fullscreen button control |
| `setupEventListeners()` | MODIFIED — registers sidebar toggle button click, calls `setupKeyboardShortcuts()`, restores sidebar state |

---

## Testing Instructions

1. After Phase 10, press Space → play/pause toggles
2. Press ← → steps backward 0.04s
3. Press → → steps forward 0.04s
4. Hold Shift + ← → steps backward 0.5s
5. Hold Shift + → → steps forward 0.5s
6. Press Home → scrubs to start of data
7. Press End → scrubs to end of data
8. Press S → sidebar collapses with animation (width 320px→0), hamburger icon updates
9. Press S again → sidebar expands back
10. Press F → map goes fullscreen, press Esc → exits fullscreen
11. Press M → map panel hides, press M again → map panel shows
12. Press C → charts column hides, press C again → shows
13. Press V → video section hides, press V again → shows
14. Press 1 → playback speed set to 0.25x, select dropdown updates
15. Press 2 → 0.5x, Press 3 → 1.0x, Press 4 → 2.0x
16. Press D → playback mode switches to Distance
17. Press T → playback mode switches to Time
18. Start drawing a gate, press Esc → gate drawing cancelled with toast "Gate drawing cancelled."
19. Type in an input field, press Space → does NOT trigger play (input guard works)
20. Refresh the page → sidebar state persists from localStorage
21. All previous functionality (charts, crosshair, legend sync, export, ResizeObserver) still works
