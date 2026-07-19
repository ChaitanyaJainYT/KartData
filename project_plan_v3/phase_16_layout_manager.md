# Phase 16: Layout Manager — Resizable & Hidable Panels

**Builds on:** Phase 15 (bookmarks, settings, data table work)

**Goal:** Every major panel (sidebar, map, charts, video) is resizable via draggable dividers and hidable via toggle buttons. 5 pre-defined layout presets. All state persisted in `localStorage`.

---

## HTML Structure for Resizable Layout

```html
<div class="app-container flex flex-row h-screen">
  <aside id="app-sidebar" class="flex-shrink-0" style="width: 280px">...</aside>
  <div class="resize-handle resize-handle--vertical" id="rh-sidebar"
       data-panels="app-sidebar,main-area" data-orientation="vertical" aria-hidden="true">
    <div class="resize-handle__line"></div>
  </div>
  <div id="main-area" class="flex-1 flex flex-col overflow-hidden">
    <div id="main-content-area" class="flex-1 flex flex-row overflow-hidden">
      <div id="map-panel" class="flex-1" style="flex-basis: 55%">
        <div id="map"></div>
      </div>
      <div class="resize-handle resize-handle--vertical" id="rh-map-charts"
           data-panels="map-panel,charts-column" data-orientation="vertical" aria-hidden="true">
        <div class="resize-handle__line"></div>
      </div>
      <div id="charts-column" class="flex-1" style="flex-basis: 45%">...</div>
    </div>
    <div class="resize-handle resize-handle--horizontal" id="rh-video"
         data-panels="main-content-area,video-section" data-orientation="horizontal" aria-hidden="true">
      <div class="resize-handle__line"></div>
    </div>
    <div id="video-section" class="flex-shrink-0" style="height: auto">...</div>
  </div>
</div>
```

### Resize Handle Placements

| Handle ID | Orientation | Panels (before, after) | Min Before | Min After |
|---|---|---|---|---|
| `rh-sidebar` | vertical | `app-sidebar`, `main-area` | 160px | 480px |
| `rh-map-charts` | vertical | `map-panel`, `charts-column` | 300px | 300px |
| `rh-video` | horizontal | `main-content-area`, `video-section` | 200px (main) | 120px |

---

## CSS for Resize Handles

```css
.resize-handle {
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  background: transparent;
}
.resize-handle--vertical {
  width: 6px;
  cursor: col-resize;
}
.resize-handle--vertical:hover {
  background: rgba(239, 68, 68, 0.08);
}
.resize-handle--vertical .resize-handle__line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: #2a3143;
  border-radius: 1px;
  transition: background 0.15s;
}
.resize-handle--vertical:hover .resize-handle__line {
  background: #ef4444;
}
.resize-handle--horizontal {
  height: 6px;
  cursor: row-resize;
}
.resize-handle--horizontal .resize-handle__line {
  position: absolute;
  left: 0;
  right: 0;
  top: 2px;
  height: 2px;
  background: #2a3143;
  border-radius: 1px;
}
.resize-handle--horizontal:hover .resize-handle__line {
  background: #ef4444;
}
.resize-handle.is-dragging .resize-handle__line {
  background: #ef4444;
}
```

### Panel Hidden State

```css
.panel-hidden {
  flex: 0 0 0 !important;
  overflow: hidden;
  padding: 0 !important;
  margin: 0 !important;
  opacity: 0;
  pointer-events: none;
}
.panel-toggle-icon.is-hidden {
  transform: rotate(180deg);
}
```

---

## LayoutManager Class (`ui/layout.js`)

Full implementation with mouse + touch events, min-size enforcement, and localStorage persistence.

```js
class LayoutManager {
  constructor() {
    this.handles = document.querySelectorAll('.resize-handle');
    this.activeHandle = null;
    this.startPos = null;
    this.startSizes = null;
    this.init();
    this.restoreLayout();
    this.restoreHiddenStates();
    this.createPresetButtons();
  }

  init() {
    this.handles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => this.onDragStart(e, handle));
      handle.addEventListener('touchstart', (e) => this.onDragStart(e, handle), { passive: true });
    });
    document.addEventListener('mousemove', (e) => this.onDragMove(e));
    document.addEventListener('mouseup', (e) => this.onDragEnd(e));
    document.addEventListener('touchmove', (e) => this.onDragMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this.onDragEnd(e));
  }

  onDragStart(e, handle) {
    e.preventDefault();
    this.activeHandle = handle;
    handle.classList.add('is-dragging');
    const cursor = handle.dataset.orientation === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';
    const pos = e.type === 'touchstart' ? e.touches[0] : e;
    this.startPos = { x: pos.clientX, y: pos.clientY };
    const [beforeId, afterId] = handle.dataset.panels.split(',');
    const before = document.getElementById(beforeId);
    const after = document.getElementById(afterId);
    const isVert = handle.dataset.orientation === 'vertical';
    this.startSizes = {
      before: isVert ? before.offsetWidth : before.offsetHeight,
      after: isVert ? after.offsetWidth : after.offsetHeight,
      total: (isVert ? before.offsetWidth : before.offsetHeight) +
             (isVert ? after.offsetWidth : after.offsetHeight) + handle.offsetWidth
    };
  }

  onDragMove(e) {
    if (!this.activeHandle) return;
    e.preventDefault();
    const pos = e.type === 'touchmove' ? e.touches[0] : e;
    const delta = this.activeHandle.dataset.orientation === 'vertical'
      ? pos.clientX - this.startPos.x : pos.clientY - this.startPos.y;
    const [beforeId, afterId] = this.activeHandle.dataset.panels.split(',');
    const before = document.getElementById(beforeId);
    const after = document.getElementById(afterId);
    const minPanel = this.activeHandle.id === 'rh-sidebar' ? 160 : 300;
    const minAfter = this.activeHandle.id === 'rh-sidebar' ? 480
      : this.activeHandle.id === 'rh-video' ? 120 : 300;
    let total = this.startSizes.before + this.startSizes.after + this.activeHandle.offsetWidth;
    let newBefore = Math.max(minPanel, Math.min(total - minAfter, this.startSizes.before + delta));
    let newAfter = total - newBefore - this.activeHandle.offsetWidth;
    if (newAfter < minAfter) {
      newAfter = minAfter;
      newBefore = total - newAfter - this.activeHandle.offsetWidth;
    }
    before.style.flexBasis = newBefore + 'px';
    after.style.flex = '1 1 0';
    window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: beforeId } }));
    window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: afterId } }));
  }

  onDragEnd() {
    if (!this.activeHandle) return;
    this.activeHandle.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    this.saveLayout();
    this.activeHandle = null;
  }

  saveLayout() {
    const layout = {};
    document.querySelectorAll('.resize-handle').forEach(h => {
      const [beforeId] = h.dataset.panels.split(',');
      const el = document.getElementById(beforeId);
      if (el) layout[beforeId] = el.style.flexBasis || el.offsetWidth + 'px';
    });
    localStorage.setItem('kartdata-layout', JSON.stringify(layout));
  }

  restoreLayout() {
    const saved = localStorage.getItem('kartdata-layout');
    if (!saved) return;
    try {
      const layout = JSON.parse(saved);
      Object.entries(layout).forEach(([id, size]) => {
        const el = document.getElementById(id);
        if (el) el.style.flexBasis = size;
      });
    } catch (e) { /* ignore corrupt data */ }
  }

  restoreHiddenStates() {
    const saved = localStorage.getItem('kartdata-hidden');
    if (!saved) return;
    try {
      const hidden = JSON.parse(saved);
      Object.entries(hidden).forEach(([id, isHidden]) => {
        if (isHidden) {
          const panel = document.getElementById(id);
          if (panel) panel.classList.add('panel-hidden');
        }
      });
    } catch (e) { /* ignore corrupt data */ }
  }
}
```

---

## Mouse + Touch Events

| Event | Target | Handler |
|---|---|---|
| `mousedown` / `touchstart` | Each `.resize-handle` | `LayoutManager.onDragStart` |
| `mousemove` / `touchmove` | `document` | `LayoutManager.onDragMove` |
| `mouseup` / `touchend` | `document` | `LayoutManager.onDragEnd` |

**`onDragStart`:**
- Reads `offsetWidth`/`offsetHeight` of both affected panels.
- Stores total size (both panels + handle width/height).
- Adds `is-dragging` class to handle, sets body cursor to `col-resize`/`row-resize`, disables `userSelect`.

**`onDragMove`:**
- Computes delta from start position.
- Keeps before-panel within `[minPanel, total - minOther]`.
- Sets `flexBasis` on before-panel in pixels.
- Sets after-panel to `flex: 1 1 0`.
- Dispatches `panelresize` custom event for both panels.

**`onDragEnd`:**
- Removes `is-dragging` class, resets body cursor and user-select.
- Calls `saveLayout()` to persist current sizes to `localStorage`.

---

## Panel Hide/Show

### Toggle Buttons

| Button ID | Panel | Icon | Position |
|---|---|---|---|
| `sidebar-toggle-btn` | `app-sidebar` | Hamburger (☰) | In header |
| `toggle-map-btn` | `map-panel` | Chevron `⟩` | Right edge of map panel |
| `toggle-charts-btn` | `charts-column` | Chevron `⟨` | Left edge of charts column |
| `toggle-video-btn` | `video-section` | Chevron `▽` | Top edge of video section |

### `togglePanel(panelId, show)` Function

```js
function togglePanel(panelId, show) {
  const panel = document.getElementById(panelId);
  const isCurrentlyVisible = !panel.classList.contains('panel-hidden');
  const willShow = show !== undefined ? show : !isCurrentlyVisible;

  if (willShow) {
    panel.classList.remove('panel-hidden');
    panel.querySelector('.panel-toggle-icon')?.classList.remove('is-hidden');
  } else {
    panel.classList.add('panel-hidden');
    panel.querySelector('.panel-toggle-icon')?.classList.add('is-hidden');
  }

  window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: panelId } }));

  const hiddenState = JSON.parse(localStorage.getItem('kartdata-hidden') || '{}');
  hiddenState[panelId] = !willShow;
  localStorage.setItem('kartdata-hidden', JSON.stringify(hiddenState));
}
```

Toggle buttons remain visible even when the panel is hidden (they float at the panel's edge with a rotated chevron indicating the panel can be restored).

---

## 5 Layout Presets

Presets are exposed via a dropdown or button group in the header. Each preset defines which panels are hidden and their sizes.

| Preset Name | Sidebar | Map | Charts | Video |
|---|---|---|---|---|
| **Full Analysis** | Visible (280px) | Visible (55%) | Visible (45%) | Visible (auto height) |
| **Map Focus** | Hidden | Visible (100%) | Hidden | Hidden |
| **Data Dive** | Visible (280px) | Hidden | Visible (100%) | Hidden |
| **Video Review** | Visible (160px) | Hidden | Hidden | Visible (large) |
| **Minimal** | Hidden | Visible (50%) | Visible (50%) | Hidden |

### `applyPreset(name)` Implementation

```js
function applyPreset(name) {
  const presets = {
    'Full Analysis': { sidebar: true, map: true, charts: true, video: true, sidebarW: '280px', mapW: '55%', chartsW: '45%' },
    'Map Focus':    { sidebar: false, map: true, charts: false, video: false, sidebarW: '280px', mapW: '100%', chartsW: '0%' },
    'Data Dive':    { sidebar: true, map: false, charts: true, video: false, sidebarW: '280px', mapW: '0%', chartsW: '100%' },
    'Video Review': { sidebar: true, map: false, charts: false, video: true, sidebarW: '160px', mapW: '0%', chartsW: '0%' },
    'Minimal':      { sidebar: false, map: true, charts: true, video: false, sidebarW: '280px', mapW: '50%', chartsW: '50%' }
  };
  const p = presets[name];
  if (!p) return;
  togglePanel('app-sidebar', p.sidebar);
  togglePanel('map-panel', p.map);
  togglePanel('charts-column', p.charts);
  togglePanel('video-section', p.video);
  document.getElementById('app-sidebar').style.flexBasis = p.sidebarW;
  document.getElementById('map-panel').style.flexBasis = p.mapW;
  document.getElementById('charts-column').style.flexBasis = p.chartsW;
  localStorage.setItem('kartdata-preset', name);
  window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: 'app-sidebar' } }));
  window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: 'map-panel' } }));
  window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: 'charts-column' } }));
}
```

---

## State Persistence

| localStorage Key | Content | Example |
|---|---|---|
| `kartdata-layout` | `{ panelId: "flexBasis", ... }` | `{ "app-sidebar": "280px", "map-panel": "55%", "charts-column": "45%" }` |
| `kartdata-hidden` | `{ panelId: boolean, ... }` | `{ "app-sidebar": false, "map-panel": true, "charts-column": false, "video-section": false }` |
| `kartdata-preset` | Preset name string | `"Full Analysis"` |

- **Restore on boot:** `LayoutManager` constructor calls `restoreLayout()` and `restoreHiddenStates()` after `init()`.
- **Clear on New Session:** When `resetAllData()` is called, remove these keys: `localStorage.removeItem('kartdata-layout')`, `localStorage.removeItem('kartdata-hidden')`, `localStorage.removeItem('kartdata-preset')`.

---

## `panelresize` Custom Event

Dispatched on `window` after any resize drag ends or panel hide/show changes. Listeners:

```js
window.addEventListener('panelresize', (e) => {
  const panel = e.detail.panel;
  if (panel === 'map-panel' || panel === 'main-area') {
    setTimeout(() => map?.invalidateSize(), 50);
  }
  if (panel === 'charts-column' || panel === 'main-area') {
    setTimeout(() => {
      document.querySelectorAll('[id^="chart-"]').forEach(el => {
        if (el.data) Plotly.Plots.resize(el);
      });
    }, 50);
  }
});
```

---

## Testing

1. **Sidebar resize:** After phase 15, drag `#rh-sidebar` → sidebar width changes smoothly. Verify min width stops at 160px.
2. **Map-charts resize:** Drag `#rh-map-charts` → map panel gets wider, charts column narrower (and vice versa). Min both 300px.
3. **Video resize:** Drag `#rh-video` → video section gets taller/shorter. Min video height 120px. Min main content area 200px.
4. **Hide map:** Click `⟩` chevron on right edge of map panel → map hides with `panel-hidden` class, charts column expands to fill.
5. **Hide charts:** Click `⟨` chevron on left edge of charts column → charts hide, map expands to fill.
6. **Hide video:** Click `▽` chevron on top edge of video section → video hides, main content area expands.
7. **Minimum size enforcement:** Drag sidebar handle past 160px → dragging stops at 160px. Drag map-charts handle past 300px → stops at 300px.
8. **Preset "Map Focus":** Select "Map Focus" from preset dropdown → sidebar hidden, charts hidden, video hidden, map takes full width.
9. **Preset "Full Analysis":** Select "Full Analysis" → all panels restore to their default proportions.
10. **Preset "Data Dive":** Select "Data Dive" → sidebar visible, map hidden, charts at full width, video hidden.
11. **Preset "Video Review":** Select "Video Review" → sidebar narrow (160px), map hidden, charts hidden, video visible.
12. **Preset "Minimal":** Select "Minimal" → sidebar hidden, map at ~50%, charts at ~50%, video hidden.
13. **Persistence:** Resize panels, hide some panels, select a preset → reload the page → layout state restores from `localStorage` exactly as left.
14. **Keyboard shortcuts M, C, V:** Press `M` → map panel toggles hide/show. Press `C` → charts column toggles. Press `V` → video section toggles.
15. **New Session clears layout:** Click "New Session" → `localStorage` layout keys removed, panels reset to defaults.
16. **Toggle button visibility when panel hidden:** Hide map → the `⟩` toggle button remains visible at the edge, rotated 180° to indicate restore direction.
17. **Touch drag on tablet:** Use touch events to drag resize handles on a touch-enabled device.
18. **Plotly resize on panel resize:** After resizing panels, verify Plotly charts re-render to fill the new container dimensions.
19. **Leaflet invalidateSize on resize:** After resizing, verify the map tiles re-render at the correct dimensions.
20. **Multi-resize:** Drag sidebar, then drag map-charts, then hide video → all states save correctly, reload restores combined state.
