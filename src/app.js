// =============================================================================
// KARTDATA � Full Application (src/app.js)
// =============================================================================

// ---- Section 4: State Variables ----
let rawData = [];
let lapsData = [];
let map = null;
let tileLayer = null;
let lapMarkers = {};
let polylineLayerGroup = null;
let selectedLapIndices = new Set(['all']);
let currentVideoSize = 350;
let isDarkMode = false;
let currentSmoothing = 0;
let isRelayouting = false;
let currentPositionMarker = null;
let sortLapsByTime = false;
let gatePoints = [];
let gateLayer = null;
let ghostLayer = null;
let isDrawingGate = false;
let videoBlobUrl = null;
let videoElements = [];
let telemetryCsvText = '';
let isUploadingVideo = false;
let telemetryDownloadName = 'telemetry.csv';
let telemetrySource = null;
let extractMetadataEnabled = true;
let currentPlaybackTime = 0;
let playbackState = {
  isPlaying: false, mode: 'distance', currentValue: 0, maxValue: 0,
  animFrameId: null, lastFrameTime: 0, baseSpeed: 1.0, distanceSimSpeed: 25.0,
  markerA: null, markerB: null, loopEnabled: true, loopMode: 'full'
};
let chartLineWidth = 2.5;
let extraChartsVisible = { altitude: false, latg: false, longg: false, gg: false };
let bookmarks = [];
let statsSortKey = 'lap';
let statsSortAsc = true;
let referenceLapIndex = null;
let activeVideoSyncLapIndex = 0;
let hudVisible = true;
let lookupTables = {};
let speedHeatmapEnabled = false;
const COLORS = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1','#10b981','#f43f5e','#8b5cf6','#d946ef','#14b8a6','#eab308'];

// ---- Settings Persistence ----
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('kartdata-settings') || '{}');
    if (s.defaultSpeed) playbackState.baseSpeed = parseFloat(s.defaultSpeed);
    if (s.defaultMode) playbackState.mode = s.defaultMode;
    if (s.defaultSmoothing !== undefined) currentSmoothing = parseInt(s.defaultSmoothing);
    if (s.chartLineWidth) chartLineWidth = parseFloat(s.chartLineWidth);
    if (s.hudAlwaysOn !== undefined) hudVisible = s.hudAlwaysOn;
    if (s.autoLoop !== undefined) playbackState.loopEnabled = s.autoLoop;
  } catch(e) {}
}
function saveSettings() {
  localStorage.setItem('kartdata-settings', JSON.stringify({
    defaultSpeed: playbackState.baseSpeed, defaultMode: playbackState.mode,
    defaultSmoothing: currentSmoothing, mapTiles: isDarkMode ? 'dark' : 'light',
    chartLineWidth, hudAlwaysOn: hudVisible, autoLoop: playbackState.loopEnabled
  }));
}

// ---- Utility Functions (Group A) ----
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1), dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function deg2rad(deg) { return deg * (Math.PI / 180); }
function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return m + ':' + String(s).padStart(2,'0') + '.' + String(ms).padStart(3,'0');
}
function smoothData(data, windowSize) {
  if (windowSize <= 0 || !data || data.length === 0) return data ? [...data] : [];
  const result = [];
  for (let i = 0; i < data.length; i++) {
    let sum = 0, count = 0;
    const start = Math.max(0, i - windowSize);
    const end = Math.min(data.length - 1, i + windowSize);
    for (let j = start; j <= end; j++) { sum += data[j]; count++; }
    result.push(sum / count);
  }
  return result;
}
function intersects(a, b, c, d, p, q, r, s) {
  const det = (c - a) * (s - q) - (d - b) * (r - p);
  if (Math.abs(det) < 1e-12) return false;
  const lambda = ((r - a) * (s - q) - (s - b) * (r - p)) / det;
  const gamma = ((c - a) * (s - b) - (d - b) * (r - a)) / det;
  return lambda > 0 && lambda < 1 && gamma > 0 && gamma < 1;
}
// ---- Lookup Tables (binary search for performance) ----
function buildLookupTables() {
  lookupTables = {};
  lapsData.forEach((lap, idx) => {
    const distToTime = [], timeToDist = [];
    lap.forEach((p, i) => {
      distToTime.push({ dist: p.lapDistance, time: p.time - lap[0].time, idx: i });
      timeToDist.push({ time: p.time - lap[0].time, dist: p.lapDistance, idx: i });
    });
    lookupTables[idx] = { distToTime, timeToDist };
  });
}
function binarySearch(arr, key, field) {
  if (!arr || arr.length === 0) return null;
  let lo = 0, hi = arr.length - 1;
  if (key <= arr[0][field]) return arr[0];
  if (key >= arr[hi][field]) return arr[hi];
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid][field] < key) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && arr[lo][field] > key) lo--;
  return arr[Math.min(lo, arr.length - 1)];
}

// ---- Toast System (Section 13.12) ----
function showToast(message, type, duration, undoCallback) {
  const list = document.getElementById('toast-list');
  const icons = { success: 'check-circle', error: 'warning-circle', warning: 'warning', info: 'info' };
  const colors = { success: '#22c55e', error: '#ef4444', warning: '#eab308', info: '#3b82f6' };
  const d = duration || (type === 'error' || type === 'warning' ? 8000 : 4000);
  if (!type) type = 'info';
  const existing = list.querySelectorAll('.toast');
  if (existing.length >= 3) existing[0].remove();
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type + ' flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg mb-2 animate-slide-in pointer-events-auto';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = '<i class="ph-fill ph-' + icons[type] + ' text-lg" style="color:' + colors[type] + '"></i>' +
    '<span class="text-sm font-medium text-gray-800 dark:text-gray-200">' + message + '</span>' +
    (undoCallback ? '<button class="ml-auto text-xs font-bold text-[#ef4444] hover:text-[#dc2626] px-2 py-1 toast-undo">Undo</button>' : '') +
    '<button class="toast-dismiss ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1">�</button>';
  list.appendChild(toast);
  if (undoCallback) {
    toast.querySelector('.toast-undo').onclick = function() { undoCallback(); toast.remove(); };
  }
  toast.querySelector('.toast-dismiss').onclick = function() { toast.remove(); };
  let timer = setTimeout(function() { if (toast.parentNode) toast.remove(); }, d);
  toast.addEventListener('mouseenter', function() { clearTimeout(timer); });
  toast.addEventListener('mouseleave', function() { timer = setTimeout(function() { if (toast.parentNode) toast.remove(); }, d); });
  return toast;
}
// ---- Gate Functions (Group C) ----
function toggleGateDrawingMode() {
  if (rawData.length === 0) return;
  isDrawingGate = true;
  gatePoints = [];
  if (gateLayer) { map.removeLayer(gateLayer); gateLayer = null; }
  if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
  document.getElementById('stepText').innerHTML = "<span class='text-[#ef4444] dark:text-[#ef4444] font-bold flex items-center gap-2 animate-pulse'><i class='ph ph-crosshair text-lg'></i> Click map for Gate START point</span>";
  document.getElementById('gate-mode-badge').classList.remove('hidden');
}
function handleMapMouseMove(e) {
  if (!isDrawingGate || gatePoints.length !== 1) return;
  if (ghostLayer) map.removeLayer(ghostLayer);
  ghostLayer = L.polyline([gatePoints[0], e.latlng], { color: '#ef4444', weight: 3, dashArray: '6,6', opacity: 0.8 }).addTo(map);
}
function handleMapClick(e) {
  if (!isDrawingGate || rawData.length === 0) return;
  if (gatePoints.length === 0) {
    gatePoints.push(e.latlng);
    document.getElementById('stepText').innerHTML = "<span class='text-[#ef4444] dark:text-[#ef4444] font-bold flex items-center gap-2 animate-pulse'><i class='ph ph-crosshair text-lg'></i> Click map for Gate END point</span>";
  } else if (gatePoints.length === 1) {
    gatePoints.push(e.latlng);
    isDrawingGate = false;
    if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
    gateLayer = L.polyline(gatePoints, { color: '#ef4444', weight: 5, opacity: 1 }).addTo(map);
    gatePoints.forEach(function(pt, i) {
      var marker = L.circleMarker(pt, { radius: 7, color: '#fff', fillColor: '#ef4444', fillOpacity: 1, weight: 2, draggable: true }).addTo(map);
      marker.on('dragend', function() {
        gatePoints[i] = marker.getLatLng();
        if (gateLayer) map.removeLayer(gateLayer);
        gateLayer = L.polyline(gatePoints, { color: '#ef4444', weight: 5, opacity: 1 }).addTo(map);
        calculateLapsWithGate();
      });
    });
    document.getElementById('stepText').innerHTML = "<span class='text-[#22c55e] font-bold flex items-center gap-2'><i class='ph ph-check-circle text-lg'></i> Gate Locked! Calculating splits...</span>";
    document.getElementById('gate-mode-badge').classList.add('hidden');
    calculateLapsWithGate();
  }
}
function resetGate() {
  var hadGate = gatePoints.length > 0 || gateLayer;
  gatePoints = []; isDrawingGate = false;
  if (gateLayer) { map.removeLayer(gateLayer); gateLayer = null; }
  if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
  document.getElementById('stepText').textContent = 'Draw a gate line across the track on the map to automatically split and calculate laps.';
  document.getElementById('gate-mode-badge').classList.add('hidden');
  if (rawData.length > 0) calculateDefaultSingleLap();
  if (hadGate) showToast('Gate reset. Reverted to single lap.', 'info', 5000);
}
// ---- File Handling (Group D) ----
function handleFileUpload(event) {
  var file = event.target.files[0];
  if (!file) return;
  telemetrySource = 'csv';
  var baseName = file.name.replace(/\.[^/.]+$/, '');
  telemetryDownloadName = baseName + '_telemetry.csv';
  telemetryCsvText = '';
  document.getElementById('download-csv-btn').classList.add('hidden');
  showToast('Reading ' + file.name + '...', 'info');
  var reader = new FileReader();
  reader.onload = function(e) {
    telemetryCsvText = e.target.result;
    document.getElementById('download-csv-btn').classList.remove('hidden');
    document.getElementById('filename-display').textContent = file.name;
    Papa.parse(file, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: processIncomingCSV, error: function(err) { showToast('CSV parse error: ' + err, 'error'); } });
  };
  reader.onerror = function() { showToast('Unable to read file. It may be corrupted.', 'error'); };
  reader.readAsText(file);
}
function downloadTelemetryCsv() {
  if (!telemetryCsvText) return;
  var blob = new Blob([telemetryCsvText], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = telemetryDownloadName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}
function extractTelemetryFromVideo(file) {
  return new Promise(function(resolve, reject) {
    if (!window.MP4Box) { showToast('MP4Box library failed to load. Please reload the page.', 'error'); reject(new Error('No MP4Box')); return; }
    var sensors = { ACCL: [], GYRO: [], GPS9: [], GRAV: [], CORI: [] };
    var mp4box = MP4Box.createFile();
    var gpmdTrackId = null, timescale = null;
    mp4box.onReady = function(info) {
      var track = info.tracks.find(function(t) { return t.codec === 'gpmd'; });
      if (!track) { reject(new Error('No GPMD track found')); return; }
      gpmdTrackId = track.id; timescale = track.timescale;
      mp4box.setExtractionOptions(gpmdTrackId);
      mp4box.start();
    };
    mp4box.onSamples = function(trackId, ref, samples) {
      samples.forEach(function(sample) {
        var ctsMs = (sample.cts / timescale) * 1000;
        var durMs = (sample.duration / timescale) * 1000;
        parseGPMD(sample.data, ctsMs, durMs, sensors);
      });
    };
    var reader = file.stream().getReader();
    function readChunk() {
      reader.read().then(function(result) {
        if (result.done) {
          mp4box.flush();
          var fileNameBase = file.name.replace(/\.[^/.]+$/, '');
          var csvText = buildCombinedTelemetryCsv(sensors, fileNameBase);
          telemetryCsvText = csvText;
          telemetrySource = 'video';
          telemetryDownloadName = fileNameBase + '_telemetry.csv';
          document.getElementById('download-csv-btn').classList.remove('hidden');
          document.getElementById('filename-display').textContent = fileNameBase + ' (extracted)';
          Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: processIncomingCSV, error: function(err) { showToast('Error parsing extracted CSV: ' + err, 'error'); } });
          resolve(csvText);
          return;
        }
        var buf = result.value.buffer;
        mp4box.appendBuffer(buf);
        readChunk();
      }).catch(reject);
    }
    readChunk();
  });
}
function parseGPMD(data, baseCts, duration, sensors) {
  var i = 0;
  var dv = new DataView(data);
  while (i + 8 <= dv.byteLength) {
    var fourcc = String.fromCharCode(dv.getUint8(i), dv.getUint8(i+1), dv.getUint8(i+2), dv.getUint8(i+3));
    var type = String.fromCharCode(dv.getUint8(i+4));
    var size = dv.getUint8(i+5);
    var count = dv.getUint16(i+6, false);
    var pSize = size * count;
    if (pSize <= 0 || i + 8 > dv.byteLength) { i += 4; continue; }
    var payloadStart = i + 8;
    if (fourcc === 'DEVC' || fourcc === 'STRM') {
      parseGPMD(data.slice(payloadStart, payloadStart + pSize), baseCts, duration, sensors);
    } else if (fourcc === 'TAMP' && payloadStart + 2 <= dv.byteLength) {
      sensors._lastTemp = dv.getInt16(payloadStart, false) / 100;
    } else if (fourcc === 'ACCL') {
      var bytesPerSample = type === 'f' ? 12 : 6;
      var samples = Math.floor(pSize / bytesPerSample);
      for (var s = 0; s < samples; s++) {
        var off = payloadStart + s * bytesPerSample;
        var ts = baseCts + (duration * s) / samples;
        var x, y, z;
        if (type === 'f') { x = dv.getFloat32(off, true); y = dv.getFloat32(off+4, true); z = dv.getFloat32(off+8, true); }
        else { x = dv.getInt16(off, true) / 100; y = dv.getInt16(off+2, true) / 100; z = dv.getInt16(off+4, true) / 100; }
        sensors.ACCL.push({ ts: ts, x: x, y: y, z: z, temp: sensors._lastTemp || null });
      }
    } else if (fourcc === 'GYRO') {
      var bytesPerSample = type === 'f' ? 12 : 6;
      var samples = Math.floor(pSize / bytesPerSample);
      for (var s = 0; s < samples; s++) {
        var off = payloadStart + s * bytesPerSample;
        var ts = baseCts + (duration * s) / samples;
        var x, y, z;
        if (type === 'f') { x = dv.getFloat32(off, true); y = dv.getFloat32(off+4, true); z = dv.getFloat32(off+8, true); }
        else { x = dv.getInt16(off, true) / 1000; y = dv.getInt16(off+2, true) / 1000; z = dv.getInt16(off+4, true) / 1000; }
        sensors.GYRO.push({ ts: ts, x: x, y: y, z: z, temp: sensors._lastTemp || null });
      }
    } else if (fourcc === 'GRAV') {
      var samples = Math.floor(pSize / 6);
      for (var s = 0; s < samples; s++) {
        var off = payloadStart + s * 6;
        var ts = baseCts + (duration * s) / samples;
        sensors.GRAV.push({ ts: ts, x: dv.getInt16(off, true) / 4096, y: dv.getInt16(off+2, true) / 4096, z: dv.getInt16(off+4, true) / 4096 });
      }
    } else if (fourcc === 'CORI') {
      var bytesPerSample = type === 'f' ? 16 : 8;
      var samples = Math.floor(pSize / bytesPerSample);
      for (var s = 0; s < samples; s++) {
        var off = payloadStart + s * bytesPerSample;
        var ts = baseCts + (duration * s) / samples;
        var w, x, y, z;
        if (type === 'f') { w = dv.getFloat32(off, true); x = dv.getFloat32(off+4, true); y = dv.getFloat32(off+8, true); z = dv.getFloat32(off+12, true); }
        else { w = dv.getInt16(off, true) / 32767; x = dv.getInt16(off+2, true) / 32767; y = dv.getInt16(off+4, true) / 32767; z = dv.getInt16(off+6, true) / 32767; }
        sensors.CORI.push({ ts: ts, w: w, x: x, y: y, z: z });
      }
    } else if (fourcc === 'GPS9') {
      for (var s = 0; s < Math.floor(pSize / 32); s++) {
        var off = payloadStart + s * 32;
        var ts = baseCts + (duration * s) / Math.floor(pSize / 32);
        sensors.GPS9.push({ ts: ts, lat: dv.getInt32(off, true) / 1e7, lon: dv.getInt32(off+4, true) / 1e7, alt: dv.getInt32(off+8, true) / 1000, speed2d: dv.getInt32(off+12, true) / 1000, speed3d: dv.getInt32(off+16, true) / 1000, days: dv.getUint32(off+20, true), secs: dv.getUint32(off+24, true) / 1000, dop: dv.getUint16(off+28, true) / 100, fix: dv.getUint16(off+30, true), altSys: 'MSLV' });
      }
    }
    var aligned = 8 + Math.ceil(pSize / 4) * 4;
    i += aligned;
  }
}
function buildCombinedTelemetryCsv(sensors, selectedFileName) {
  var allTs = new Set();
  Object.values(sensors).forEach(function(arr) { arr.forEach(function(p) { allTs.add(p.ts.toFixed(6)); }); });
  var sortedTs = Array.from(allTs).sort(function(a, b) { return parseFloat(a) - parseFloat(b); });
  var maps = {};
  Object.keys(sensors).forEach(function(key) {
    maps[key] = new Map();
    sensors[key].forEach(function(p) { maps[key].set(p.ts.toFixed(6), p); });
  });
  var refDate = new Date('2000-01-01T00:00:00Z');
  var currentDateStr = '';
  var header = 'cts,date,ACCL_x,ACCL_y,ACCL_z,temp_ACCL,GYRO_x,GYRO_y,GYRO_z,temp_GYRO,GRAV_x,GRAV_y,GRAV_z,CORI_w,CORI_x,CORI_y,CORI_z,GPS (Lat.) [deg],GPS (Long.) [deg],GPS (Alt.) [m],GPS (2D) [m/s],GPS (3D) [m/s],GPS (days) [deg],GPS (secs) [s],GPS (DOP) [deg],GPS (fix) [deg],altitude system';
  var rows = [header];
  sortedTs.forEach(function(tsStr) {
    var ts = parseFloat(tsStr);
    var a = maps['ACCL'].get(tsStr), g = maps['GYRO'].get(tsStr), gr = maps['GRAV'].get(tsStr);
    var co = maps['CORI'].get(tsStr), gps = maps['GPS9'].get(tsStr);
    if (gps) {
      var d = new Date(refDate.getTime() + (gps.days * 86400 + gps.secs) * 1000);
      currentDateStr = d.toISOString();
    }
    var cols = [
      ts.toFixed(6), currentDateStr,
      a ? a.x.toFixed(6) : '', a ? a.y.toFixed(6) : '', a ? a.z.toFixed(6) : '', a && a.temp != null ? a.temp.toFixed(6) : '',
      g ? g.x.toFixed(6) : '', g ? g.y.toFixed(6) : '', g ? g.z.toFixed(6) : '', g && g.temp != null ? g.temp.toFixed(6) : '',
      gr ? gr.x.toFixed(6) : '', gr ? gr.y.toFixed(6) : '', gr ? gr.z.toFixed(6) : '',
      co ? co.w.toFixed(6) : '', co ? co.x.toFixed(6) : '', co ? co.y.toFixed(6) : '', co ? co.z.toFixed(6) : '',
      gps ? gps.lat.toFixed(6) : '', gps ? gps.lon.toFixed(6) : '', gps ? gps.alt.toFixed(6) : '',
      gps ? gps.speed2d.toFixed(6) : '', gps ? gps.speed3d.toFixed(6) : '',
      gps ? gps.days : '', gps ? gps.secs.toFixed(6) : '',
      gps ? gps.dop.toFixed(6) : '', gps ? gps.fix : '', gps ? 'MSLV' : ''
    ];
    rows.push(cols.join(','));
  });
  return rows.join('\n');
}
function processIncomingCSV(result) {
  var data = result && result.data ? result.data : result;
  if (!data || data.length === 0) { showToast('No data found in file.', 'warning'); return; }
  var first = data[0];
  var latKey = Object.keys(first).find(function(k) { return k.toLowerCase().includes('lat'); });
  var lonKey = Object.keys(first).find(function(k) { return k.toLowerCase().includes('lon') || k.toLowerCase().includes('long'); });
  var speedKey = Object.keys(first).find(function(k) { return k.toLowerCase().includes('2d') || k.toLowerCase().includes('speed') || k.toLowerCase().includes('3d'); });
  var timeKey = Object.keys(first).find(function(k) { return k.toLowerCase().includes('date') || k.toLowerCase().includes('cts') || k.toLowerCase().includes('time'); });
  if (!latKey || !lonKey) { showToast('No GPS columns found in CSV. Check column names.', 'warning'); return; }
  var clean = [], prevLat = null, prevLon = null, totalDist = 0, firstTime = null;
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var lat = parseFloat(row[latKey]);
    var lon = parseFloat(row[lonKey]);
    if (isNaN(lat) || isNaN(lon)) continue;
    var speed = 0, speedMS = 0;
    if (speedKey) {
      speed = parseFloat(row[speedKey]) || 0;
      var raw = row[speedKey];
      if (raw != null && String(raw).includes('km/h')) { speedMS = speed / 3.6; }
      else { speedMS = speed; speed = speed * 3.6; }
    }
    var time;
    if (timeKey) {
      var tv = row[timeKey];
      if (typeof tv === 'number' && tv > 100000) time = tv / 1000;
      else if (typeof tv === 'string' && !isNaN(Date.parse(tv))) time = new Date(tv).getTime() / 1000;
      else time = (tv != null && !isNaN(parseFloat(tv))) ? parseFloat(tv) : i * 0.1;
    } else { time = i * 0.1; }
    if (firstTime === null) firstTime = time;
    time = time - firstTime;
    if (prevLat !== null) totalDist += getDistanceFromLatLonInM(prevLat, prevLon, lat, lon);
    clean.push({ index: i, lat: lat, lon: lon, speed: speed, speedMS: speedMS, time: time, totalDistance: totalDist, rowId: i });
    prevLat = lat; prevLon = lon;
  }
  if (clean.length === 0) { showToast('All GPS values are invalid.', 'warning'); return; }
  rawData = clean;
  document.getElementById('draw-gate-btn').disabled = false;
  calculateDefaultSingleLap();
  showToast('Loaded ' + clean.length + ' data points across ' + (lapsData.length || 1) + ' laps.', 'success');
}
// ---- Lap Calculation (Group E) ----
function calculateDefaultSingleLap() {
  if (rawData.length === 0) return;
  var lap = rawData.map(function(p) { return Object.assign({}, p, { lap: 1, lapDistance: p.totalDistance }); });
  lap.duration = lap.length > 0 ? lap[lap.length-1].time - lap[0].time : 0;
  lap.maxDistance = lap.length > 0 ? lap[lap.length-1].totalDistance : 0;
  lapsData = [lap];
  selectedLapIndices = new Set(['all']);
  referenceLapIndex = 0;
  buildLookupTables();
  updateUIState();
  updateVisualization();
}
function calculateLapsWithGate() {
  if (gatePoints.length < 2 || rawData.length === 0) return;
  var gate = gatePoints;
  var splits = [], lastSplitIdx = 0;
  for (var i = 1; i < rawData.length; i++) {
    var p1 = rawData[i-1], p2 = rawData[i];
    if (intersects(gate[0].lng, gate[0].lat, gate[1].lng, gate[1].lat, p1.lon, p1.lat, p2.lon, p2.lat)) {
      if (i - lastSplitIdx > 50) {
        var lapSlice = rawData.slice(lastSplitIdx, i + 1).map(function(p, j, arr) { return Object.assign({}, p, { lap: splits.length + 1, lapDistance: p.totalDistance - arr[0].totalDistance }); });
        lapSlice.duration = lapSlice.length > 0 ? lapSlice[lapSlice.length-1].time - lapSlice[0].time : 0;
        lapSlice.maxDistance = lapSlice.length > 0 ? lapSlice[lapSlice.length-1].totalDistance - lapSlice[0].totalDistance : 0;
        splits.push(lapSlice);
        lastSplitIdx = i;
      }
    }
  }
  if (rawData.length - lastSplitIdx >= 10) {
    var lapSlice = rawData.slice(lastSplitIdx).map(function(p, j, arr) { return Object.assign({}, p, { lap: splits.length + 1, lapDistance: p.totalDistance - arr[0].totalDistance }); });
    lapSlice.duration = lapSlice.length > 0 ? lapSlice[lapSlice.length-1].time - lapSlice[0].time : 0;
    lapSlice.maxDistance = lapSlice.length > 0 ? lapSlice[lapSlice.length-1].totalDistance - lapSlice[0].totalDistance : 0;
    splits.push(lapSlice);
  }
  if (splits.length === 0) { calculateDefaultSingleLap(); return; }
  lapsData = splits;
  selectedLapIndices = new Set(['all']);
  referenceLapIndex = findFastestLap();
  buildLookupTables();
  updateUIState();
  updateVisualization();
}
function findFastestLap() {
  var bestIdx = 0, bestTime = Infinity;
  lapsData.forEach(function(l, i) { if (l.duration > 0 && l.duration < bestTime) { bestTime = l.duration; bestIdx = i; } });
  return bestIdx;
}
function getSelectedLaps() {
  if (selectedLapIndices.has('all')) return lapsData.map(function(lap, index) { return { lap: lap, index: index }; });
  var result = [];
  selectedLapIndices.forEach(function(idx) {
    if (typeof idx === 'number' && idx < lapsData.length) result.push({ lap: lapsData[idx], index: idx });
  });
  return result;
}
// ---- UI Update & Rendering (Groups F, L) ----
function updateUIState() {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('app-sidebar').classList.remove('hidden');
  document.getElementById('dashboard-content').classList.remove('hidden');
  document.getElementById('file-info').classList.remove('hidden');
  document.getElementById('file-info').classList.add('flex');
  document.getElementById('playback-bar').classList.remove('hidden');
  document.getElementById('lap-count-display').textContent = lapsData.length + ' Laps';
  renderLapList();
  updateStatisticsPanel();
  document.getElementById('bookmarks-panel').classList.remove('hidden');
  document.getElementById('live-telemetry-panel').classList.remove('hidden');
  setTimeout(function() {
    if (map) { map.invalidateSize(); fitMapBounds(); }
    document.querySelectorAll('[id^=\"chart-\"]').forEach(function(el) { if (el.data) Plotly.Plots.resize(el); });
  }, 150);
}
function fitMapBounds() {
  if (!map || rawData.length === 0) return;
  var bounds = rawData.map(function(p) { return [p.lat, p.lon]; });
  map.fitBounds(bounds, { padding: [30, 30] });
}
function renderLapList() {
  var container = document.getElementById('sidebar-lap-list');
  container.innerHTML = '';
  var allChecked = selectedLapIndices.has('all');
  container.appendChild(createFilterItem('All Laps', 'all', allChecked, '#3b82f6', null, false));
  var sep = document.createElement('div');
  sep.className = 'h-px w-full bg-gray-200 dark:bg-gray-800 my-2';
  container.appendChild(sep);
  var lapsToDisplay = lapsData.map(function(lap, idx) { return { lap: lap, index: idx }; });
  if (sortLapsByTime) lapsToDisplay.sort(function(a, b) { return (a.lap.duration || Infinity) - (b.lap.duration || Infinity); });
  var bestTime = Math.min.apply(null, lapsData.map(function(l) { return l.duration; }).filter(function(d) { return d > 0; }));
  lapsToDisplay.forEach(function(item) {
    var idx = item.index, lap = item.lap;
    var checked = selectedLapIndices.has(idx) || selectedLapIndices.has('all');
    var isBest = lap.duration === bestTime && lapsData.length > 1;
    var el = createFilterItem('Lap ' + (idx+1), idx, checked, COLORS[idx % 16], lap.duration, isBest);
    el.addEventListener('contextmenu', function(e) { e.preventDefault(); showLapContextMenu(e, idx); });
    container.appendChild(el);
  });
}
function createFilterItem(label, value, checked, color, duration, isBest) {
  var labelEl = document.createElement('label');
  labelEl.className = 'flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700 select-none';
  var cb = document.createElement('input');
  cb.type = 'checkbox'; cb.value = value;
  cb.className = 'lap-checkbox focus:ring-0';
  cb.checked = checked;
  var dot = document.createElement('div');
  dot.className = 'w-3 h-3 rounded-full shadow-sm flex-shrink-0';
  dot.style.backgroundColor = color;
  var span = document.createElement('span');
  span.className = 'text-sm font-semibold text-gray-700 dark:text-gray-300 truncate flex-1';
  span.textContent = label;
  labelEl.appendChild(cb); labelEl.appendChild(dot); labelEl.appendChild(span);
  if (duration != null) {
    var durSpan = document.createElement('span');
    durSpan.className = 'font-mono text-xs text-gray-500 dark:text-gray-400';
    if (isBest) durSpan.innerHTML = '<i class=\"ph-fill ph-trophy text-[#22c55e] text-[10px]\"></i> ' + formatTime(duration);
    else durSpan.textContent = formatTime(duration);
    labelEl.appendChild(durSpan);
  }
  cb.addEventListener('change', function(e) { handleFilterChange(value, e.target.checked); });
  return labelEl;
}
function handleFilterChange(value, isChecked) {
  if (value === 'all') {
    if (isChecked) {
      selectedLapIndices = new Set(['all']);
      document.querySelectorAll('#sidebar-lap-list .lap-checkbox').forEach(function(cb) { if (cb.value !== 'all') cb.checked = false; });
    } else {
      var others = document.querySelectorAll('#sidebar-lap-list .lap-checkbox:checked:not([value=\"all\"])');
      if (others.length === 0) { document.querySelector('#sidebar-lap-list .lap-checkbox[value=\"all\"]').checked = true; return; }
      selectedLapIndices.delete('all');
    }
  } else {
    var numVal = parseInt(value);
    if (isChecked) {
      selectedLapIndices.delete('all');
      var allCb = document.querySelector('#sidebar-lap-list .lap-checkbox[value=\"all\"]');
      if (allCb) allCb.checked = false;
      selectedLapIndices.add(numVal);
    } else {
      selectedLapIndices.delete(numVal);
      if (selectedLapIndices.size === 0) {
        selectedLapIndices = new Set(['all']);
        var allCb = document.querySelector('#sidebar-lap-list .lap-checkbox[value=\"all\"]');
        if (allCb) allCb.checked = true;
      }
    }
  }
  updateVisualization();
}
function showLapContextMenu(e, idx) {
  var existing = document.querySelector('.lap-context-menu');
  if (existing) existing.remove();
  var menu = document.createElement('div');
  menu.className = 'lap-context-menu fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 text-sm';
  menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
  [
    { label: 'Set as Reference', action: function() { referenceLapIndex = idx; updateVisualization(); renderLapList(); } },
    { label: 'Hide Others', action: function() { selectedLapIndices = new Set([idx]); updateVisualization(); renderLapList(); } },
    { label: 'Export Lap Data', action: function() { exportLapData(idx); } }
  ].forEach(function(item) {
    var btn = document.createElement('button');
    btn.className = 'block w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300';
    btn.textContent = item.label;
    btn.onclick = function() { item.action(); menu.remove(); };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  document.addEventListener('click', function() { menu.remove(); }, { once: true });
}
function exportLapData(idx) {
  var lap = lapsData[idx];
  if (!lap) return;
  var csv = 'index,lat,lon,speed,speedMS,time,totalDistance,lapDistance\n' + lap.map(function(p) { return p.index + ',' + p.lat + ',' + p.lon + ',' + p.speed + ',' + p.speedMS + ',' + p.time + ',' + p.totalDistance + ',' + p.lapDistance; }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = 'lap_' + (idx+1) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  showToast('Lap data exported.', 'success');
}
function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.documentElement.classList.toggle('dark');
  var icon = document.querySelector('#theme-toggle i');
  icon.className = isDarkMode ? 'ph ph-sun text-lg' : 'ph ph-moon text-lg';
  if (tileLayer) {
    map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(isDarkMode ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: isDarkMode ? '&copy; <a href=\"https://www.openstreetmap.org/copyright\">OSM</a> &copy; <a href=\"https://carto.com/\">CARTO</a>' : '&copy; <a href=\"https://www.openstreetmap.org/copyright\">OSM</a>'
    }).addTo(map);
  }
  if (lapsData.length > 0) updateVisualization();
}

function renderMap(lapsToRender) {
  if (!map) return;
  polylineLayerGroup.clearLayers();
  Object.values(lapMarkers).forEach(function(m) { map.removeLayer(m); });
  lapMarkers = {};
  lapsToRender.forEach(function(item) {
    var lap = item.lap, index = item.index;
    var latlngs = lap.map(function(p) { return [p.lat, p.lon]; });
    var color = index === referenceLapIndex ? '#b138ff' : COLORS[index % 16];
    polylineLayerGroup.addLayer(L.polyline(latlngs, { color: color, weight: index === referenceLapIndex ? 3 : 2.5, opacity: 0.85 }));
    if (latlngs.length > 0) {
      var marker = L.circleMarker(latlngs[0], { radius: 5, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 });
      marker.addTo(map);
      lapMarkers[index] = marker;
    }
  });
  var firstPt = lapsToRender.length > 0 && lapsToRender[0].lap.length > 0 ? [lapsToRender[0].lap[0].lat, lapsToRender[0].lap[0].lon] : null;
  if (firstPt) {
    if (!currentPositionMarker) {
      currentPositionMarker = L.circleMarker(firstPt, { radius: 8, color: '#fff', fillColor: '#facc15', fillOpacity: 1, weight: 2 }).addTo(map);
    } else {
      currentPositionMarker.setLatLng(firstPt);
      if (!map.hasLayer(currentPositionMarker)) currentPositionMarker.addTo(map);
    }
  }
}
function renderCharts(lapsToRender) {
  if (!lapsToRender || lapsToRender.length === 0) return;
  var fontColor = isDarkMode ? '#94a3b8' : '#475569';
  var gridColor = isDarkMode ? '#334155' : '#e2e8f0';
  var axisFont = { family: 'Inter, sans-serif', size: 10, color: fontColor };
  var commonLayout = {
    margin: { t: 24, r: 12, l: 36, b: 28 },
    hovermode: 'x unified', showlegend: true,
    legend: { orientation: 'h', y: 1.2, x: 1, xanchor: 'right', font: { family: 'Inter, sans-serif', size: 10, color: fontColor } },
    plot_bgcolor: 'transparent', paper_bgcolor: 'transparent',
    font: { family: 'Inter, sans-serif', color: fontColor },
    hoverlabel: { bgcolor: isDarkMode ? '#1e293b' : '#ffffff', font: { color: isDarkMode ? '#f8fafc' : '#0f172a' }, bordercolor: gridColor }
  };
  function makeTraces(getX, getY, extra) {
    var traces = lapsToRender.map(function(item) {
      var lap = item.lap, index = item.index;
      var x = getX(lap), y = smoothData(getY(lap), currentSmoothing);
      var opacity = (index === referenceLapIndex || referenceLapIndex === null) ? 1.0 : 0.5;
      return { x: x, y: y, type: 'scatter', mode: 'lines', line: { width: chartLineWidth, color: index === referenceLapIndex ? '#b138ff' : COLORS[index % 16] }, name: 'Lap ' + (index+1), opacity: opacity };
    });
    traces.push({ x: [], y: [], mode: 'markers', type: 'scatter', marker: { size: 8, color: '#facc15', symbol: 'circle' }, name: 'cursor', hoverinfo: 'skip' });
    return traces;
  }
  var sdTraces = makeTraces(function(d) { return d.map(function(p) { return p.lapDistance; }); }, function(d) { return d.map(function(p) { return p.speed; }); });
  Plotly.react('chart-speed-dist', sdTraces, Object.assign({}, commonLayout, {
    xaxis: { title: { text: 'Distance (m)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont },
    yaxis: { title: { text: 'Speed (km/h)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false }
  }));
  var stTraces = makeTraces(function(d) { return d.map(function(p) { return p.time - d[0].time; }); }, function(d) { return d.map(function(p) { return p.speed; }); });
  Plotly.react('chart-speed-time', stTraces, Object.assign({}, commonLayout, {
    xaxis: { title: { text: 'Time (s)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont },
    yaxis: { title: { text: 'Speed (km/h)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false }
  }));
  if (extraChartsVisible.altitude && document.getElementById('chart-altitude-container')) {
    document.getElementById('chart-altitude-container').classList.remove('hidden');
    var altTraces = makeTraces(function(d) { return d.map(function(p) { return p.lapDistance; }); }, function(d) { return d.map(function(p) { return p.alt || 0; }); });
    Plotly.react('chart-altitude', altTraces, Object.assign({}, commonLayout, {
      xaxis: { title: { text: 'Distance (m)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont },
      yaxis: { title: { text: 'Altitude (m)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false }
    }));
  }
  if (extraChartsVisible.latg && document.getElementById('chart-latg-container')) {
    document.getElementById('chart-latg-container').classList.remove('hidden');
    var latgTraces = makeTraces(function(d) { return d.map(function(p) { return p.lapDistance; }); }, function(d) { return computeLatG(d); });
    Plotly.react('chart-latg', latgTraces, Object.assign({}, commonLayout, {
      xaxis: { title: { text: 'Distance (m)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont },
      yaxis: { title: { text: 'Lateral G', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false }
    }));
  }
  if (extraChartsVisible.longg && document.getElementById('chart-longg-container')) {
    document.getElementById('chart-longg-container').classList.remove('hidden');
    var longgTraces = makeTraces(function(d) { return d.map(function(p) { return p.lapDistance; }); }, function(d) { return computeLonG(d); });
    Plotly.react('chart-longg', longgTraces, Object.assign({}, commonLayout, {
      xaxis: { title: { text: 'Distance (m)', font: axisFont }, gridcolor: gridColor, tickfont: axisFont },
      yaxis: { title: { text: 'Longitudinal G', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false }
    }));
  }
  if (extraChartsVisible.gg && document.getElementById('chart-gg-container')) {
    document.getElementById('chart-gg-container').classList.remove('hidden');
    var ggTraces = lapsToRender.map(function(item) {
      var lap = item.lap, index = item.index;
      var latg = computeLatG(lap), longg = computeLonG(lap);
      var speeds = lap.map(function(p) { return p.speed; });
      return { x: latg, y: longg, mode: 'markers', type: 'scatter', marker: { size: 3, color: speeds, colorscale: [['#ef4444','#eab308','#22c55e']], showscale: false }, name: 'Lap ' + (index+1), opacity: 0.6 };
    });
    var circle = [];
    for (var a = 0; a <= 360; a += 5) { var rad = a * Math.PI / 180; circle.push({ x: Math.cos(rad), y: Math.sin(rad) }); }
    ggTraces.push({ x: circle.map(function(p) { return p.x; }), y: circle.map(function(p) { return p.y; }), mode: 'lines', type: 'scatter', line: { color: '#64748b', width: 1, dash: 'dash' }, name: '1.0G', hoverinfo: 'skip' });
    Plotly.react('chart-gg', ggTraces, Object.assign({}, commonLayout, {
      xaxis: { title: { text: 'Lateral G', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, scaleanchor: 'y', scaleratio: 1 },
      yaxis: { title: { text: 'Longitudinal G', font: axisFont }, gridcolor: gridColor, tickfont: axisFont, fixedrange: false }
    }));
  }
  setupInteractionProfiles('chart-speed-dist', 'chart-speed-time');
  setupZoomSyncEngine('chart-speed-dist', 'chart-speed-time');
}
function computeLatG(lap) {
  var g = [];
  for (var i = 1; i < lap.length - 1; i++) {
    var prev = lap[i-1], cur = lap[i], next = lap[i+1];
    var dx = next.lon - prev.lon, dy = next.lat - prev.lat;
    var d = Math.sqrt(dx*dx + dy*dy);
    if (d < 1e-8) { g.push(0); continue; }
    var nx = -dy/d, ny = dx/d;
    var vx = cur.lon - prev.lon, vy = cur.lat - prev.lat;
    var latAccel = (vx * nx + vy * ny) * (cur.speedMS || 1) / d;
    g.push(latAccel / 9.81);
  }
  g.unshift(0); g.push(0);
  return g;
}
function computeLonG(lap) {
  var g = [];
  for (var i = 1; i < lap.length; i++) {
    var dt = lap[i].time - lap[i-1].time;
    var dv = lap[i].speedMS - lap[i-1].speedMS;
    g.push(dt > 0.001 ? (dv / dt) / 9.81 : 0);
  }
  g.unshift(0);
  return g;
}
function updateVisualization() {
  var lapsToRender = getSelectedLaps();
  renderCharts(lapsToRender);
  renderMap(lapsToRender);
  renderVideoMonitorGrid(lapsToRender);
  updateScrubberScalingBoundaries(lapsToRender);
}
// ---- Chart Interaction (Group G) ----
function setupZoomSyncEngine(id1, id2) {
  function sync(srcId, tgtId) {
    var src = document.getElementById(srcId);
    if (!src) return;
    src.on('plotly_relayout', function(eventdata) {
      if (isRelayouting) return;
      if (!eventdata || (!eventdata['xaxis.range[0]'] && !eventdata['xaxis.autorange'])) return;
      isRelayouting = true;
      try {
        var update = {};
        if (eventdata['yaxis.range[0]'] !== undefined) { update['yaxis.range[0]'] = eventdata['yaxis.range[0]']; update['yaxis.range[1]'] = eventdata['yaxis.range[1]']; }
        if (eventdata['xaxis.range[0]'] !== undefined) { update['xaxis.range[0]'] = eventdata['xaxis.range[0]']; update['xaxis.range[1]'] = eventdata['xaxis.range[1]']; }
        if (eventdata['xaxis.autorange'] !== undefined) update['xaxis.autorange'] = true;
        Plotly.relayout(tgtId, update);
      } finally { setTimeout(function() { isRelayouting = false; }, 100); }
    });
  }
  sync(id1, id2); sync(id2, id1);
}
function setupInteractionProfiles(id1, id2) {
  [id1, id2].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.on('plotly_click', function(data) {
      if (!data || !data.points || data.points.length === 0) return;
      var pt = data.points[0];
      if (pt.curveNumber === undefined) return;
      pausePlayback();
      var xVal = pt.x;
      if (playbackState.mode === 'distance') manualSeek(xVal);
      else manualSeek(xVal);
    });
    el.on('plotly_hover', function(data) {
      if (!data || !data.points || data.points.length === 0) return;
      var pt = data.points[0];
      if (pt.customdata !== undefined && currentPositionMarker) {
        var dp = rawData[pt.customdata];
        if (dp) currentPositionMarker.setLatLng([dp.lat, dp.lon]);
      } else if (pt.x !== undefined && currentPositionMarker) {
        var laps = getSelectedLaps();
        for (var li = 0; li < laps.length; li++) {
          for (var pi = 0; pi < laps[li].lap.length; pi++) {
            var p = laps[li].lap[pi];
            if (Math.abs(p.lapDistance - pt.x) < 0.5 || Math.abs((p.time - laps[li].lap[0].time) - pt.x) < 0.05) {
              currentPositionMarker.setLatLng([p.lat, p.lon]);
              return;
            }
          }
        }
      }
    });
  });
}
function exportChartPng(id) {
  Plotly.toImage(id, { format: 'png', width: 800, height: 500 }).then(function(url) {
    var a = document.createElement('a'); a.href = url; a.download = id + '.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }).catch(function() { showToast('Failed to export chart.', 'error'); });
}
// ---- Video Handling (Group H) ----
function setVideoUploadState(isLoading, labelText) {
  var icon = document.getElementById('video-upload-icon');
  var text = document.getElementById('video-btn-text');
  var label = document.getElementById('video-upload-label');
  if (isLoading) {
    label.classList.add('opacity-80', 'cursor-wait');
    icon.className = 'ph ph-spinner-gap text-base animate-spin';
    if (labelText) text.textContent = labelText;
  } else {
    label.classList.remove('opacity-80', 'cursor-wait');
    icon.className = 'ph ph-video-camera text-base';
    text.textContent = 'Add Video';
  }
}
function handleVideoUpload(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (isUploadingVideo) { showToast('Please wait for current processing to complete.', 'warning'); return; }
  isUploadingVideo = true;
  var truncated = file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name;
  setVideoUploadState(true, truncated);
  if (videoBlobUrl) { URL.revokeObjectURL(videoBlobUrl); videoBlobUrl = null; }
  videoBlobUrl = URL.createObjectURL(file);
  var csvInput = document.getElementById('csv-upload');
  var hasCsv = csvInput && csvInput.files.length > 0;
  var doExtract = !hasCsv && extractMetadataEnabled;
  var extractPromise = doExtract ? extractTelemetryFromVideo(file).catch(function(err) {
    showToast('Telemetry extraction failed. ' + (err.message || 'No GPMD telemetry track found in this video. Upload a CSV instead.'), 'error');
  }) : Promise.resolve();
  extractPromise.then(function() {
    isUploadingVideo = false;
    setVideoUploadState(false);
    if (lapsData.length > 0) updateVisualization();
  }, function() {
    isUploadingVideo = false;
    setVideoUploadState(false);
    if (lapsData.length > 0) updateVisualization();
  });
}
function renderVideoMonitorGrid(lapsToRender) {
  var section = document.getElementById('video-section');
  if (!videoBlobUrl || !lapsToRender || lapsToRender.length === 0) {
    if (section && !section.classList.contains('hidden')) section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  document.getElementById('rh-video').classList.remove('hidden');
  videoElements = [];
  var primaryVideo = document.getElementById('primary-video');
  primaryVideo.src = videoBlobUrl;
  var lapsToShow = lapsToRender;
  if (selectedLapIndices.has('all') && lapsToShow.length > 4) {
    lapsToShow = lapsToShow.slice(0, 4);
  }
  if (lapsToShow.length > 0) activeVideoSyncLapIndex = lapsToShow[0].index;
  var strip = document.getElementById('video-thumbnail-strip');
  strip.innerHTML = '';
  lapsToShow.forEach(function(item) {
    var lap = item.lap, index = item.index;
    var thumb = document.createElement('button');
    thumb.className = 'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold border transition-all ' + (index === activeVideoSyncLapIndex ? 'border-[#ef4444] bg-[#ef4444]/10' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800');
    thumb.innerHTML = '<div class=\"w-2 h-2 rounded-full\" style=\"background:' + COLORS[index%16] + '\"></div> Lap ' + (index+1);
    thumb.onclick = function() {
      activeVideoSyncLapIndex = index;
      strip.querySelectorAll('button').forEach(function(b) { b.classList.remove('border-[#ef4444]', 'bg-[#ef4444]/10'); });
      thumb.classList.add('border-[#ef4444]', 'bg-[#ef4444]/10');
      syncVideosToStateTimeline(true);
    };
    strip.appendChild(thumb);
    videoElements.push({ lapIndex: index, element: primaryVideo, lapData: lap, lastIndex: 0 });
  });
  var wrapper = document.getElementById('primary-video-wrapper');
  var activeLap = lapsToRender.find(function(l) { return l.index === activeVideoSyncLapIndex; });
  if (activeLap) wrapper.style.borderColor = COLORS[activeLap.index % 16];
  primaryVideo.addEventListener('error', function() { wrapper.classList.add('has-error'); showToast('Video codec not supported in this browser.', 'warning', 8000); });
  primaryVideo.addEventListener('loadeddata', function() { if (primaryVideo.videoWidth === 0) wrapper.classList.add('has-error'); });
  syncVideosToStateTimeline(true);
}
function updateVideoPlaybackRates() {
  if (!playbackState.isPlaying) return;
  videoElements.forEach(function(vObj) {
    if (playbackState.mode === 'time') {
      vObj.element.playbackRate = playbackState.baseSpeed;
    } else {
      var table = lookupTables[vObj.lapIndex];
      if (!table) return;
      var entry = binarySearch(table.distToTime, playbackState.currentValue, 'dist');
      var lap = vObj.lapData;
      var pt = entry ? lap[entry.idx] : lap[lap.length - 1];
      if (pt && pt.speedMS > 0.5) {
        var rate = (playbackState.distanceSimSpeed * playbackState.baseSpeed) / pt.speedMS;
        vObj.element.playbackRate = Math.max(0.15, Math.min(5.0, rate));
      } else { vObj.element.playbackRate = 1.0; }
    }
  });
}
function syncVideosToStateTimeline(forceSeek) {
  var currentVal = playbackState.currentValue;
  var isDist = playbackState.mode === 'distance';
  document.getElementById('scrubber-current').textContent = isDist ? Math.round(currentVal) + ' m' : formatTime(currentVal);
  document.getElementById('scrubber-total').textContent = isDist ? Math.round(playbackState.maxValue) + ' m' : formatTime(playbackState.maxValue);
  document.getElementById('main-scrubber').value = currentVal;
  videoElements.forEach(function(vObj) {
    var table = lookupTables[vObj.lapIndex];
    if (!table || !vObj.lapData || vObj.lapData.length === 0) return;
    var targetFileTime;
    if (isDist) {
      var entry = binarySearch(table.distToTime, currentVal, 'dist');
      targetFileTime = entry ? vObj.lapData[entry.idx].time : vObj.lapData[vObj.lapData.length-1].time;
    } else {
      targetFileTime = (vObj.lapData[0] ? vObj.lapData[0].time : 0) + currentVal;
      targetFileTime = Math.min(targetFileTime, vObj.lapData[vObj.lapData.length-1].time);
    }
    var diff = Math.abs(vObj.element.currentTime - targetFileTime);
    if (forceSeek || diff > (isDist ? 0.15 : 0.35)) { vObj.element.currentTime = targetFileTime; }
  });
  var laps = getSelectedLaps();
  if (laps.length > 0) {
    var firstLap = laps[0];
    var table = lookupTables[firstLap.index];
    if (table) {
      var pt;
      if (isDist) {
        var entry = binarySearch(table.distToTime, currentVal, 'dist');
        pt = entry ? firstLap.lap[entry.idx] : firstLap.lap[firstLap.lap.length-1];
      } else {
        var entry = binarySearch(table.timeToDist, currentVal, 'time');
        pt = entry ? firstLap.lap[entry.idx] : firstLap.lap[firstLap.lap.length-1];
      }
      if (pt) {
        document.getElementById('live-speed').textContent = pt.speed.toFixed(1);
        document.getElementById('live-time').textContent = formatTime(pt.time);
        document.getElementById('live-lap').textContent = 'Lap ' + (firstLap.index + 1);
        var sector = getSector(pt, firstLap.lap);
        document.getElementById('live-sector').textContent = sector ? 'S' + sector : '-';
        document.getElementById('hud-speed').textContent = pt.speed.toFixed(1);
        document.getElementById('hud-lap-time').textContent = formatTime(pt.time - firstLap.lap[0].time);
        document.getElementById('hud-lap-number').textContent = 'Lap ' + (firstLap.index + 1);
        if (currentPositionMarker) currentPositionMarker.setLatLng([pt.lat, pt.lon]);
      }
    }
  }
  updateChartCursors();
}
function updateChartCursors() {
  var laps = getSelectedLaps();
  if (laps.length === 0) return;
  ['chart-speed-dist', 'chart-speed-time'].forEach(function(chartId) {
    var el = document.getElementById(chartId);
    if (!el || !el.data || !el.data.data || el.data.data.length === 0) return;
    var cursorIdx = el.data.data.length - 1;
    var xVals = [], yVals = [];
    laps.forEach(function(item) {
      var lap = item.lap, index = item.index;
      var table = lookupTables[index];
      if (!table) return;
      var pt;
      if (chartId === 'chart-speed-dist') {
        var entry = binarySearch(table.distToTime, playbackState.currentValue, 'dist');
        pt = entry ? lap[entry.idx] : null;
      } else {
        var entry = binarySearch(table.timeToDist, playbackState.currentValue, 'time');
        pt = entry ? lap[entry.idx] : null;
      }
      if (pt) {
        xVals.push(chartId === 'chart-speed-dist' ? pt.lapDistance : pt.time - lap[0].time);
        yVals.push(pt.speed);
      }
    });
    Plotly.restyle(chartId, { x: [xVals], y: [yVals] }, [cursorIdx]);
  });
}
function getSector(pt, lap) {
  if (!lap || lap.length === 0 || !pt) return null;
  var maxDist = lap[lap.length-1].lapDistance;
  if (maxDist <= 0) return null;
  var ratio = pt.lapDistance / maxDist;
  if (ratio <= 1/3) return 1;
  if (ratio <= 2/3) return 2;
  return 3;
}
// ---- Playback Engine (Group I) ----
function playbackLoop() {
  if (!playbackState.isPlaying) return;
  var dt = Math.min((performance.now() - playbackState.lastFrameTime) / 1000, 0.1);
  playbackState.lastFrameTime = performance.now();
  if (playbackState.mode === 'time') {
    playbackState.currentValue += dt * playbackState.baseSpeed;
  } else {
    playbackState.currentValue += playbackState.distanceSimSpeed * playbackState.baseSpeed * dt;
  }
  if (playbackState.loopMode === 'ab' && playbackState.markerA != null && playbackState.markerB != null) {
    if (playbackState.currentValue >= playbackState.markerB) { playbackState.currentValue = playbackState.markerA; videoElements.forEach(function(v) { v.lastIndex = 0; }); }
  } else if (playbackState.currentValue > playbackState.maxValue) {
    playbackState.currentValue = 0; videoElements.forEach(function(v) { v.lastIndex = 0; });
  }
  syncVideosToStateTimeline(false);
  updateVideoPlaybackRates();
  playbackState.animFrameId = requestAnimationFrame(playbackLoop);
}
function startPlayback() {
  if (playbackState.isPlaying) return;
  if (playbackState.currentValue >= playbackState.maxValue) { playbackState.currentValue = 0; videoElements.forEach(function(v) { v.lastIndex = 0; }); }
  videoElements.forEach(function(v) { v.element.play().catch(function() {}); });
  playbackState.isPlaying = true;
  playbackState.lastFrameTime = performance.now();
  document.getElementById('play-btn').innerHTML = '<i class=\"ph ph-pause-fill text-xl\"></i>';
  document.getElementById('play-btn').setAttribute('aria-label', 'Pause');
  playbackState.animFrameId = requestAnimationFrame(playbackLoop);
}
function pausePlayback() {
  playbackState.isPlaying = false;
  if (playbackState.animFrameId) { cancelAnimationFrame(playbackState.animFrameId); playbackState.animFrameId = null; }
  document.getElementById('play-btn').innerHTML = '<i class=\"ph ph-play-fill text-xl\"></i>';
  document.getElementById('play-btn').setAttribute('aria-label', 'Play');
  videoElements.forEach(function(v) { try { v.element.pause(); } catch(e) {} });
}
function togglePlayback() {
  if (playbackState.isPlaying) pausePlayback(); else startPlayback();
}
function manualSeek(val) {
  playbackState.currentValue = Math.max(0, Math.min(val, playbackState.maxValue));
  videoElements.forEach(function(v) { v.lastIndex = 0; });
  syncVideosToStateTimeline(true);
  document.getElementById('main-scrubber').value = playbackState.currentValue;
}
function stepFrame(seconds) {
  pausePlayback();
  playbackState.currentValue = Math.max(0, Math.min(playbackState.currentValue + seconds, playbackState.maxValue));
  document.getElementById('main-scrubber').value = playbackState.currentValue;
  syncVideosToStateTimeline(true);
}
// ---- Playback Mode (Group J) ----
function setPlaybackMode(mode) {
  playbackState.mode = mode;
  var distBtn = document.getElementById('mode-dist');
  var timeBtn = document.getElementById('mode-time');
  distBtn.className = 'px-2.5 py-1 text-xs font-semibold rounded-md ' + (mode === 'distance' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300');
  timeBtn.className = 'px-2.5 py-1 text-xs font-semibold rounded-md ' + (mode === 'time' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300');
  pausePlayback();
  updateScrubberScalingBoundaries(getSelectedLaps());
  playbackState.currentValue = 0;
  videoElements.forEach(function(v) { v.lastIndex = 0; });
  syncVideosToStateTimeline(true);
}
// ---- Playback Bar (Group K) ----
function updateScrubberScalingBoundaries(lapsToRender) {
  if (!lapsToRender || lapsToRender.length === 0) return;
  var maxVal = 0;
  if (playbackState.mode === 'distance') {
    maxVal = Math.max.apply(null, lapsToRender.map(function(item) { return item.lap.maxDistance || 0; }));
  } else {
    maxVal = Math.max.apply(null, lapsToRender.map(function(item) { return item.lap.duration || 0; }));
  }
  if (maxVal <= 0) maxVal = 100;
  playbackState.maxValue = maxVal;
  document.getElementById('scrubber-total').textContent = playbackState.mode === 'distance' ? Math.round(maxVal) + ' m' : formatTime(maxVal);
  var scrubber = document.getElementById('main-scrubber');
  scrubber.max = maxVal;
  scrubber.value = playbackState.currentValue;
}
// ---- Statistics Panel ----
function toggleStatsPanel() {
  var body = document.getElementById('stats-body');
  var icon = document.getElementById('stats-toggle-icon');
  if (body.style.display === 'none') {
    body.style.display = ''; icon.className = 'ph ph-caret-down text-gray-400 transition-transform';
  } else {
    body.style.display = 'none'; icon.className = 'ph ph-caret-right text-gray-400 transition-transform';
  }
}
function updateStatisticsPanel() {
  var panel = document.getElementById('lap-statistics-panel');
  if (lapsData.length === 0) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  var tbody = document.getElementById('stats-body-content');
  tbody.innerHTML = '';
  var bestTime = Math.min.apply(null, lapsData.map(function(l) { return l.duration; }).filter(function(d) { return d > 0; }));
  var stats = lapsData.map(function(lap, i) {
    var speeds = lap.map(function(p) { return p.speed; }).filter(function(s) { return s > 0; });
    var avgSpeed = speeds.length > 0 ? speeds.reduce(function(a,b) { return a+b; }, 0) / speeds.length : 0;
    var maxSpeed = speeds.length > 0 ? Math.max.apply(null, speeds) : 0;
    var minSpeed = speeds.length > 0 ? Math.min.apply(null, speeds) : 0;
    var latG = computeLatG(lap);
    var maxLatG = latG.length > 0 ? Math.max.apply(null, latG.map(Math.abs)) : 0;
    return { lap: i+1, time: lap.duration, avgSpeed: avgSpeed, maxSpeed: maxSpeed, minSpeed: minSpeed, maxLatG: maxLatG, dist: lap.maxDistance, delta: lap.duration - bestTime, isBest: lap.duration === bestTime };
  });
  stats.sort(function(a, b) {
    var av, bv;
    if (statsSortKey === 'lap') { av = a.lap; bv = b.lap; }
    else if (statsSortKey === 'time') { av = a.time; bv = b.time; }
    else if (statsSortKey === 'avgSpeed') { av = a.avgSpeed; bv = b.avgSpeed; }
    else if (statsSortKey === 'maxSpeed') { av = a.maxSpeed; bv = b.maxSpeed; }
    else if (statsSortKey === 'dist') { av = a.dist; bv = b.dist; }
    else if (statsSortKey === 'delta') { av = a.delta; bv = b.delta; }
    else { av = a.lap; bv = b.lap; }
    return statsSortAsc ? av - bv : bv - av;
  });
  stats.forEach(function(s) {
    var tr = document.createElement('tr');
    tr.className = (s.isBest ? 'text-[#22c55e] font-semibold' : 'text-gray-700 dark:text-gray-300') + ' border-b border-gray-100 dark:border-gray-800';
    tr.innerHTML = '<td class=\"py-1 pr-2\">' + s.lap + '</td><td class=\"text-right py-1 px-2 font-mono\">' + formatTime(s.time) + '</td><td class=\"text-right py-1 px-2 font-mono\">' + s.avgSpeed.toFixed(1) + '</td><td class=\"text-right py-1 px-2 font-mono\">' + s.maxSpeed.toFixed(1) + '</td><td class=\"text-right py-1 px-2 font-mono\">' + s.dist.toFixed(0) + '</td><td class=\"text-right py-1 pl-2 font-mono ' + (s.delta > 0.01 ? 'text-[#ef4444]' : 'text-[#22c55e]') + '\">' + (s.isBest ? '\u2014' : '+' + s.delta.toFixed(3)) + '</td>';
    tbody.appendChild(tr);
  });
}
function sortStats(key) {
  if (statsSortKey === key) statsSortAsc = !statsSortAsc;
  else { statsSortKey = key; statsSortAsc = true; }
  updateStatisticsPanel();
}
// ---- Bookmarks (Section 13.15) ----
function addBookmark() {
  if (bookmarks.length >= 50) { showToast('Maximum 50 bookmarks reached.', 'warning'); return; }
  var laps = getSelectedLaps();
  if (laps.length === 0) return;
  var bm = { id: 'bm_' + Date.now(), name: 'BM ' + (bookmarks.length+1), time: playbackState.currentValue, distance: playbackState.currentValue, lapIndex: laps[0].index, note: '' };
  bookmarks.push(bm);
  renderBookmarks();
  showToast('Bookmark added at ' + (playbackState.mode === 'distance' ? Math.round(bm.distance) + 'm' : formatTime(bm.time)), 'success');
}
function renderBookmarks() {
  var list = document.getElementById('bookmarks-list');
  list.innerHTML = '';
  bookmarks.forEach(function(bm, i) {
    var item = document.createElement('div');
    item.className = 'flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors text-xs';
    item.innerHTML = '<i class=\"ph ph-bookmark-simple-fill text-[#ef4444] text-sm\"></i><span class=\"font-semibold text-gray-700 dark:text-gray-300 flex-1 truncate\">' + bm.name + '</span><span class=\"font-mono text-gray-500\">' + (playbackState.mode === 'distance' ? Math.round(bm.distance)+'m' : formatTime(bm.time)) + '</span><button class=\"text-gray-400 hover:text-[#ef4444] p-0.5 bookmark-del\" data-idx=\"' + i + '\">\u00d7</button>';
    item.onclick = function(e) { if (!e.target.classList.contains('bookmark-del')) manualSeek(bm.distance); };
    item.querySelector('.bookmark-del').onclick = function(e) { e.stopPropagation(); removeBookmark(i); };
    list.appendChild(item);
  });
}
function removeBookmark(idx) {
  bookmarks.splice(idx, 1);
  renderBookmarks();
}
// ---- New Session ----
function resetAllData() {
  pausePlayback();
  rawData = []; lapsData = []; selectedLapIndices = new Set(['all']); gatePoints = []; isDrawingGate = false; bookmarks = []; referenceLapIndex = null;
  if (gateLayer) { map.removeLayer(gateLayer); gateLayer = null; }
  if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
  if (currentPositionMarker) { map.removeLayer(currentPositionMarker); currentPositionMarker = null; }
  Object.values(lapMarkers).forEach(function(m) { map.removeLayer(m); }); lapMarkers = {};
  if (polylineLayerGroup) polylineLayerGroup.clearLayers();
  if (videoBlobUrl) { URL.revokeObjectURL(videoBlobUrl); videoBlobUrl = null; }
  videoElements = []; telemetryCsvText = ''; playbackState.currentValue = 0; playbackState.maxValue = 0;
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('dashboard-content').classList.add('hidden');
  document.getElementById('app-sidebar').classList.add('hidden');
  document.getElementById('playback-bar').classList.add('hidden');
  document.getElementById('file-info').classList.add('hidden');
  document.getElementById('video-section').classList.add('hidden');
  document.getElementById('rh-video').classList.add('hidden');
  document.getElementById('download-csv-btn').classList.add('hidden');
  document.getElementById('draw-gate-btn').disabled = true;
  document.getElementById('gate-mode-badge').classList.add('hidden');
  document.getElementById('lap-statistics-panel').classList.add('hidden');
  document.getElementById('bookmarks-panel').classList.add('hidden');
  document.getElementById('live-telemetry-panel').classList.add('hidden');
  document.getElementById('primary-video').src = '';
  showToast('Session cleared.', 'info', 5000);
}
function closeMobileSidebar() {
  document.getElementById('sidebar-overlay').classList.add('hidden');
  document.getElementById('app-sidebar').classList.remove('fixed', 'inset-y-0', 'left-0', 'z-50', 'w-[85vw]', 'max-w-[320px]');
}
function openMobileSidebar() {
  document.getElementById('sidebar-overlay').classList.remove('hidden');
  document.getElementById('app-sidebar').classList.add('fixed', 'inset-y-0', 'left-0', 'z-50', 'w-[85vw]', 'max-w-[320px]');
}
// ---- LayoutManager (Section 13.16) ----
var layoutManager = null;
function initLayoutManager() {
  layoutManager = new LayoutManager();
}
function LayoutManager() {
  this.activeHandle = null;
  this.startPos = null;
  this.startSizes = null;
  this.init();
}
LayoutManager.prototype.init = function() {
  var self = this;
  document.querySelectorAll('.resize-handle').forEach(function(handle) {
    handle.addEventListener('mousedown', function(e) { self.onDragStart(e, handle); });
    handle.addEventListener('touchstart', function(e) { self.onDragStart(e, handle); }, { passive: true });
  });
  document.addEventListener('mousemove', function(e) { self.onDragMove(e); });
  document.addEventListener('mouseup', function(e) { self.onDragEnd(e); });
  document.addEventListener('touchmove', function(e) { self.onDragMove(e); }, { passive: false });
  document.addEventListener('touchend', function(e) { self.onDragEnd(e); });
  this.restoreLayout();
  this.restoreHidden();
};
LayoutManager.prototype.onDragStart = function(e, handle) {
  e.preventDefault();
  this.activeHandle = handle;
  handle.classList.add('is-dragging');
  var isVert = handle.dataset.orientation === 'vertical';
  document.body.style.cursor = isVert ? 'col-resize' : 'row-resize';
  document.body.style.userSelect = 'none';
  var pos = e.type === 'touchstart' ? e.touches[0] : e;
  this.startPos = { x: pos.clientX, y: pos.clientY };
  var ids = handle.dataset.panels.split(',');
  var before = document.getElementById(ids[0]);
  var after = document.getElementById(ids[1]);
  if (!before || !after) return;
  this.startSizes = {
    before: isVert ? before.offsetWidth : before.offsetHeight,
    after: isVert ? after.offsetWidth : after.offsetHeight,
    total: (isVert ? before.offsetWidth : before.offsetHeight) + (isVert ? after.offsetWidth : after.offsetHeight) + handle.offsetWidth
  };
};
LayoutManager.prototype.onDragMove = function(e) {
  if (!this.activeHandle || !this.startSizes) return;
  e.preventDefault();
  var pos = e.type === 'touchmove' ? e.touches[0] : e;
  var isVert = this.activeHandle.dataset.orientation === 'vertical';
  var delta = isVert ? pos.clientX - this.startPos.x : pos.clientY - this.startPos.y;
  var ids = this.activeHandle.dataset.panels.split(',');
  var before = document.getElementById(ids[0]);
  var after = document.getElementById(ids[1]);
  if (!before || !after) return;
  var minBefore = ids[0] === 'app-sidebar' ? 160 : 300;
  var minAfter = ids[1] === 'video-section' ? 120 : 300;
  var newBefore = Math.max(minBefore, Math.min(this.startSizes.total - minAfter, this.startSizes.before + delta));
  var newAfter = this.startSizes.total - newBefore - this.activeHandle.offsetWidth;
  if (newAfter < minAfter) { newAfter = minAfter; newBefore = this.startSizes.total - newAfter - this.activeHandle.offsetWidth; }
  before.style.flexBasis = newBefore + 'px';
  after.style.flex = '1 1 0';
  window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: ids[0] } }));
  window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: ids[1] } }));
};
LayoutManager.prototype.onDragEnd = function() {
  if (!this.activeHandle) return;
  this.activeHandle.classList.remove('is-dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  this.saveLayout();
  this.activeHandle = null; this.startSizes = null;
};
LayoutManager.prototype.saveLayout = function() {
  var layout = {};
  document.querySelectorAll('.resize-handle').forEach(function(h) {
    var id = h.dataset.panels.split(',')[0];
    var el = document.getElementById(id);
    if (el && el.style.flexBasis) layout[id] = el.style.flexBasis;
  });
  localStorage.setItem('kartdata-layout', JSON.stringify(layout));
};
LayoutManager.prototype.restoreLayout = function() {
  try {
    var layout = JSON.parse(localStorage.getItem('kartdata-layout') || '{}');
    Object.keys(layout).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.flexBasis = layout[id];
    });
  } catch(e) {}
};
LayoutManager.prototype.restoreHidden = function() {
  try {
    var hidden = JSON.parse(localStorage.getItem('kartdata-hidden') || '{}');
    Object.keys(hidden).forEach(function(id) {
      if (hidden[id]) {
        var el = document.getElementById(id);
        if (el) el.classList.add('panel-hidden');
      }
    });
  } catch(e) {}
};
// ---- Panel Toggle & Settings ----
function togglePanel(panelId) {
  var panel = document.getElementById(panelId);
  if (!panel) return;
  var isHidden = panel.classList.contains('panel-hidden');
  if (isHidden) { panel.classList.remove('panel-hidden'); }
  else { panel.classList.add('panel-hidden'); }
  window.dispatchEvent(new CustomEvent('panelresize', { detail: { panel: panelId } }));
  var hiddenState = JSON.parse(localStorage.getItem('kartdata-hidden') || '{}');
  hiddenState[panelId] = !isHidden;
  localStorage.setItem('kartdata-hidden', JSON.stringify(hiddenState));
}
function openSettings() {
  document.getElementById('settings-drawer').classList.add('open');
  document.getElementById('settings-default-speed').value = playbackState.baseSpeed;
  document.getElementById('settings-default-mode').value = playbackState.mode;
  document.getElementById('settings-default-smoothing').value = currentSmoothing;
  document.getElementById('settings-map-tiles').value = isDarkMode ? 'dark' : 'light';
  document.getElementById('settings-chart-line-width').value = chartLineWidth;
  document.getElementById('settings-hud-always-on').checked = hudVisible;
  document.getElementById('settings-auto-loop').checked = playbackState.loopEnabled;
}
function closeSettings() {
  document.getElementById('settings-drawer').classList.remove('open');
  playbackState.baseSpeed = parseFloat(document.getElementById('settings-default-speed').value);
  playbackState.mode = document.getElementById('settings-default-mode').value;
  currentSmoothing = parseInt(document.getElementById('settings-default-smoothing').value);
  document.getElementById('smoothing-slider').value = currentSmoothing;
  document.getElementById('smoothing-value').textContent = currentSmoothing;
  chartLineWidth = parseFloat(document.getElementById('settings-chart-line-width').value);
  hudVisible = document.getElementById('settings-hud-always-on').checked;
  playbackState.loopEnabled = document.getElementById('settings-auto-loop').checked;
  if (!hudVisible) document.getElementById('video-hud').classList.add('hidden');
  else document.getElementById('video-hud').classList.remove('hidden');
  saveSettings();
  if (lapsData.length > 0) updateVisualization();
}
function toggleHud() {
  hudVisible = !hudVisible;
  document.getElementById('video-hud').classList.toggle('hidden');
}
// ---- Drag & Drop ----
function setupDragDrop() {
  var dragCounter = 0;
  document.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    document.body.classList.add('drag-over');
    dragCounter++;
  });
  document.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) { document.body.classList.remove('drag-over'); dragCounter = 0; }
  });
  document.addEventListener('drop', function(e) {
    e.preventDefault();
    document.body.classList.remove('drag-over');
    dragCounter = 0;
    var files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.name.endsWith('.csv')) {
        showToast('Loaded ' + file.name, 'success');
        var input = document.getElementById('csv-upload');
        var dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        handleFileUpload({ target: input });
      } else if (file.type.startsWith('video/')) {
        showToast('Processing ' + file.name + '...', 'info');
        var input = document.getElementById('video-upload');
        var dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        handleVideoUpload({ target: input });
      } else {
        showToast('Unsupported file type: ' + file.name, 'warning');
      }
    }
  });
}
// ---- Keyboard Shortcuts (Appendix B) ----
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    var tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].indexOf(tag) >= 0) return;
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlayback(); break;
      case 'ArrowLeft': e.preventDefault(); stepFrame(e.shiftKey ? -0.5 : -0.04); break;
      case 'ArrowRight': e.preventDefault(); stepFrame(e.shiftKey ? 0.5 : 0.04); break;
      case 'Home': e.preventDefault(); manualSeek(0); break;
      case 'End': e.preventDefault(); manualSeek(playbackState.maxValue); break;
      case 'f': case 'F': e.preventDefault(); document.getElementById('fullscreen-btn').click(); break;
      case 's': case 'S': e.preventDefault(); openMobileSidebar(); break;
      case 'm': case 'M': e.shiftKey ? document.querySelectorAll('video').forEach(function(v) { v.muted = !v.muted; }) : togglePanel('map-panel'); break;
      case 'c': case 'C': e.preventDefault(); togglePanel('charts-column'); break;
      case 'v': case 'V': e.preventDefault(); togglePanel('video-section'); break;
      case 'r': case 'R': e.preventDefault(); resetGate(); break;
      case 'Escape': e.preventDefault();
        if (isDrawingGate) { resetGate(); showToast('Gate drawing cancelled.', 'info'); }
        else if (document.getElementById('settings-drawer').classList.contains('open')) closeSettings();
        else if (!document.getElementById('sidebar-overlay').classList.contains('hidden')) closeMobileSidebar();
        else if (document.fullscreenElement) document.exitFullscreen();
        break;
      case 'b': case 'B': e.preventDefault(); addBookmark(); break;
      case '1': e.preventDefault(); playbackState.baseSpeed = 0.25; document.getElementById('playback-speed').value = '0.25'; updateVideoPlaybackRates(); break;
      case '2': e.preventDefault(); playbackState.baseSpeed = 0.5; document.getElementById('playback-speed').value = '0.5'; updateVideoPlaybackRates(); break;
      case '3': e.preventDefault(); playbackState.baseSpeed = 1.0; document.getElementById('playback-speed').value = '1'; updateVideoPlaybackRates(); break;
      case '4': e.preventDefault(); playbackState.baseSpeed = 2.0; document.getElementById('playback-speed').value = '2'; updateVideoPlaybackRates(); break;
      case 'd': case 'D': e.preventDefault(); setPlaybackMode('distance'); break;
      case 't': case 'T': e.preventDefault(); setPlaybackMode('time'); break;
    }
  });
}
// ---- Event Listeners Wiring & Initialization (Section 7, Group B) ----
function setupEventListeners() {
  document.getElementById('csv-upload').addEventListener('change', handleFileUpload);
  document.getElementById('video-upload').addEventListener('change', handleVideoUpload);
  document.getElementById('extract-telemetry-toggle').addEventListener('change', function(e) { extractMetadataEnabled = e.target.checked; });
  document.getElementById('smoothing-slider').addEventListener('input', function(e) {
    currentSmoothing = parseInt(e.target.value);
    document.getElementById('smoothing-value').textContent = currentSmoothing;
    if (lapsData.length > 0) renderCharts(getSelectedLaps());
  });
  document.getElementById('sort-laps-toggle').addEventListener('change', function(e) { sortLapsByTime = e.target.checked; renderLapList(); });
  document.getElementById('draw-gate-btn').addEventListener('click', toggleGateDrawingMode);
  document.getElementById('clear-gate-btn').addEventListener('click', resetGate);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('play-btn').addEventListener('click', togglePlayback);
  document.getElementById('mode-dist').addEventListener('click', function() { setPlaybackMode('distance'); });
  document.getElementById('mode-time').addEventListener('click', function() { setPlaybackMode('time'); });
  document.getElementById('playback-speed').addEventListener('change', function(e) { playbackState.baseSpeed = parseFloat(e.target.value); updateVideoPlaybackRates(); });
  document.getElementById('prev-frame-btn').addEventListener('click', function() { stepFrame(-0.04); });
  document.getElementById('next-frame-btn').addEventListener('click', function() { stepFrame(0.04); });
  document.getElementById('main-scrubber').addEventListener('input', function(e) { manualSeek(parseFloat(e.target.value)); });
  document.getElementById('main-scrubber').addEventListener('mousedown', function() { pausePlayback(); });
  document.getElementById('video-size-slider').addEventListener('input', function(e) {
    currentVideoSize = parseInt(e.target.value);
    var wrapper = document.getElementById('primary-video-wrapper');
    wrapper.style.width = currentVideoSize + 'px';
    wrapper.style.height = Math.round(currentVideoSize * 9 / 16) + 'px';
  });
  document.getElementById('fullscreen-btn').addEventListener('click', function() {
    var mapEl = document.getElementById('map');
    if (!document.fullscreenElement) { mapEl.requestFullscreen(); }
    else { document.exitFullscreen(); }
  });
  document.getElementById('new-session-btn').addEventListener('click', resetAllData);
  document.getElementById('sidebar-toggle-btn').addEventListener('click', function() {
    document.body.classList.toggle('sidebar-collapsed');
  });
  document.getElementById('toggle-map-btn').addEventListener('click', function() { togglePanel('map-panel'); });
  document.getElementById('toggle-charts-btn').addEventListener('click', function() { togglePanel('charts-column'); });
  document.getElementById('toggle-video-btn').addEventListener('click', function() { togglePanel('video-section'); });
  document.getElementById('ab-loop-a-btn').addEventListener('click', function() {
    playbackState.markerA = playbackState.currentValue;
    document.getElementById('marker-a-indicator').classList.remove('hidden');
    document.getElementById('scrubber-markers').classList.remove('hidden');
    showToast('Marker A set at ' + (playbackState.mode === 'distance' ? Math.round(playbackState.markerA) + 'm' : formatTime(playbackState.markerA)), 'info');
  });
  document.getElementById('ab-loop-b-btn').addEventListener('click', function() {
    playbackState.markerB = playbackState.currentValue;
    document.getElementById('marker-b-indicator').classList.remove('hidden');
    document.getElementById('scrubber-markers').classList.remove('hidden');
    showToast('Marker B set at ' + (playbackState.mode === 'distance' ? Math.round(playbackState.markerB) + 'm' : formatTime(playbackState.markerB)), 'info');
  });
  document.getElementById('ab-loop-toggle').addEventListener('click', function() {
    if (playbackState.loopMode === 'ab') { playbackState.loopMode = 'full'; this.style.background = ''; showToast('Loop mode: Full', 'info'); }
    else { playbackState.loopMode = 'ab'; this.style.background = '#ef4444'; this.style.color = 'white'; showToast('Loop mode: A-B', 'info'); }
  });
  // GPS coordinate display on map mousemove
  map.on('mousemove', function(e) {
    document.getElementById('gps-coords').classList.remove('hidden');
    document.getElementById('gps-coords').innerHTML = 'Lat: ' + e.latlng.lat.toFixed(6) + '&nbsp; Lon: ' + e.latlng.lng.toFixed(6);
  });
  // Visibility detection - auto pause when tab hidden
  document.addEventListener('visibilitychange', function() {
    if (document.hidden && playbackState.isPlaying) pausePlayback();
  });
  // Window resize
  window.addEventListener('resize', function() {
    if (lapsData.length > 0) {
      setTimeout(function() {
        if (map) map.invalidateSize();
        document.querySelectorAll('[id^=\"chart-\"]').forEach(function(el) { if (el.data) Plotly.Plots.resize(el); });
      }, 100);
    }
  });
  // Panel resize handler
  window.addEventListener('panelresize', function(e) {
    setTimeout(function() {
      if (e.detail.panel === 'map-panel' && map) map.invalidateSize();
      if (e.detail.panel === 'charts-column') {
        document.querySelectorAll('[id^=\"chart-\"]').forEach(function(el) { if (el.data) Plotly.Plots.resize(el); });
      }
    }, 50);
  });
  // Chart type toggles in sidebar
  document.querySelectorAll('.chart-type-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var chart = this.dataset.chart;
      extraChartsVisible[chart] = !extraChartsVisible[chart];
      this.classList.toggle('bg-[#ef4444]', extraChartsVisible[chart]);
      this.classList.toggle('text-white', extraChartsVisible[chart]);
      this.classList.toggle('border-[#ef4444]', extraChartsVisible[chart]);
      if (!extraChartsVisible[chart]) {
        document.getElementById('chart-' + chart + '-container').classList.add('hidden');
      }
      if (lapsData.length > 0) updateVisualization();
    });
  });
}
// ---- Init (B1, B3) ----
function initMap() {
  map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, attribution: '&copy; <a href=\"https://www.openstreetmap.org/copyright\">OSM</a> &copy; <a href=\"https://carto.com/\">CARTO</a>'
  }).addTo(map);
  polylineLayerGroup = L.layerGroup().addTo(map);
  map.on('mousemove', handleMapMouseMove);
  map.on('click', handleMapClick);
}
function init() {
  loadSettings();
  initMap();
  setupEventListeners();
  setupKeyboardShortcuts();
  setupDragDrop();
  initLayoutManager();
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    if (!isDarkMode) toggleTheme();
  }
  // Apply settings
  document.getElementById('smoothing-slider').value = currentSmoothing;
  document.getElementById('smoothing-value').textContent = currentSmoothing;
}
document.addEventListener('DOMContentLoaded', init);
