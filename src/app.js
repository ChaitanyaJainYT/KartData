/**
 * KartData Application Bootstrapper
 * Wires all modules together with the Pub/Sub state manager
 */
import state from './core/state.js';
import { formatTime, detectLaps, computeSectors, computeGGDiagram } from './core/math.js';
import { validateFile, parseCSV, extractFromMP4, generateCSV } from './modules/extractor.js';
import { MappingModule } from './modules/mapping.js';
import { ChartsModule } from './modules/charts.js';
import { VideoModule } from './modules/video.js';
import { LayoutModule } from './modules/ui/layout.js';

// ---- Module Instances ----
const mapping = new MappingModule();
const charts = new ChartsModule();
const video = new VideoModule();
const layout = new LayoutModule();

// ---- DOM References ----
const $ = (id) => document.getElementById(id);
const dom = {
  emptyState: $('empty-state'),
  dropOverlay: $('drop-overlay'),
  fileInfo: $('file-info'),
  fileName: $('filename-display'),
  lapCount: $('lap-count-display'),
  timingTower: $('timing-tower-body'),
  playbackBar: $('playback-bar'),
  scrubber: $('main-scrubber'),
  scrubberCurrent: $('scrubber-current'),
  scrubberTotal: $('scrubber-total'),
  playBtn: $('play-btn'),
  playIcon: $('play-icon'),
  liveSpeed: $('live-speed'),
  liveTime: $('live-time'),
  liveLap: $('live-lap'),
  progressFill: $('progress-fill'),
  statusText: $('status-text'),
  dlProgress: $('download-progress'),
  dlProgressBar: $('dl-progress-bar'),
  dlProgressLabel: $('dl-progress-label'),
  dlProgressPct: $('dl-progress-pct'),
};

// ---- Smoothing state ----
let smoothingWindow = 0;
let lapSortEnabled = false;

// ---- File Handlers ----
async function handleFile(file) {
  try {
    validateFile(file);
  } catch (e) {
    alert(e.message);
    return;
  }

  dom.progressFill.style.width = '0%';
  setStatus('Processing...');

  const ext = '.' + file.name.split('.').pop().toLowerCase();

  try {
    let points;
    if (ext === '.csv') {
      setStatus('Parsing CSV...');
      points = await parseCSV(file);
    } else {
      setStatus('Extracting telemetry from video...');
      dom.dlProgress.classList.add('active');
      dom.dlProgressLabel.textContent = 'Extracting GPS data...';
      dom.dlProgressBar.style.width = '10%';
      dom.dlProgressPct.textContent = '10%';
      points = await extractFromMP4(file);
      if (points.length > 0) {
        dom.dlProgressLabel.textContent = 'Generating CSV...';
        dom.dlProgressBar.style.width = '80%';
        dom.dlProgressPct.textContent = '80%';
        const csv = generateCSV(points);
        dom.dlProgressLabel.textContent = 'Downloading...';
        dom.dlProgressBar.style.width = '100%';
        dom.dlProgressPct.textContent = '100%';
        setTimeout(() => dom.dlProgress.classList.remove('active'), 1500);
        downloadCSV(csv, file.name.replace(/\.[^/.]+$/, '') + '_Telemetry.csv');
      } else {
        dom.dlProgress.classList.remove('active');
      }
    }

    if (!points || points.length === 0) {
      alert('No valid telemetry data found in file.');
      dom.progressFill.style.width = '0%';
      return;
    }

    dom.progressFill.style.width = '100%';
    setStatus(`Loaded ${points.length} data points`);

    state.reset();
    state.setTelemetry(points);
    state.setMeta({ fileName: file.name });

    showDashboard();
    dom.fileName.textContent = file.name;

    const defaultLap = {
      id: 1,
      startIndex: 0,
      endIndex: points.length - 1,
      lapTime: points[points.length - 1].time - points[0].time,
      isReference: false,
    };
    state.setLaps([defaultLap]);

    mapping.plotTrack(points);
    mapping.highlightLaps([defaultLap], points);
    renderTimingTower([defaultLap]);
    renderAllCharts([defaultLap], points);

    dom.scrubber.max = points[points.length - 1].time;
    dom.scrubber.value = 0;
    dom.scrubberTotal.textContent = formatTime(points[points.length - 1].time);
    updateLiveTelemetry(points[0]);

    $('set-gate-btn').disabled = false;
    $('download-csv-btn').classList.remove('hidden');

  } catch (err) {
    console.error('[App] File processing error:', err);
    alert('Error processing file: ' + err.message);
    dom.progressFill.style.width = '0%';
    dom.dlProgress.classList.remove('active');
  }
}

// ---- Gate Drawing ----
async function startGateDrawing() {
  const telemetry = state.telemetry;
  if (telemetry.length === 0) return;

  $('set-gate-btn').disabled = true;
  setStatus('Click on map to set gate START point');

  try {
    const gateCoords = await mapping.startGateDrawing();
    setStatus('Gate locked! Detecting laps...');

    const lapSegments = detectLaps(telemetry, gateCoords);
    if (lapSegments.length < 2) {
      setStatus('Not enough lap crossings detected. Try moving the gate line.');
      $('set-gate-btn').disabled = false;
      const singleLap = [{
        id: 1,
        startIndex: 0,
        endIndex: telemetry.length - 1,
        lapTime: telemetry[telemetry.length - 1].time - telemetry[0].time,
        isReference: false,
      }];
      state.setLaps(singleLap);
      mapping.highlightLaps(singleLap, telemetry);
      renderTimingTower(singleLap);
      renderAllCharts(singleLap, telemetry);
      return;
    }

    const laps = lapSegments.map((seg, idx) => {
      const startP = telemetry[seg.startIndex];
      const endP = telemetry[seg.endIndex];
      return {
        id: idx + 1,
        startIndex: seg.startIndex,
        endIndex: seg.endIndex,
        lapTime: endP.time - startP.time,
        isReference: idx === 0,
      };
    });

    state.setLaps(laps);
    mapping.highlightLaps(laps, telemetry);
    renderTimingTower(laps);
    renderAllCharts(laps, telemetry);

    setStatus(`${laps.length} laps detected`);
    $('set-gate-btn').disabled = false;

  } catch (e) {
    $('set-gate-btn').disabled = false;
    setStatus('Gate drawing cancelled');
  }
}

function clearGate() {
  mapping.clearGate();
  const telemetry = state.telemetry;
  if (telemetry.length === 0) return;

  const defaultLap = [{
    id: 1,
    startIndex: 0,
    endIndex: telemetry.length - 1,
    lapTime: telemetry[telemetry.length - 1].time - telemetry[0].time,
    isReference: false,
  }];
  state.setLaps(defaultLap);
  mapping.plotTrack(telemetry);
  mapping.highlightLaps(defaultLap, telemetry);
  renderTimingTower(defaultLap);
  renderAllCharts(defaultLap, telemetry);
  setStatus('Gate cleared');
}

// ---- Render all charts ----
function renderAllCharts(laps, telemetry) {
  charts.renderSpeedDistance(laps, telemetry, smoothingWindow);
  charts.renderSpeedTime(laps, telemetry, smoothingWindow);
  charts.renderGG(laps, telemetry);
  charts.renderSlipChart(laps, telemetry);
}

// ---- Timing Tower ----
function renderTimingTower(laps) {
  if (!dom.timingTower) return;
  dom.timingTower.innerHTML = '';
  dom.lapCount.textContent = `${laps.length} Laps`;

  const telemetry = state.telemetry;
  const sorted = lapSortEnabled ? [...laps].sort((a, b) => a.lapTime - b.lapTime) : laps;
  const bestTime = sorted.length > 0 ? Math.min(...laps.map(l => l.lapTime)) : 0;

  sorted.forEach((lap) => {
    const row = document.createElement('div');
    row.className = 'timing-row';
    if (lap.isReference) row.classList.add('active');

    const delta = lap.lapTime - bestTime;
    const deltaStr = delta > 0.01 ? `+${formatTime(delta)}` : '—';
    const deltaClass = delta > 0.01 ? 'negative' : 'positive';

    // Sector times
    const lapPts = telemetry.slice(lap.startIndex, lap.endIndex + 1);
    let sectorsHtml = '';
    if (lapPts.length >= 4) {
      const boundaries = computeSectors(lapPts, 3);
      if (boundaries.length === 4) {
        const sectorTimes = [];
        for (let s = 0; s < 3; s++) {
          const sStart = boundaries[s];
          const sEnd = boundaries[s + 1];
          const sStartPts = lapPts.find(p => Math.abs(p.cumulativeDist - sStart) < 1);
          const sEndPts = lapPts.find(p => Math.abs(p.cumulativeDist - sEnd) < 1);
          if (sStartPts && sEndPts) {
            sectorTimes.push(sEndPts.time - sStartPts.time);
          }
        }
        if (sectorTimes.length === 3) {
          sectorsHtml = `<div class="flex gap-1 mt-1">
            <span class="text-[10px] text-[#64748b] font-mono">S1:${formatTime(sectorTimes[0])}</span>
            <span class="text-[10px] text-[#64748b] font-mono">S2:${formatTime(sectorTimes[1])}</span>
            <span class="text-[10px] text-[#64748b] font-mono">S3:${formatTime(sectorTimes[2])}</span>
          </div>`;
        }
      }
    }

    row.innerHTML = `
      <div class="flex items-center justify-between w-full">
        <div>
          <span class="lap-number">LAP ${lap.id}</span>
          ${sectorsHtml}
        </div>
        <div class="text-right">
          <div class="lap-time">${formatTime(lap.lapTime)}</div>
          <div class="lap-delta ${deltaClass}">${deltaStr}</div>
        </div>
      </div>
    `;

    row.addEventListener('click', () => {
      state.selectReferenceLap(lap.id);
      refreshDisplay();
    });

    dom.timingTower.appendChild(row);
  });
}

function refreshDisplay() {
  const telemetry = state.telemetry;
  const laps = state.laps;
  renderTimingTower(laps);
  renderAllCharts(laps, telemetry);
  mapping.highlightLaps(laps, telemetry);
}

// ---- Playback ----
function togglePlayback() {
  const isPlaying = !state.session.isPlaying;
  state.setPlaying(isPlaying);
  video.setPlaying(isPlaying);

  if (isPlaying) {
    dom.playBtn.classList.add('playing');
    dom.playIcon.className = 'ph-fill ph-pause text-2xl';
    startPlaybackLoop();
  } else {
    dom.playBtn.classList.remove('playing');
    dom.playIcon.className = 'ph-fill ph-play text-2xl ml-1';
    stopPlaybackLoop();
  }
}

let animFrameId = null;

function startPlaybackLoop() {
  const fps = 30;
  const interval = 1000 / fps;

  function tick() {
    if (!state.session.isPlaying) return;

    const dt = interval / 1000;
    const newTime = state.session.currentPlaybackTime + dt;
    const maxTime = state.session.totalDuration;

    if (newTime >= maxTime) {
      state.setPlaybackTime(0);
      state.setPlaying(false);
      dom.playBtn.classList.remove('playing');
      dom.playIcon.className = 'ph-fill ph-play text-2xl ml-1';
      stopPlaybackLoop();
      return;
    }

    state.setPlaybackTime(newTime);
    animFrameId = requestAnimationFrame(tick);
  }

  animFrameId = requestAnimationFrame(tick);
}

function stopPlaybackLoop() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function manualSeek(time) {
  state.setPlaybackTime(parseFloat(time));
  video.syncToState();
}

// ---- Scrubbing ----
dom.scrubber.addEventListener('input', (e) => manualSeek(e.target.value));

// ---- Playback: subscribe to state changes ----
state.subscribe('playback:tick', (time) => {
  const telemetry = state.telemetry;
  if (telemetry.length === 0) return;

  dom.scrubber.value = time;

  // Update labels
  dom.scrubberCurrent.textContent = formatTime(time);
  dom.liveTime.textContent = formatTime(time);

  // Update speed
  const idx = findIndex(telemetry, time);
  if (idx >= 0 && idx < telemetry.length) {
    updateLiveTelemetry(telemetry[idx]);
    mapping.updatePosition(telemetry[idx].lat, telemetry[idx].lon);
  }

  // Update chart crosshairs
  charts.updateCrosshairs(time, telemetry);

  // Sync video
  video.syncToState();
});

state.subscribe('playback:playing', (playing) => {
  if (!playing) stopPlaybackLoop();
});

// ---- UI Updates ----
function showDashboard() {
  dom.emptyState.classList.add('hidden');
  dom.fileInfo.classList.add('flex');
  dom.fileInfo.classList.remove('hidden');
  dom.playbackBar.classList.remove('hidden');
}

function setStatus(msg) {
  if (dom.statusText) dom.statusText.textContent = msg;
}

function updateLiveTelemetry(point) {
  if (!point) return;
  dom.liveSpeed.textContent = point.speedKmh.toFixed(1);
  // Determine lap
  const laps = state.laps;
  if (laps.length > 0) {
    const currentLap = laps.find(l => {
      const p = state.telemetry;
      const start = p[l.startIndex];
      const end = p[l.endIndex];
      return point.time >= start.time && point.time <= end.time;
    });
    dom.liveLap.textContent = currentLap ? currentLap.id : '-';
  }
}

function findIndex(arr, time) {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// ---- CSV Download ----
function downloadCSV(csv, fileName) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function handleDownloadCSV() {
  const telemetry = state.telemetry;
  if (telemetry.length === 0) return;
  const csv = generateCSV(telemetry);
  const name = state.meta.fileName.replace(/\.[^/.]+$/, '') + '_export.csv';
  downloadCSV(csv, name);
}

// ---- Keyboard Shortcuts ----
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayback();
  }
});

// ---- Mobile Tabs ----
function initMobileTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.dashboard-grid .panel[data-mobile-tab]');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      panels.forEach(p => {
        if (p.dataset.mobileTab === tab) {
          p.classList.add('active-mobile');
        } else {
          p.classList.remove('active-mobile');
        }
      });
      // Resize charts for visible panels
      setTimeout(() => {
        try { Plotly.Plots.resize($('chart-speed-dist')); } catch (e) {}
        try { Plotly.Plots.resize($('chart-speed-time')); } catch (e) {}
        try { Plotly.Plots.resize($('chart-gg')); } catch (e) {}
        try { Plotly.Plots.resize($('chart-slip')); } catch (e) {}
        if (mapping.map) mapping.map.invalidateSize();
      }, 50);
    });
  });
}

// ---- Panel Collapse ----
function initPanelCollapse() {
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('.panel');
      if (!panel) return;
      panel.classList.toggle('panel-collapsed');
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = panel.classList.contains('panel-collapsed')
          ? 'ph ph-plus'
          : 'ph ph-minus';
      }
      // Resize charts after collapse
      setTimeout(() => {
        try { Plotly.Plots.resize($('chart-speed-dist')); } catch (e) {}
        try { Plotly.Plots.resize($('chart-speed-time')); } catch (e) {}
        try { Plotly.Plots.resize($('chart-gg')); } catch (e) {}
        try { Plotly.Plots.resize($('chart-slip')); } catch (e) {}
        if (mapping.map) mapping.map.invalidateSize();
      }, 100);
    });
  });
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  layout.init('grid-container');
  mapping.init('map-container');
  charts.init('chart-speed-dist', 'chart-speed-time', 'chart-gg', 'chart-slip');
  video.init('video-container');

  initMobileTabs();
  initPanelCollapse();

  // CSV Upload
  $('csv-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  // Video Upload
  $('video-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      video.mountVideo(file);
      handleFile(file);
    }
  });

  // Gate controls
  $('set-gate-btn').addEventListener('click', startGateDrawing);
  $('clear-gate-btn').addEventListener('click', clearGate);

  // Playback
  dom.playBtn.addEventListener('click', togglePlayback);

  // Mode switch
  $('mode-dist').addEventListener('click', () => {
    $('mode-dist').classList.add('active');
    $('mode-time').classList.remove('active');
    state.setMode('distance');
  });
  $('mode-time').addEventListener('click', () => {
    $('mode-time').classList.add('active');
    $('mode-dist').classList.remove('active');
    state.setMode('time');
  });

  // Dark mode follows system
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
  }

  // Playback speed
  $('playback-speed').addEventListener('change', (e) => {
    video.setPlaybackRate(parseFloat(e.target.value));
  });

  // Step frame
  $('prev-frame-btn').addEventListener('click', () => {
    const t = Math.max(0, state.session.currentPlaybackTime - 0.04);
    state.setPlaybackTime(t);
    video.syncToState();
  });
  $('next-frame-btn').addEventListener('click', () => {
    const t = Math.min(state.session.totalDuration, state.session.currentPlaybackTime + 0.04);
    state.setPlaybackTime(t);
    video.syncToState();
  });

  // Download CSV
  $('download-csv-btn').addEventListener('click', handleDownloadCSV);

  // Lap sort toggle
  $('sort-laps-toggle').addEventListener('change', (e) => {
    lapSortEnabled = e.target.checked;
    renderTimingTower(state.laps);
  });

  // Drag & Drop
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropOverlay.classList.add('active');
  });
  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null || e.relatedTarget === document.body) {
      dom.dropOverlay.classList.remove('active');
    }
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropOverlay.classList.remove('active');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });

  dom.dropOverlay.addEventListener('click', () => {
    dom.dropOverlay.classList.remove('active');
  });

  // Video offset
  $('video-offset').addEventListener('change', (e) => {
    state.setVideoOffset(parseInt(e.target.value) || 0);
  });

  // Smoothing slider
  $('smoothing-slider').addEventListener('input', (e) => {
    smoothingWindow = parseInt(e.target.value);
    $('smoothing-value').textContent = smoothingWindow;
    const laps = state.laps;
    const telemetry = state.telemetry;
    if (laps.length > 0 && telemetry.length > 0) {
      renderAllCharts(laps, telemetry);
    }
  });

  console.log('[KartData] App initialized');
});
