
// ===================== STATE =====================
let rawData = [];
let lapsData = [];
let selectedLapIndices = new Set(['all']);
let isDarkMode = document.documentElement.classList.contains('dark');
let filename = '';
let map = null;
let tileLayer = null;
let polylineLayerGroup = null;
let currentSmoothing = 0;
let isRelayouting = false;
let currentPositionMarker = null;

let lapSortKey = 'lap';
let lapSortOrder = 'asc';
let maxVideoCount = 4;
let referenceLapId = -1;
let bestSectors = { s1: Infinity, s2: Infinity, s3: Infinity };
let playbackState = { isPlaying: false, mode: 'time', currentValue: 0, maxValue: 0, animFrameId: null, lastFrameTime: 0, baseSpeed: 1.0, distanceSimSpeed: 25.0 };
let videoBlobUrl = null;
let videoElements = [];
let currentVideoSize = 320;
let gatePoints = [];
let gateLayer = null;
let ghostLayer = null;
let isDrawingGate = false;
let lapMarkers = {};
let toastIdCounter = 0;
let visibleToasts = [];
let undoState = null;
let gateUndoState = null;
let speedHeatmapActive = false;
let sectorLines = { s1: null, s2: null, s3: null };
let sectorPoints = { s1: [], s2: [], s3: [] };
let drawingSector = null;
let telemetryCsvText = '';
let telemetryDownloadName = 'telemetry.csv';
let telemetrySource = null;
let extractMetadataEnabled = true;
let isUploadingVideo = false;

const COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
    '#10b981', '#f43f5e', '#8b5cf6', '#d946ef', '#14b8a6', '#eab308'
];

// ===================== UTILITIES =====================
function deg2rad(deg) { return deg * Math.PI / 180; }

function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '--:--.---';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const whole = Math.floor(secs);
    const frac = Math.floor((secs - whole) * 1000);
    return `${mins}:${String(whole).padStart(2, '0')}.${String(frac).padStart(3, '0')}`;
}

function smoothData(data, windowSize) {
    if (windowSize <= 0) return data.slice();
    return data.map((_, i) => {
        let s = Math.max(0, i - windowSize), e = Math.min(data.length - 1, i + windowSize), sum = 0, c = 0;
        for (let j = s; j <= e; j++) { sum += data[j]; c++; }
        return sum / c;
    });
}

function binarySearch(arr, target, key) {
    if (!arr || !arr.length) return null;
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m][key] < target) lo = m + 1; else hi = m; }
    return arr[lo] || arr[arr.length - 1];
}

function intersects(a, b, c, d, p, q, r, s) {
    let det = (c - a) * (s - q) - (r - p) * (d - b);
    if (det === 0) return false;
    let lambda = ((s - q) * (r - a) + (p - r) * (s - b)) / det;
    let gamma = ((b - d) * (r - a) + (c - a) * (s - b)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

// ===================== TOAST =====================
function showToast(type, message, options) {
    options = options || {};
    const id = ++toastIdCounter;
    const tc = { success: { color: '#22c55e', icon: 'check-circle', dd: 4000 }, error: { color: '#ef4444', icon: 'x-circle', dd: 8000 }, warning: { color: '#eab308', icon: 'warning', dd: 8000 }, info: { color: '#3b82f6', icon: 'info', dd: 4000 } };
    const c = tc[type] || tc.info;
    const dur = options.duration || c.dd;
    while (visibleToasts.length >= 3) { const o = visibleToasts.shift(); dismissToast(o.id); }
    const container = document.getElementById('toast-container');
    if (!container) return id;
    const el = document.createElement('div');
    el.className = 'toast toast-' + type + ' pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 shadow-lg mb-0 max-w-sm animate-slide-in';
    el.style.borderLeft = '4px solid ' + c.color;
    el.dataset.toastId = id;
    const undoHtml = options.undoAction ? '<button class="toast-undo mt-1.5 text-xs font-bold text-brand-500 hover:text-brand-400 transition-colors" data-action="undo">[Undo]</button>' : '';
    el.innerHTML = '<i class="ph-fill ph-' + c.icon + ' text-lg flex-shrink-0 mt-0.5" style="color:' + c.color + '"></i><div class="flex-1 min-w-0"><p class="text-sm font-medium text-gray-200 break-words">' + message + '</p>' + undoHtml + '</div><button class="toast-dismiss flex-shrink-0 ml-2 text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">&times;</button>';
    container.appendChild(el);
    el.querySelector('.toast-dismiss').addEventListener('click', function() { dismissToast(id); });
    if (options.undoAction) el.querySelector('.toast-undo').addEventListener('click', function() { options.undoAction(); dismissToast(id); });
    var dt = setTimeout(function() { dismissToast(id); }, dur);
    visibleToasts.push({ id, type, message, el, dismissTimer: dt });
    return id;
}

function dismissToast(id) {
    var idx = -1;
    for (var i = 0; i < visibleToasts.length; i++) { if (visibleToasts[i].id === id) { idx = i; break; } }
    if (idx === -1) return;
    var r = visibleToasts[idx];
    clearTimeout(r.dismissTimer);
    r.el.style.opacity = '0';
    r.el.style.transform = 'translateX(100%)';
    setTimeout(function() { r.el.remove(); visibleToasts.splice(idx, 1); }, 300);
}

function updateToastProgress(id, percent) {
    for (var i = 0; i < visibleToasts.length; i++) {
        if (visibleToasts[i].id === id) {
            var bar = visibleToasts[i].el.querySelector('.toast-progress div');
            if (bar) bar.style.width = percent + '%';
            break;
        }
    }
}

// ===================== SESSION MANAGEMENT =====================
function resetAllData() {
    undoState = { rawData: rawData.slice(), lapsData: lapsData.slice(), videoBlobUrl: videoBlobUrl, videoElements: videoElements.slice(), telemetryCsvText: telemetryCsvText, telemetryDownloadName: telemetryDownloadName, telemetrySource: telemetrySource };
    if (videoBlobUrl) { URL.revokeObjectURL(videoBlobUrl); videoBlobUrl = null; }
    for (var i = 0; i < videoElements.length; i++) { var v = videoElements[i]; v.element.pause(); v.element.removeAttribute('src'); v.element.load(); }
    videoElements = []; rawData = []; lapsData = []; selectedLapIndices = new Set(['all']);
    telemetryCsvText = ''; telemetryDownloadName = 'telemetry.csv'; telemetrySource = null;
    gatePoints = []; isDrawingGate = false; drawingSector = null;
    sectorPoints = { s1: [], s2: [], s3: [] }; sectorLines = { s1: null, s2: null, s3: null };
    if (gateLayer && map) { map.removeLayer(gateLayer); gateLayer = null; }
    if (ghostLayer && map) { map.removeLayer(ghostLayer); ghostLayer = null; }
    clearSectorLines();
    playbackState.currentValue = 0; playbackState.isPlaying = false;
    cancelAnimationFrame(playbackState.animFrameId);
    if (currentPositionMarker && map) { map.removeLayer(currentPositionMarker); currentPositionMarker = null; }
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('app-sidebar').classList.add('hidden');
    document.getElementById('dashboard-content').classList.add('hidden');
    document.getElementById('file-info').classList.add('hidden');
    document.getElementById('file-info').classList.remove('flex');
    document.getElementById('playback-bar').classList.add('hidden');
    document.getElementById('video-section').classList.add('hidden');
    document.getElementById('new-session-btn').classList.add('hidden');
    document.getElementById('download-csv-btn').classList.add('hidden');
    document.getElementById('filename-display').textContent = '';
    document.getElementById('lap-count-display').textContent = '';
    document.getElementById('csv-upload').value = '';
    document.getElementById('lap-tower-body').innerHTML = '';
    showToast('info', 'Session cleared.', { undoAction: restoreSession });
    setTimeout(function() { undoState = null; }, 5000);
}

function restoreSession() {
    if (!undoState) return;
    rawData = undoState.rawData; videoBlobUrl = undoState.videoBlobUrl;
    telemetryCsvText = undoState.telemetryCsvText; telemetryDownloadName = undoState.telemetryDownloadName; telemetrySource = undoState.telemetrySource;
    if (rawData.length > 0) { calculateDefaultSingleLap(); showToast('success', 'Session restored.'); }
    undoState = null;
}

function newSession() { resetAllData(); showToast('info', 'New session started.'); }

// ===================== CSV PROCESSING =====================
function handleFileUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    filename = file.name;
    if (file.size > 50 * 1024 * 1024) showToast('warning', 'File is very large (>50MB). Processing may be slow.');
    if (videoBlobUrl) { URL.revokeObjectURL(videoBlobUrl); videoBlobUrl = null; }
    videoElements = [];
    document.getElementById('video-grid').innerHTML = '<div id="video-placeholder" class="text-gray-600 text-xs text-center w-full">Upload a video to see lap-synced playback</div>';
    var vs = document.getElementById('video-section');
    vs.classList.add('hidden');
    var reader = new FileReader();
    reader.onload = function(e) {
        var text = e.target.result;
        Papa.parse(text, {
            header: true, dynamicTyping: true, skipEmptyLines: true,
            complete: function(results) {
                if (results.errors.length > 0) showToast('warning', 'CSV parsed with ' + results.errors.length + ' errors.');
                processIncomingCSV(results.data);
                showToast('success', 'Loaded ' + results.data.length + ' data points.');
                telemetryCsvText = text;
                telemetryDownloadName = filename.replace(/\.[^/.]+$/, '') + '_Telemetry.csv';
                document.getElementById('download-csv-btn').classList.remove('hidden');
            },
            error: function(err) { showToast('error', 'CSV parsing failed: ' + err.message); }
        });
    };
    reader.readAsText(file);
    event.target.value = '';
}

function processIncomingCSV(data) {
    if (!data || data.length === 0) return;
    if (gateLayer) { map.removeLayer(gateLayer); gateLayer = null; }
    if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
    gatePoints = []; isDrawingGate = false; drawingSector = null;
    sectorPoints = { s1: [], s2: [], s3: [] }; clearSectorLines();
    var first = data[0], keys = Object.keys(first);
    var latKey = keys.find(function(k) { return /lat/i.test(k); });
    var lonKey = keys.find(function(k) { return /lon/i.test(k) || /long/i.test(k); });
    var speedKey = keys.find(function(k) { return /2D/i.test(k) || /speed/i.test(k) || /3D/i.test(k); });
    var timeKey = keys.find(function(k) { return /cts/i.test(k) || /date/i.test(k) || /time/i.test(k); });
    if (!latKey || !lonKey) { showToast('warning', 'No GPS data found. Check column names.'); return; }
    var clean = [];
    var startTime = null, prevLat = null, prevLon = null, cumulativeDist = 0;
    for (var idx = 0; idx < data.length; idx++) {
        var row = data[idx];
        var lat = parseFloat(row[latKey]), lon = parseFloat(row[lonKey]);
        if (isNaN(lat) || isNaN(lon)) continue;
        var speed = 0;
        if (speedKey) { var raw = parseFloat(row[speedKey] || 0); var sv = raw * 3.6; if (row[speedKey] && row[speedKey].toString().includes('km/h')) sv = parseFloat(row[speedKey]); speed = sv; }
        var timestamp = 0;
        if (row[timeKey]) {
            if (!isNaN(row[timeKey]) && row[timeKey] > 100000) { if (startTime === null) startTime = row[timeKey]; timestamp = (row[timeKey] - startTime) / 1000; }
            else { var t = new Date(row[timeKey]).getTime(); if (!isNaN(t)) { if (startTime === null) startTime = t; timestamp = (t - startTime) / 1000; } else timestamp = idx * 0.1; }
        } else timestamp = idx * 0.1;
        if (prevLat !== null && prevLon !== null) cumulativeDist += getDistanceFromLatLonInM(prevLat, prevLon, lat, lon);
        prevLat = lat; prevLon = lon;
        var speedMS = 0;
        if (speedKey) { speedMS = parseFloat(row[speedKey] || 0); if (row[speedKey] && row[speedKey].toString().includes('km/h')) speedMS /= 3.6; }
        clean.push({ index: idx, lat, lon, speed, speedMS, time: timestamp, totalDistance: cumulativeDist, rowId: idx, alt: parseFloat(row['GPS (Alt.) [m]']) || parseFloat(row['alt']) || undefined });
    }
    if (clean.length === 0) { showToast('warning', 'All GPS values are invalid.'); return; }
    rawData = clean;
    calculateDefaultSingleLap();
}

function calculateDefaultSingleLap() {
    if (rawData.length === 0) return;
    var first = rawData[0], last = rawData[rawData.length - 1];
    var loopTrace = rawData.map(function(p) { return Object.assign({}, p, { lap: 1, lapDistance: p.totalDistance }); });
    loopTrace.duration = last.time - first.time;
    loopTrace.maxDistance = last.totalDistance;
    loopTrace.sectors = computeSectors(loopTrace);
    lapsData = [loopTrace];
    selectedLapIndices = new Set(['all']);
    buildLapLookups();
    autoSelectReferenceLap();
    computeBestSectors();
    updateUIState();
    updateVisualization();
}

// ===================== LAP SPLITTING =====================
function calculateLapsWithGate() {
    if (gatePoints.length < 2 || rawData.length === 0) return;
    var gLng1 = gatePoints[0].lng, gLat1 = gatePoints[0].lat;
    var gLng2 = gatePoints[1].lng, gLat2 = gatePoints[1].lat;
    var out = [];
    var last = 0;
    for (var i = 1; i < rawData.length; i++) {
        var a = rawData[i - 1], b = rawData[i];
        if (intersects(a.lon, a.lat, b.lon, b.lat, gLng1, gLat1, gLng2, gLat2)) {
            if (i - last > 50) { out.push(rawData.slice(last, i + 1)); last = i; }
        }
    }
    if (rawData.length - last > 10) out.push(rawData.slice(last));
    lapsData = out.map(function(pts, idx) {
        if (!pts.length) return null;
        var bd = pts[0].totalDistance, bt = pts[0].time;
        var n = pts.map(function(p) { return Object.assign({}, p, { lap: idx + 1, lapDistance: p.totalDistance - bd }); });
        n.duration = pts[pts.length - 1].time - bt;
        n.maxDistance = pts[pts.length - 1].totalDistance - bd;
        n.sectors = computeSectors(n);
        return n;
    }).filter(function(l) { return l; });
    selectedLapIndices = new Set(['all']);
    buildLapLookups();
    autoSelectReferenceLap();
    computeBestSectors();
    updateUIState();
    updateVisualization();
    renderDraggableGateEndpoints();
}

// ===================== SECTORS =====================
function computeSectors(lap) {
    if (!lap || lap.length < 3) return null;
    var md = lap.maxDistance; if (md <= 0) return null;
    var t33 = md * 0.33, t66 = md * 0.66;
    var i33 = lap.length - 1, i66 = lap.length - 1;
    for (var i = 0; i < lap.length; i++) {
        if (lap[i].lapDistance >= t33 && i33 === lap.length - 1) i33 = i;
        if (lap[i].lapDistance >= t66 && i66 === lap.length - 1) i66 = i;
    }
    i33 = Math.max(1, Math.min(i33, lap.length - 1));
    i66 = Math.max(i33 + 1, Math.min(i66, lap.length - 1));
    return [
        { startIndex: 0, endIndex: i33, time: lap[i33].time - lap[0].time, distance: lap[i33].lapDistance - lap[0].lapDistance },
        { startIndex: i33, endIndex: i66, time: lap[i66].time - lap[i33].time, distance: lap[i66].lapDistance - lap[i33].lapDistance },
        { startIndex: i66, endIndex: lap.length - 1, time: lap[lap.length - 1].time - lap[i66].time, distance: lap[lap.length - 1].lapDistance - lap[i66].lapDistance }
    ];
}

function computeBestSectors() {
    bestSectors = { s1: Infinity, s2: Infinity, s3: Infinity };
    for (var i = 0; i < lapsData.length; i++) {
        var l = lapsData[i]; if (!l.sectors) continue;
        if (l.sectors[0] && l.sectors[0].time > 0 && l.sectors[0].time < bestSectors.s1) bestSectors.s1 = l.sectors[0].time;
        if (l.sectors[1] && l.sectors[1].time > 0 && l.sectors[1].time < bestSectors.s2) bestSectors.s2 = l.sectors[1].time;
        if (l.sectors[2] && l.sectors[2].time > 0 && l.sectors[2].time < bestSectors.s3) bestSectors.s3 = l.sectors[2].time;
    }
}

// ===================== REFERENCE LAP =====================
function autoSelectReferenceLap() {
    if (!lapsData || !lapsData.length) return;
    var fi = 0, ft = Infinity;
    for (var i = 0; i < lapsData.length; i++) { var d = lapsData[i].duration || 0; if (d > 0 && d < ft) { ft = d; fi = i; } }
    referenceLapId = ft === Infinity ? 0 : fi;
}

function findClosestByDistance(lap, target) {
    var c = lap[0], md = Infinity;
    for (var i = 0; i < lap.length; i++) { var d = Math.abs(lap[i].lapDistance - target); if (d < md) { md = d; c = lap[i]; } }
    return c;
}

// ===================== LAP LOOKUPS =====================
function buildLapLookups() {
    for (var li = 0; li < lapsData.length; li++) {
        var lap = lapsData[li];
        var dl = [], tl = [];
        for (var i = 0; i < lap.length; i++) {
            dl.push({ dist: lap[i].lapDistance, time: lap[i].time, index: i });
            tl.push({ time: lap[i].time - lap[0].time, dist: lap[i].lapDistance, index: i });
        }
        lap._distanceLookup = dl;
        lap._timeLookup = tl;
    }
}

function computeLapStatistics(lap) {
    var speeds = [];
    for (var i = 0; i < lap.length; i++) { if (!isNaN(lap[i].speed) && lap[i].speed > 0) speeds.push(lap[i].speed); }
    var avg = speeds.length > 0 ? speeds.reduce(function(a, b) { return a + b; }, 0) / speeds.length : (lap.maxDistance / lap.duration) * 3.6;
    var mx = speeds.length > 0 ? Math.max.apply(null, speeds) : 0;
    var mn = speeds.length > 0 ? Math.min.apply(null, speeds) : 0;
    return { avgSpeed: avg.toFixed(1), maxSpeed: mx.toFixed(1), minSpeed: mn.toFixed(1), distance: lap.maxDistance.toFixed(0) };
}

// ===================== UI STATE =====================
function updateUIState() {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('app-sidebar').classList.remove('hidden');
    document.getElementById('dashboard-content').classList.remove('hidden');
    var fi = document.getElementById('file-info');
    fi.classList.remove('hidden');
    fi.classList.add('flex');
    document.getElementById('playback-bar').classList.remove('hidden');
    document.getElementById('new-session-btn').classList.remove('hidden');
    document.getElementById('filename-display').textContent = filename;
    document.getElementById('lap-count-display').textContent = lapsData.length + ' Lap' + (lapsData.length !== 1 ? 's' : '');
    renderLapTower();
    updateScrubberScalingBoundaries(getSelectedLaps());
    setTimeout(function() {
        if (map) { map.invalidateSize(); var b = []; for (var i = 0; i < rawData.length; i++) b.push([rawData[i].lat, rawData[i].lon]); map.fitBounds(b, { padding: [30, 30] }); }
        var charts = ['chart-speed-dist','chart-speed-time','chart-speed-delta','chart-speed-delta-time','chart-time-delta','chart-dist-delta'];
        charts.forEach(function(id) { if (document.getElementById(id).data) Plotly.Plots.resize(id).catch(function(){}); });
    }, 150);
}

function getSelectedLaps() {
    let laps = [];
    if (selectedLapIndices.has('all')) { lapsData.forEach((lap, i) => laps.push({ lap, index: i })); }
    else { selectedLapIndices.forEach(idx => { if (lapsData[idx]) laps.push({ lap: lapsData[idx], index: idx }); }); }
    laps.sort((a, b) => a.index - b.index);
    return laps;
}

// ===================== LAP TOWER =====================
function renderLapTower() {
    const tbody = document.getElementById('lap-tower-body');
    tbody.innerHTML = '';
    let lapsToDisplay = lapsData.map((lap, idx) => ({ lap, idx }));
    var orderMult = lapSortOrder === 'asc' ? 1 : -1;
    if (lapSortKey === 'time') lapsToDisplay.sort(function(a, b) { return ((a.lap.duration || Infinity) - (b.lap.duration || Infinity)) * orderMult; });
    else if (lapSortKey === 'delta') {
        var refT = referenceLapId >= 0 && lapsData[referenceLapId] ? lapsData[referenceLapId].duration : 0;
        lapsToDisplay.sort(function(a, b) {
            var da = a.idx === referenceLapId ? 0 : (a.lap.duration || 0) - refT;
            var db = b.idx === referenceLapId ? 0 : (b.lap.duration || 0) - refT;
            return (da - db) * orderMult;
        });
    } else if (lapSortKey === 's1') lapsToDisplay.sort(function(a, b) { return ((a.lap.sectors && a.lap.sectors[0] ? a.lap.sectors[0].time : Infinity) - (b.lap.sectors && b.lap.sectors[0] ? b.lap.sectors[0].time : Infinity)) * orderMult; });
    else if (lapSortKey === 's2') lapsToDisplay.sort(function(a, b) { return ((a.lap.sectors && a.lap.sectors[1] ? a.lap.sectors[1].time : Infinity) - (b.lap.sectors && b.lap.sectors[1] ? b.lap.sectors[1].time : Infinity)) * orderMult; });
    else if (lapSortKey === 's3') lapsToDisplay.sort(function(a, b) { return ((a.lap.sectors && a.lap.sectors[2] ? a.lap.sectors[2].time : Infinity) - (b.lap.sectors && b.lap.sectors[2] ? b.lap.sectors[2].time : Infinity)) * orderMult; });
    else if (lapSortKey === 'min' || lapSortKey === 'avg' || lapSortKey === 'max') {
        lapsToDisplay.sort(function(a, b) {
            var sa = computeLapStatistics(a.lap), sb = computeLapStatistics(b.lap);
            return (parseFloat(sa[lapSortKey + 'Speed'] || 0) - parseFloat(sb[lapSortKey + 'Speed'] || 0)) * orderMult;
        });
    } else lapsToDisplay.sort(function(a, b) { return (a.idx - b.idx) * orderMult; });
    const bestTime = Math.min(...lapsData.map(l => l.duration).filter(d => d > 0));
    const refLap = referenceLapId >= 0 && lapsData[referenceLapId] ? lapsData[referenceLapId] : null;
    const refTime = refLap ? refLap.duration : bestTime;

    // Compute global max for min/avg/max speeds
    var bestMin = -Infinity, bestAvg = -Infinity, bestMax = -Infinity;
    lapsData.forEach(function(l) {
        var s = computeLapStatistics(l);
        var mn = parseFloat(s.minSpeed), av = parseFloat(s.avgSpeed), mx = parseFloat(s.maxSpeed);
        if (mn > bestMin) bestMin = mn;
        if (av > bestAvg) bestAvg = av;
        if (mx > bestMax) bestMax = mx;
    });

    lapsToDisplay.forEach(({ lap, idx }) => {
        const isChecked = selectedLapIndices.has(idx) || selectedLapIndices.has('all');
        const isBest = lap.duration === bestTime && lapsData.length > 1;
        const isRef = idx === referenceLapId;
        const color = COLORS[idx % COLORS.length];
        const stats = computeLapStatistics(lap);
        const delta = (refLap && idx !== referenceLapId) ? lap.duration - refTime : 0;
        const deltaStr = isRef ? '—' : (delta <= 0 ? (delta === 0 ? '0.000' : delta.toFixed(3)) : '+' + delta.toFixed(3));
        const deltaClass = isRef ? '' : (delta <= 0 ? 'delta-neg' : 'delta-pos');

        const tr = document.createElement('tr');
        tr.className = 'lap-row' + (isRef ? ' is-reference' : '') + (isBest ? ' is-best' : '');
        tr.style.borderLeftColor = color;

        const s1 = lap.sectors && lap.sectors[0] ? formatTime(lap.sectors[0].time) : '—';
        const s2 = lap.sectors && lap.sectors[1] ? formatTime(lap.sectors[1].time) : '—';
        const s3 = lap.sectors && lap.sectors[2] ? formatTime(lap.sectors[2].time) : '—';
        var s1Best = (lap.sectors && lap.sectors[0] && Math.abs(lap.sectors[0].time - bestSectors.s1) < 0.001);
        var s2Best = (lap.sectors && lap.sectors[1] && Math.abs(lap.sectors[1].time - bestSectors.s2) < 0.001);
        var s3Best = (lap.sectors && lap.sectors[2] && Math.abs(lap.sectors[2].time - bestSectors.s3) < 0.001);

        var mnVal = parseFloat(stats.minSpeed), avVal = parseFloat(stats.avgSpeed), mxVal = parseFloat(stats.maxSpeed);
        var mnBest = mnVal >= bestMin && bestMin > 0;
        var avBest = avVal >= bestAvg && bestAvg > 0;
        var mxBest = mxVal >= bestMax && bestMax > 0;

        tr.innerHTML = `
            <td><input type="checkbox" class="lap-enable" data-idx="${idx}" ${isChecked ? 'checked' : ''}></td>
            <td style="font-weight:700">${isBest ? '<i class="ph-fill ph-trophy text-green-500 text-[10px]"></i> ' : ''}${idx + 1}</td>
            <td style="font-weight:600;color:${isBest ? '#a855f7' : '#e2e8f0'};font-weight:${isBest ? '700' : '600'}">${formatTime(lap.duration)}</td>
            <td class="${deltaClass}" style="font-weight:600">${deltaStr}</td>
            <td style="color:${s1Best ? '#a855f7' : '#3b82f6'};font-weight:${s1Best ? '700' : '400'}">${s1}</td>
            <td style="color:${s2Best ? '#a855f7' : '#f97316'};font-weight:${s2Best ? '700' : '400'}">${s2}</td>
            <td style="color:${s3Best ? '#a855f7' : '#22c55e'};font-weight:${s3Best ? '700' : '400'}">${s3}</td>
            <td style="color:${mnBest ? '#a855f7' : 'inherit'};font-weight:${mnBest ? '700' : '400'}">${stats.minSpeed}</td>
            <td style="color:${avBest ? '#a855f7' : 'inherit'};font-weight:${avBest ? '700' : '400'}">${stats.avgSpeed}</td>
            <td style="color:${mxBest ? '#a855f7' : 'inherit'};font-weight:${mxBest ? '700' : '600'}">${stats.maxSpeed}</td>
            <td><input type="radio" name="ref-lap" class="lap-ref" data-idx="${idx}" ${isRef ? 'checked' : ''}></td>
        `;
        tbody.appendChild(tr);
    });
    // Update sort indicators
    document.querySelectorAll('.lap-tower-table th[data-sort]').forEach(function(th) {
        var sk = th.dataset.sort;
        var icon = th.querySelector('.sort-icon');
        if (icon) {
            if (sk === lapSortKey) icon.textContent = lapSortOrder === 'asc' ? '\u25B2' : '\u25BC';
            else icon.textContent = '';
        }
    });
}

// ===================== HANDLE LAP INTERACTIONS =====================
function handleEnableChange(idx, checked) {
    if (selectedLapIndices.has('all')) {
        if (!checked) {
            selectedLapIndices.delete('all');
            lapsData.forEach(function(_, i) { if (i !== idx) selectedLapIndices.add(i); });
            document.querySelectorAll('.lap-enable').forEach(function(cb) {
                cb.checked = parseInt(cb.dataset.idx) !== idx;
            });
        }
    } else {
        if (checked) {
            selectedLapIndices.add(idx);
        } else {
            selectedLapIndices.delete(idx);
            if (selectedLapIndices.size === 0) {
                selectedLapIndices = new Set(['all']);
                document.querySelectorAll('.lap-enable').forEach(function(cb) { cb.checked = true; });
            }
        }
    }
    updateVisualization();
}

function handleRefChange(idx) {
    referenceLapId = idx;
    renderLapTower();
    if (lapsData.length > 0) updateVisualization();
}

// ===================== MAP =====================
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM, &copy; CARTO', subdomains: 'abcd', maxZoom: 22
    }).addTo(map);
    polylineLayerGroup = L.layerGroup().addTo(map);
    map.on('mousemove', handleMapMouseMove);
    map.on('click', handleMapClick);
    // GPS coords display
    var cc = L.control({ position: 'bottomleft' });
    cc.onAdd = function() {
        var d = L.DomUtil.create('div', 'coord-display');
        d.innerHTML = '<span class="coord-text" style="background:rgba(0,0,0,0.7);color:#fff;font-family:JetBrains Mono,monospace;font-size:10px;padding:3px 6px;border-radius:4px;backdrop-filter:blur(4px)">--, --</span>';
        return d;
    };
    cc.addTo(map);
    map.on('mousemove', function(e) {
        var text = document.querySelector('.coord-text');
        if (text) text.textContent = e.latlng.lat.toFixed(6) + ', ' + e.latlng.lng.toFixed(6);
    });
    // Speed heatmap toggle
    var hc = L.control({ position: 'topright' });
    hc.onAdd = function() {
        var c = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        c.innerHTML = '<a id="speed-heatmap-btn" href="#" title="Toggle Speed Heatmap" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.85);color:#94a3b8;font-size:13px;border-radius:2px;cursor:pointer;backdrop-filter:blur(8px)"><i class="ph ph-speedometer"></i></a>';
        c.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); speedHeatmapActive = !speedHeatmapActive; updateVisualization(); });
        return c;
    };
    hc.addTo(map);
}

function renderMap(lapsToRender) {
    if (!polylineLayerGroup) return;
    polylineLayerGroup.clearLayers();
    for (var k in lapMarkers) { if (lapMarkers.hasOwnProperty(k)) map.removeLayer(lapMarkers[k]); }
    lapMarkers = {};
    var allLatLngs = [];
    function renderHeatmapForLap(lap) {
        if (lap.length < 5) return;
        var speeds = []; for (var i = 0; i < lap.length; i++) speeds.push(lap[i].speed);
        var minS = Math.min.apply(null, speeds), maxS = Math.max.apply(null, speeds);
        var segS = 5;
        for (var i = 0; i < lap.length - segS; i += segS) {
            var seg = lap.slice(i, i + segS + 1);
            var sum = 0; for (var si = 0; si < seg.length; si++) sum += seg[si].speed;
            var avg = sum / seg.length;
            var ratio = (maxS - minS) ? (avg - minS) / (maxS - minS) : 0.5;
            var sc = ratio < 0.2 ? '#ef4444' : ratio < 0.7 ? '#eab308' : '#22c55e';
            var lls = []; for (var si = 0; si < seg.length; si++) lls.push([seg[si].lat, seg[si].lon]);
            L.polyline(lls, { color: sc, weight: 3, opacity: 0.9 }).addTo(polylineLayerGroup);
            for (var si = 0; si < lls.length; si++) allLatLngs.push(lls[si]);
        }
    }
    for (var li = 0; li < lapsToRender.length; li++) {
        var item = lapsToRender[li];
        var lap = item.lap, index = item.index;
        var color = COLORS[index % COLORS.length];
        if (speedHeatmapActive) { renderHeatmapForLap(lap); continue; }
        var latlngs = [];
        for (var pi = 0; pi < lap.length; pi++) { latlngs.push([lap[pi].lat, lap[pi].lon]); allLatLngs.push([lap[pi].lat, lap[pi].lon]); }
        L.polyline(latlngs, { color: color, weight: 3, opacity: 0.85 }).addTo(polylineLayerGroup);
        var sp = lap[0];
        lapMarkers[index] = L.circleMarker([sp.lat, sp.lon], { radius: 5, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(polylineLayerGroup);
    }
    if (allLatLngs.length > 0) {
        var firstPt = allLatLngs[0];
        if (!currentPositionMarker) currentPositionMarker = L.circleMarker(firstPt, { radius: 7, color: '#fff', fillColor: '#facc15', fillOpacity: 1, weight: 2 }).addTo(map);
        else currentPositionMarker.setLatLng(firstPt);
    }
    // Render sector lines
    for (var sk in sectorLines) { if (sectorLines[sk]) polylineLayerGroup.addLayer(sectorLines[sk]); }
}

function handleMapMouseMove(e) {
    if (isDrawingGate && gatePoints.length === 1) {
        if (ghostLayer) map.removeLayer(ghostLayer);
        ghostLayer = L.polyline([gatePoints[0], e.latlng], { color: '#ef4444', weight: 3, dashArray: '6,6', opacity: 0.8 }).addTo(map);
    }
    if (drawingSector && sectorPoints[drawingSector].length === 1) {
        if (ghostLayer) map.removeLayer(ghostLayer);
        var sc = drawingSector === 's1' ? '#3b82f6' : drawingSector === 's2' ? '#f97316' : '#22c55e';
        ghostLayer = L.polyline([sectorPoints[drawingSector][0], e.latlng], { color: sc, weight: 3, dashArray: '6,6', opacity: 0.8 }).addTo(map);
    }
}

function handleMapClick(e) {
    // Gate drawing
    if (isDrawingGate && rawData.length > 0) {
        if (gatePoints.length === 0) {
            gatePoints.push(e.latlng);
            document.getElementById('gate-badge').innerHTML = '<div class="bg-red-600/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg whitespace-nowrap">Click map for Gate END point</div>';
        } else if (gatePoints.length === 1) {
            gatePoints.push(e.latlng);
            isDrawingGate = false;
            if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
            gateLayer = L.polyline([gatePoints[0], gatePoints[1]], { color: '#ef4444', weight: 5, opacity: 1 }).addTo(map);
            document.getElementById('gate-badge').classList.add('hidden');
            calculateLapsWithGate();
        }
        return;
    }
    // Sector drawing
    if (drawingSector && rawData.length > 0) {
        if (sectorPoints[drawingSector].length === 0) {
            sectorPoints[drawingSector].push(e.latlng);
        } else if (sectorPoints[drawingSector].length === 1) {
            sectorPoints[drawingSector].push(e.latlng);
            var sc = drawingSector === 's1' ? '#3b82f6' : drawingSector === 's2' ? '#f97316' : '#22c55e';
            if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
            if (sectorLines[drawingSector]) map.removeLayer(sectorLines[drawingSector]);
            sectorLines[drawingSector] = L.polyline([sectorPoints[drawingSector][0], sectorPoints[drawingSector][1]], { color: sc, weight: 3, dashArray: '8,8', opacity: 0.9 }).addTo(map);
            drawingSector = null;
        }
        return;
    }
    // Click to seek on map
    if (lapsData.length === 0) return;
    var md = Infinity, nn = null;
    for (var li = 0; li < lapsData.length; li++) {
        var lap = lapsData[li];
        for (var pi = 0; pi < lap.length; pi++) {
            var p = lap[pi];
            var d = getDistanceFromLatLonInM(e.latlng.lat, e.latlng.lng, p.lat, p.lon);
            if (d < md) { md = d; nn = { point: p, lapIndex: li }; }
        }
    }
    if (!nn || !nn.point || md > 50) return;
    if (playbackState.isPlaying) togglePlayback();
    var sv = playbackState.mode === 'distance' ? nn.point.lapDistance : nn.point.time;
    manualSeek(sv);
}

var gateMarkers = [];
function renderDraggableGateEndpoints() {
    for (var gi = 0; gi < gateMarkers.length; gi++) map.removeLayer(gateMarkers[gi]);
    gateMarkers = [];
    for (var i = 0; i < gatePoints.length; i++) {
        (function(idx) {
            var m = L.circleMarker(gatePoints[idx], { radius: 8, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2, draggable: true }).addTo(map);
            m.on('dragend', function(e) {
                var np = e.target.getLatLng();
                gatePoints[idx] = [np.lat, np.lng];
                if (gateLayer) map.removeLayer(gateLayer);
                gateLayer = L.polyline(gatePoints, { color: '#ef4444', weight: 5, opacity: 1 }).addTo(map);
                calculateLapsWithGate();
            });
            gateMarkers.push(m);
        })(i);
    }
}

function clearSectorLines() {
    if (!map) { sectorLines = { s1: null, s2: null, s3: null }; sectorPoints = { s1: [], s2: [], s3: [] }; return; }
    for (var sk in sectorLines) { if (sectorLines[sk]) { map.removeLayer(sectorLines[sk]); sectorLines[sk] = null; } }
    sectorPoints = { s1: [], s2: [], s3: [] };
}

// ===================== GATE/SECTOR BUTTONS =====================
function setGateMode() {
    if (rawData.length === 0) return;
    isDrawingGate = true; gatePoints = []; drawingSector = null;
    if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
    document.getElementById('gate-badge').classList.remove('hidden');
    document.getElementById('gate-badge').innerHTML = '<div class="bg-red-600/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg whitespace-nowrap">Gate Drawing Mode — Click START point on map</div>';
}

function resetGate() {
    gateUndoState = { gatePoints: gatePoints.slice(), lapsData: lapsData.slice(), selectedLapIndices: new Set(selectedLapIndices) };
    gatePoints = []; isDrawingGate = false; drawingSector = null;
    if (gateLayer) { map.removeLayer(gateLayer); gateLayer = null; }
    if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
    for (var gi = 0; gi < gateMarkers.length; gi++) map.removeLayer(gateMarkers[gi]);
    gateMarkers = [];
    document.getElementById('gate-badge').classList.add('hidden');
    if (rawData.length > 0) calculateDefaultSingleLap();
    showToast('info', 'Gate reset.', { undoAction: function() { if (gateUndoState) { gatePoints = gateUndoState.gatePoints; lapsData = gateUndoState.lapsData; selectedLapIndices = gateUndoState.selectedLapIndices; if (gateLayer) map.removeLayer(gateLayer); gateLayer = L.polyline(gatePoints, { color: '#ef4444', weight: 5, opacity: 1 }).addTo(map); updateUIState(); updateVisualization(); } } });
}

function setSectorMode(sector) {
    if (rawData.length === 0) return;
    isDrawingGate = false; drawingSector = sector;
    if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
    sectorPoints[sector] = [];
    var names = { s1: 'Sector 1 (blue)', s2: 'Sector 2 (orange)', s3: 'Sector 3 (green)' };
    document.getElementById('gate-badge').classList.remove('hidden');
    document.getElementById('gate-badge').innerHTML = '<div class="bg-gray-800/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg whitespace-nowrap border border-gray-700">' + names[sector] + ' — Click START point on map</div>';
}

function resetSectors() {
    clearSectorLines();
    drawingSector = null;
    document.getElementById('gate-badge').classList.add('hidden');
    showToast('info', 'Sector lines cleared.');
}

// ===================== CHARTS =====================
function renderCharts(lapsToRender) {
    const fontColor = isDarkMode ? '#94a3b8' : '#475569';
    const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
    const bgColor = 'transparent';
    const axisFont = { family: 'Inter, sans-serif', size: 10, color: fontColor };
    const config = { responsive: true, displayModeBar: false };
    const layoutCommon = {
        margin: { t: 20, r: 12, l: 38, b: 28 },
        hovermode: 'x unified', showlegend: true,
        legend: { orientation: 'h', y: 1.1, x: 1, xanchor: 'right', font: { size: 9, color: fontColor } },
        plot_bgcolor: bgColor, paper_bgcolor: bgColor,
        font: { family: 'Inter, sans-serif', color: fontColor },
        yaxis: { title: { text: 'Speed (km/h)', font: { size: 9, color: fontColor } }, gridcolor: gridColor, tickfont: { size: 9, color: fontColor }, fixedrange: false },
        hoverlabel: { bgcolor: isDarkMode ? '#1e293b' : '#ffffff', font: { color: isDarkMode ? '#f8fafc' : '#0f172a', size: 10 }, bordercolor: gridColor }
    };

    const refLap = referenceLapId >= 0 && lapsData[referenceLapId] ? lapsData[referenceLapId] : null;

    function buildTrace(lap, index, xKey, yKey, namePrefix) {
        const color = COLORS[index % COLORS.length];
        const rawSpeeds = lap.map(d => d[yKey] !== undefined ? d[yKey] : d.speed);
        const smoothed = smoothData(rawSpeeds, currentSmoothing);
        const x = lap.map(d => d[xKey]);
        return {
            x, y: smoothed, mode: 'lines', name: (namePrefix || 'Lap ') + (index + 1),
            line: { width: index === referenceLapId ? 2.5 : 1.8, color: color },
            hovertemplate: '%{y:.1f}<extra>' + (namePrefix || 'Lap ') + (index + 1) + '</extra>'
        };
    }

    function buildDeltaTrace(lap, index, refLap, xKey, yKey, label) {
        const color = COLORS[index % COLORS.length];
        const refX = refLap.map(d => d[xKey]);
        const refY = refLap.map(d => d[yKey] !== undefined ? d[yKey] : d.speed);
        const lapY = lap.map(d => d[yKey] !== undefined ? d[yKey] : d.speed);
        const smoothedLap = smoothData(lapY, currentSmoothing);
        const smoothedRef = smoothData(refY, currentSmoothing);
        const delta = [];
        for (var i = 0; i < lap.length; i++) {
            var match = null, md = Infinity;
            for (var j = 0; j < refLap.length; j++) {
                var dd = Math.abs(lap[i][xKey] - refLap[j][xKey]);
                if (dd < md) { md = dd; match = j; }
            }
            if (match !== null) delta.push(smoothedLap[i] - smoothedRef[match]);
            else delta.push(0);
        }
        return {
            x: lap.map(d => d[xKey]), y: delta, mode: 'lines', name: label + (index + 1),
            line: { width: 1.8, color: color },
            hovertemplate: '%{y:.1f}<extra>' + label + (index + 1) + '</extra>'
        };
    }

    // Speed vs Distance
    var tracesDist = [];
    lapsToRender.forEach(item => tracesDist.push(buildTrace(item.lap, item.index, 'lapDistance', 'speed', 'Lap ')));
    var cursorTrace = { x: [], y: [], mode: 'markers', type: 'scatter', name: 'Cursor', marker: { color: '#facc15', size: 10, line: { color: '#fff', width: 2 } }, hoverinfo: 'none', showlegend: false };
    tracesDist.push(cursorTrace);
    Plotly.newPlot('chart-speed-dist', tracesDist, { ...layoutCommon, xaxis: { title: { text: 'Distance (m)', font: { size: 9, color: fontColor } }, gridcolor: gridColor, tickfont: { size: 9, color: fontColor } } }, config);

    // Speed vs Time
    var tracesTime = [];
    lapsToRender.forEach(item => {
        var lap = item.lap; var lapStart = lap[0].time;
        var x = lap.map(function(d) { return d.time - lapStart; });
        var rawSpeeds = lap.map(function(d) { return d.speed; });
        var smoothed = smoothData(rawSpeeds, currentSmoothing);
        var color = COLORS[item.index % COLORS.length];
        tracesTime.push({
            x, y: smoothed, mode: 'lines', name: 'Lap ' + (item.index + 1),
            line: { width: item.index === referenceLapId ? 2.5 : 1.8, color: color },
            hovertemplate: '%{y:.1f}<extra>Lap ' + (item.index + 1) + '</extra>'
        });
    });
    var cursorTrace2 = { x: [], y: [], mode: 'markers', type: 'scatter', name: 'Cursor', marker: { color: '#facc15', size: 10, line: { color: '#fff', width: 2 } }, hoverinfo: 'none', showlegend: false };
    tracesTime.push(cursorTrace2);
    Plotly.newPlot('chart-speed-time', tracesTime, { ...layoutCommon, xaxis: { title: { text: 'Time (s)', font: { size: 9, color: fontColor } }, gridcolor: gridColor, tickfont: { size: 9, color: fontColor } } }, config);

    // Delta charts
    var layoutDelta = { ...layoutCommon, yaxis: { ...layoutCommon.yaxis, title: { text: '', font: { size: 9, color: fontColor } } } };
    delete layoutDelta.yaxis.title.text;

    // Speed Delta
    var tracesSpeedDelta = [];
    if (refLap) {
        lapsToRender.forEach(item => {
            if (item.index === referenceLapId) return;
            tracesSpeedDelta.push(buildDeltaTrace(item.lap, item.index, refLap, 'lapDistance', 'speed', 'Lap '));
        });
    }
    tracesSpeedDelta.push({ x: [], y: [], mode: 'markers', type: 'scatter', marker: { color: '#facc15', size: 10, line: { color: '#fff', width: 2 } }, hoverinfo: 'none', showlegend: false });
    var sdLayout = { ...layoutDelta, xaxis: { title: { text: 'Distance (m)', font: { size: 9, color: fontColor } }, gridcolor: gridColor, tickfont: { size: 9, color: fontColor } }, yaxis: { ...layoutDelta.yaxis, title: { text: 'Δ Speed (km/h)', font: { size: 9, color: fontColor } } } };
    Plotly.newPlot('chart-speed-delta', tracesSpeedDelta, sdLayout, config);

    // Speed Delta vs Time
    var tracesSpeedDeltaTime = [];
    if (refLap) {
        lapsToRender.forEach(function(item) {
            if (item.index === referenceLapId) return;
            var color = COLORS[item.index % COLORS.length];
            var lap = item.lap, lapStart = lap[0].time;
            var refSpeeds = refLap.map(function(d) { return d.speed; });
            var lapSpeeds = lap.map(function(d) { return d.speed; });
            var smoothedLap = smoothData(lapSpeeds, currentSmoothing);
            var smoothedRef = smoothData(refSpeeds, currentSmoothing);
            var delta = [];
            for (var i = 0; i < lap.length; i++) {
                var match = null, md = Infinity;
                var t = lap[i].time - lapStart;
                for (var j = 0; j < refLap.length; j++) {
                    var dd = Math.abs(t - (refLap[j].time - refLap[0].time));
                    if (dd < md) { md = dd; match = j; }
                }
                if (match !== null) delta.push(smoothedLap[i] - smoothedRef[match]);
                else delta.push(0);
            }
            tracesSpeedDeltaTime.push({
                x: lap.map(function(d) { return d.time - lapStart; }), y: delta, mode: 'lines', name: 'Lap ' + (item.index + 1),
                line: { width: 1.8, color: color },
                hovertemplate: '%{y:.1f}<extra>Lap ' + (item.index + 1) + '</extra>'
            });
        });
    }
    tracesSpeedDeltaTime.push({ x: [], y: [], mode: 'markers', type: 'scatter', marker: { color: '#facc15', size: 10, line: { color: '#fff', width: 2 } }, hoverinfo: 'none', showlegend: false });
    Plotly.newPlot('chart-speed-delta-time', tracesSpeedDeltaTime, { ...layoutDelta, xaxis: { title: { text: 'Time (s)', font: { size: 9, color: fontColor } }, gridcolor: gridColor, tickfont: { size: 9, color: fontColor } }, yaxis: { ...layoutDelta.yaxis, title: { text: 'Δ Speed (km/h)', font: { size: 9, color: fontColor } } } }, config);

    // Time Delta
    var tracesTimeDelta = [];
    if (refLap) {
        lapsToRender.forEach(item => {
            if (item.index === referenceLapId) return;
            const color = COLORS[item.index % COLORS.length];
            var lap = item.lap;
            var delta = [];
            for (var i = 0; i < lap.length; i++) {
                var match = null, md = Infinity;
                for (var j = 0; j < refLap.length; j++) {
                    var dd = Math.abs(lap[i].lapDistance - refLap[j].lapDistance);
                    if (dd < md) { md = dd; match = j; }
                }
                var dt = 0;
                if (match !== null) {
                    var lapTime = lap[i].time - lap[0].time;
                    var refTime = refLap[match].time - refLap[0].time;
                    dt = lapTime - refTime;
                }
                delta.push(dt);
            }
            tracesTimeDelta.push({
                x: lap.map(function(d) { return d.lapDistance; }), y: delta, mode: 'lines', name: 'Lap ' + (item.index + 1),
                line: { width: 1.8, color: color },
                hovertemplate: '%{y:.3f}s<extra>Lap ' + (item.index + 1) + '</extra>'
            });
        });
    }
    tracesTimeDelta.push({ x: [], y: [], mode: 'markers', type: 'scatter', marker: { color: '#facc15', size: 10, line: { color: '#fff', width: 2 } }, hoverinfo: 'none', showlegend: false });
    Plotly.newPlot('chart-time-delta', tracesTimeDelta, { ...layoutDelta, xaxis: { title: { text: 'Distance (m)', font: { size: 9, color: fontColor } }, gridcolor: gridColor, tickfont: { size: 9, color: fontColor } }, yaxis: { ...layoutDelta.yaxis, title: { text: 'Δ Time (s)', font: { size: 9, color: fontColor } } } }, config);

    // Distance Delta (x = time)
    var tracesDistDelta = [];
    if (refLap) {
        lapsToRender.forEach(item => {
            if (item.index === referenceLapId) return;
            const color = COLORS[item.index % COLORS.length];
            var lap = item.lap, lapStart = lap[0].time;
            var delta = [];
            for (var i = 0; i < lap.length; i++) {
                var match = null, md = Infinity;
                for (var j = 0; j < refLap.length; j++) {
                    var dd = Math.abs(lap[i].time - refLap[j].time);
                    if (dd < md) { md = dd; match = j; }
                }
                var dd2 = 0;
                if (match !== null) dd2 = lap[i].lapDistance - refLap[match].lapDistance;
                delta.push(dd2);
            }
            tracesDistDelta.push({
                x: lap.map(function(d) { return d.time - lapStart; }), y: delta, mode: 'lines', name: 'Lap ' + (item.index + 1),
                line: { width: 1.8, color: color },
                hovertemplate: '%{y:.1f}m<extra>Lap ' + (item.index + 1) + '</extra>'
            });
        });
    }
    tracesDistDelta.push({ x: [], y: [], mode: 'markers', type: 'scatter', marker: { color: '#facc15', size: 10, line: { color: '#fff', width: 2 } }, hoverinfo: 'none', showlegend: false });
    Plotly.newPlot('chart-dist-delta', tracesDistDelta, { ...layoutDelta, xaxis: { title: { text: 'Time (s)', font: { size: 9, color: fontColor } }, gridcolor: gridColor, tickfont: { size: 9, color: fontColor } }, yaxis: { ...layoutDelta.yaxis, title: { text: 'Δ Distance (m)', font: { size: 9, color: fontColor } } } }, config);

    // Zoom sync
    setupZoomSyncEngine();
    // Click-to-seek
    setupChartClicks();
}

// ===================== ZOOM SYNC =====================
function setupZoomSyncEngine() {
    var chartIds = ['chart-speed-dist', 'chart-speed-time', 'chart-speed-delta', 'chart-speed-delta-time', 'chart-time-delta', 'chart-dist-delta'];
    chartIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.on('plotly_relayout', function(eventData) {
            if (isRelayouting) return;
            isRelayouting = true;
            syncAllZoom(eventData, id);
            isRelayouting = false;
        });
    });
}

function syncAllZoom(sourceEvent, sourceId) {
    if (!sourceEvent || !sourceEvent['xaxis.range[0]']) return;
    var x0 = sourceEvent['xaxis.range[0]'], x1 = sourceEvent['xaxis.range[1]'];
    var chartIds = ['chart-speed-dist', 'chart-speed-time', 'chart-speed-delta', 'chart-speed-delta-time', 'chart-time-delta', 'chart-dist-delta'];
    chartIds.forEach(function(id) {
        if (id === sourceId) return;
        Plotly.relayout(id, { 'xaxis.range[0]': x0, 'xaxis.range[1]': x1 });
    });
}

function setupChartClicks() {
    var chartIds = ['chart-speed-dist', 'chart-speed-time', 'chart-speed-delta', 'chart-speed-delta-time', 'chart-time-delta', 'chart-dist-delta'];
    chartIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.on('plotly_click', function(eventData) {
            if (!eventData || !eventData.points || eventData.points.length === 0) return;
            var point = eventData.points[0];
            if (point.customdata === undefined) {
                // Use x value directly
                var xVal = point.x;
                if (xVal !== undefined) {
                    if (playbackState.isPlaying) togglePlayback();
                    if (playbackState.mode === 'distance') manualSeek(xVal);
                    else manualSeek(xVal);
                }
                return;
            }
            var dataPoint = rawData[point.customdata];
            if (!dataPoint) return;
            if (playbackState.isPlaying) togglePlayback();
            var matchedLap = lapsData[dataPoint.lap - 1];
            if (!matchedLap) return;
            if (playbackState.mode === 'distance') manualSeek(dataPoint.lapDistance);
            else manualSeek(dataPoint.time - matchedLap[0].time);
        });
    });
}

// ===================== PLAYBACK ENGINE =====================
function startPlayback() {
    if (playbackState.isPlaying) return;
    if (playbackState.currentValue >= playbackState.maxValue) playbackState.currentValue = 0;
    playbackState.isPlaying = true;
    playbackState.lastFrameTime = performance.now();
    var pbi = document.querySelector('#play-btn i');
    if (pbi) pbi.className = 'ph-fill ph-pause text-xl';
    videoElements.forEach(v => v.element.play().catch(() => {}));
    playbackState.animFrameId = requestAnimationFrame(playbackLoop);
}

function pausePlayback() {
    playbackState.isPlaying = false;
    if (playbackState.animFrameId != null) { cancelAnimationFrame(playbackState.animFrameId); playbackState.animFrameId = null; }
    var pbi = document.querySelector('#play-btn i');
    if (pbi) pbi.className = 'ph-fill ph-play text-xl ml-0.5';
    videoElements.forEach(v => v.element.pause());
}

function togglePlayback() {
    if (playbackState.isPlaying) pausePlayback();
    else startPlayback();
}

function playbackLoop(now) {
    if (!playbackState.isPlaying) return;
    var dt = Math.min((now - playbackState.lastFrameTime) / 1000, 0.1);
    playbackState.lastFrameTime = now;
    if (playbackState.mode === 'time') playbackState.currentValue += dt * playbackState.baseSpeed;
    else playbackState.currentValue += playbackState.distanceSimSpeed * playbackState.baseSpeed * dt;
    if (playbackState.currentValue > playbackState.maxValue) playbackState.currentValue = 0;
    document.getElementById('main-scrubber').value = playbackState.currentValue;
    syncDisplay();
    playbackState.animFrameId = requestAnimationFrame(playbackLoop);
}

function manualSeek(val) {
    playbackState.currentValue = val;
    syncDisplay();
}

function stepFrame(seconds) {
    pausePlayback();
    playbackState.currentValue += seconds;
    if (playbackState.currentValue < 0) playbackState.currentValue = 0;
    if (playbackState.currentValue > playbackState.maxValue) playbackState.currentValue = playbackState.maxValue;
    document.getElementById('main-scrubber').value = playbackState.currentValue;
    syncDisplay();
}

function setPlaybackMode(mode) {
    playbackState.mode = mode;
    var distBtn = document.getElementById('mode-dist');
    var timeBtn = document.getElementById('mode-time');
    var active = 'px-2 py-1 text-[10px] font-bold rounded bg-gray-700 text-brand-400 shadow-sm transition-all';
    var inactive = 'px-2 py-1 text-[10px] font-bold rounded text-gray-400 hover:text-gray-200 transition-all';
    if (mode === 'distance') { distBtn.className = active; timeBtn.className = inactive; }
    else { timeBtn.className = active; distBtn.className = inactive; }
    pausePlayback();
    updateScrubberScalingBoundaries(getSelectedLaps());
    playbackState.currentValue = 0;
    document.getElementById('main-scrubber').value = 0;
    syncDisplay();
}

function updateScrubberScalingBoundaries(lapsToRender) {
    if (!lapsToRender || lapsToRender.length === 0) return;
    var maxVal;
    if (playbackState.mode === 'distance') {
        maxVal = Math.max.apply(null, lapsToRender.map(function(l) { return l.lap.maxDistance; }));
        document.getElementById('scrubber-total').textContent = Math.round(maxVal) + ' m';
    } else {
        maxVal = Math.max.apply(null, lapsToRender.map(function(l) { return l.lap.duration; }));
        document.getElementById('scrubber-total').textContent = formatTime(maxVal);
    }
    playbackState.maxValue = maxVal;
    document.getElementById('main-scrubber').max = maxVal;
    document.getElementById('main-scrubber').value = playbackState.currentValue;
}

function syncDisplay() {
    var lapsToRender = getSelectedLaps();
    if (lapsToRender.length === 0) return;
    // Update cursor on all 5 charts
    var cursorDistX = [], cursorTimeX = [], cursorY = [], cursorColors = [];
    lapsToRender.forEach(function(item) {
        var lap = item.lap, index = item.index;
        var lapStartTime = lap[0].time;
        var pt;
        if (playbackState.mode === 'distance') pt = lap.find(function(p) { return p.lapDistance >= playbackState.currentValue; });
        else pt = lap.find(function(p) { return (p.time - lapStartTime) >= playbackState.currentValue; });
        if (!pt) pt = lap[lap.length - 1];
        cursorDistX.push(pt.lapDistance);
        cursorTimeX.push(pt.time - lapStartTime);
        cursorY.push(pt.speed);
        cursorColors.push(COLORS[index % COLORS.length]);
        if (index === 0) {
            if (currentPositionMarker) currentPositionMarker.setLatLng([pt.lat, pt.lon]);
            document.getElementById('live-speed').textContent = pt.speed.toFixed(1);
            document.getElementById('live-time').textContent = formatTime(pt.time);
            document.getElementById('live-lap').textContent = pt.lap;
        }
        if (lapMarkers[index]) lapMarkers[index].setLatLng([pt.lat, pt.lon]);
    });

    // Update cursor on each chart (last trace is cursor)
    function restyleCursor(id, x, y) {
        var el = document.getElementById(id);
        if (!el || !el.data || !el.data.length) return;
        try { Plotly.restyle(id, { x: [x], y: [y], 'marker.color': [cursorColors] }, [el.data.length - 1]); } catch(e) {}
    }
    restyleCursor('chart-speed-dist', cursorDistX, cursorY);
    restyleCursor('chart-speed-time', cursorTimeX, cursorY);
    restyleCursor('chart-speed-delta', cursorDistX, cursorY.map(function() { return 0; }));
    restyleCursor('chart-speed-delta-time', cursorTimeX, cursorY.map(function() { return 0; }));
    restyleCursor('chart-time-delta', cursorDistX, cursorY.map(function() { return 0; }));
    restyleCursor('chart-dist-delta', cursorTimeX, cursorY.map(function() { return 0; }));

    var val = playbackState.currentValue;
    document.getElementById('scrubber-current').textContent = playbackState.mode === 'distance' ? Math.round(val) + ' m' : formatTime(val);

    // Video sync
    videoElements.forEach(function(v) {
        if (!v.lapData || !v.lapData.length) return;
        var lapStartTime = v.lapData[0].time;
        var lastPt = v.lapData[v.lapData.length - 1];
        var targetFileTime;
        if (playbackState.mode === 'distance') {
            var pt2 = v.lapData.find(function(p) { return p.lapDistance >= playbackState.currentValue; }) || lastPt;
            targetFileTime = pt2.time;
        } else {
            targetFileTime = Math.min(lapStartTime + playbackState.currentValue, lastPt.time);
        }
        var diff = Math.abs(v.element.currentTime - targetFileTime);
        var threshold = playbackState.mode === 'distance' ? 0.15 : 0.35;
        if (diff > threshold) v.element.currentTime = targetFileTime;
    });
}

function updateVideoPlaybackRates() {
    if (!playbackState.isPlaying) return;
    videoElements.forEach(function(v) {
        if (!v.lapData || !v.lapData.length) return;
        if (playbackState.mode === 'time') {
            v.element.playbackRate = playbackState.baseSpeed;
        } else {
            var pt = v.lapData.find(function(p) { return p.lapDistance >= playbackState.currentValue; });
            if (pt && pt.speedMS > 0.5) {
                var rate = (playbackState.distanceSimSpeed * playbackState.baseSpeed) / pt.speedMS;
                rate = Math.max(0.15, Math.min(5.0, rate));
                v.element.playbackRate = rate;
            } else { v.element.playbackRate = 1.0; }
        }
    });
}

// ===================== VIDEO =====================
function handleVideoUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024 * 1024) showToast('warning', 'File is very large (>4GB).');
    for (var vi = 0; vi < videoElements.length; vi++) { var ve = videoElements[vi]; ve.element.pause(); ve.element.removeAttribute('src'); ve.element.load(); }
    videoElements = [];
    if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    videoBlobUrl = URL.createObjectURL(file);
    var hasCsv = document.getElementById('csv-upload').files && document.getElementById('csv-upload').files.length > 0;
    (async function() {
        try {
            if (!hasCsv && extractMetadataEnabled) await extractTelemetryFromVideo(file);
            else if (hasCsv) document.getElementById('download-csv-btn').classList.add('hidden');
        } catch (err) { console.error(err); showToast('error', 'Video upload failed: ' + err.message); }
    })();
    event.target.value = '';
    if (lapsData.length > 0) updateVisualization();
}

async function extractTelemetryFromVideo(file) {
    if (!window.MP4Box) { showToast('error', 'MP4Box library failed to load.'); return; }
    var fn = file.name.replace(/\.[^/.]+$/, "");
    var sensors = { ACCL: [], GYRO: [], GPS9: [], GRAV: [], CORI: [] };
    var gpmdTrackId = null, timescale = 1000;
    var tid = showToast('info', 'Extracting telemetry from ' + fn + '...', { duration: 0 });
    var totalChunks = Math.max(1, Math.ceil(file.size / 65536));
    var mp4box = MP4Box.createFile();
    var promise = new Promise(function(resolve, reject) {
        mp4box.onReady = function(info) {
            var t = info.tracks.find(function(t) { return t.codec === 'gpmd'; });
            if (!t) { reject(new Error('No GPMD telemetry track found.')); return; }
            gpmdTrackId = t.id; timescale = t.timescale; mp4box.setExtractionOptions(gpmdTrackId); mp4box.start();
        };
        mp4box.onError = function(error) { reject(error); };
        mp4box.onSamples = function(id, user, samples) {
            if (id !== gpmdTrackId) return;
            for (var s = 0; s < samples.length; s++) {
                var smp = samples[s];
                var ctsMs = (smp.cts / timescale) * 1000;
                var durMs = (smp.duration / timescale) * 1000;
                parseGPMD(smp.data, ctsMs, durMs, sensors);
            }
        };
        var reader = file.stream().getReader();
        var offset = 0;
        var readChunk = async function() {
            var result = await reader.read();
            if (result.done) { mp4box.flush(); resolve(); return; }
            var buf = result.value.buffer;
            buf.fileStart = offset;
            offset += buf.byteLength;
            mp4box.appendBuffer(buf);
            await readChunk();
        };
        readChunk().catch(reject);
    });
    try { await promise; } catch (error) {
        dismissToast(tid);
        showToast('error', error.message || 'Telemetry extraction failed.');
        return;
    }
    dismissToast(tid);
    telemetryCsvText = buildCombinedTelemetryCsv(sensors, fn);
    showToast('success', 'Telemetry extracted.');
    telemetrySource = 'video';
    telemetryDownloadName = fn + '_Full_Telemetry.csv';
    document.getElementById('download-csv-btn').classList.remove('hidden');
    document.getElementById('filename-display').textContent = fn + ' \u2022 extracted';
    Papa.parse(telemetryCsvText, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: function(r) { processIncomingCSV(r.data); }, error: function(e) { showToast('error', 'Telemetry parsing failed: ' + e.message); } });
}

function parseGPMD(data, baseCts, duration, sensors) {
    var i = 0;
    if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    var buf = data.buffer || data;
    var view = new DataView(buf, data.byteOffset, data.byteLength);
    while (i + 8 <= data.byteLength) {
        var fourcc = String.fromCharCode(view.getUint8(i), view.getUint8(i+1), view.getUint8(i+2), view.getUint8(i+3));
        var type = String.fromCharCode(view.getUint8(i+4));
        var size = view.getUint8(i+5);
        var count = view.getUint16(i+6);
        var pSize = size * count;
        var alignedLen = 8 + Math.ceil(pSize / 4) * 4;
        if (i + alignedLen > data.byteLength) { i += 8; continue; }
        var payloadStart = i + 8;
        if (fourcc === 'DEVC' || fourcc === 'STRM') { parseGPMD(data.slice(payloadStart, payloadStart + pSize), baseCts, duration, sensors); i += alignedLen; continue; }
        if (count === 0 || size === 0) { i += alignedLen; continue; }
        if (fourcc === 'TAMP') { i += alignedLen; continue; }
        if (fourcc === 'ACCL' || fourcc === 'GYRO' || fourcc === 'GRAV' || fourcc === 'CORI' || fourcc === 'GPS9') {
            var bps = size;
            var actualSamples = Math.floor(pSize / bps);
            var sampleDur = duration / count;
            for (var s = 0; s < actualSamples; s++) {
                var off = payloadStart + s * bps;
                if (off + bps > data.byteLength) break;
                var ts = baseCts + (s * sampleDur);
                if (fourcc === 'GPS9') {
                    if (bps < 32) continue;
                    var lat = view.getInt32(off) / 1e7, lon = view.getInt32(off+4) / 1e7, alt = view.getInt32(off+8) / 1000;
                    var sp2d = view.getInt32(off+12) / 1000, sp3d = view.getInt32(off+16) / 1000;
                    var days = view.getUint32(off+20), secs = view.getUint32(off+24) / 1000, dop = view.getUint16(off+28) / 100, fix = view.getUint16(off+30);
                    sensors.GPS9.push({ ts, lat, lon, alt, speed2d: sp2d, speed3d: sp3d, days, secs, dop, fix });
                } else {
                    var isFloat = type === 'f';
                    if (fourcc === 'ACCL' || fourcc === 'GYRO' || fourcc === 'GRAV') {
                        var x = isFloat ? view.getFloat32(off) : view.getInt16(off) / (fourcc === 'GYRO' ? 1000 : fourcc === 'GRAV' ? 4096 : 100);
                        var y = isFloat ? view.getFloat32(off+4) : view.getInt16(off+2) / (fourcc === 'GYRO' ? 1000 : fourcc === 'GRAV' ? 4096 : 100);
                        var z = isFloat ? view.getFloat32(off+8) : view.getInt16(off+4) / (fourcc === 'GYRO' ? 1000 : fourcc === 'GRAV' ? 4096 : 100);
                        sensors[fourcc].push({ ts, x, y, z });
                    } else if (fourcc === 'CORI') {
                        var w = isFloat ? view.getFloat32(off) : view.getInt16(off) / 32767;
                        var x = isFloat ? view.getFloat32(off+4) : view.getInt16(off+2) / 32767;
                        var y = isFloat ? view.getFloat32(off+8) : view.getInt16(off+4) / 32767;
                        var z = isFloat ? view.getFloat32(off+12) : view.getInt16(off+6) / 32767;
                        sensors.CORI.push({ ts, w, x, y, z });
                    }
                }
            }
        }
        i += alignedLen;
    }
}

function buildCombinedTelemetryCsv(sensors, fileName) {
    var allTs = new Set();
    for (var k in sensors) { var arr = sensors[k]; for (var i = 0; i < arr.length; i++) allTs.add(arr[i].ts.toFixed(6)); }
    var sortedTs = Array.from(allTs).sort(function(a, b) { return parseFloat(a) - parseFloat(b); });
    var maps = {};
    for (var k in sensors) {
        maps[k] = new Map();
        for (var i = 0; i < sensors[k].length; i++) { var p = sensors[k][i]; var key = p.ts.toFixed(6); if (!maps[k].has(key) || p.ts < maps[k].get(key).ts) maps[k].set(key, p); }
    }
    var gpsBase = new Date(Date.UTC(2000, 0, 1));
    var header = 'cts,date,ACCL_x,ACCL_y,ACCL_z,temp_ACCL,GYRO_x,GYRO_y,GYRO_z,temp_GYRO,GRAV_x,GRAV_y,GRAV_z,CORI_w,CORI_x,CORI_y,CORI_z,GPS (Lat.) [deg],GPS (Long.) [deg],GPS (Alt.) [m],GPS (2D) [m/s],GPS (3D) [m/s],GPS (days) [deg],GPS (secs) [s],GPS (DOP) [deg],GPS (fix) [deg],altitude system';
    var rows = [header];
    for (var i = 0; i < sortedTs.length; i++) {
        var ts = sortedTs[i], t = parseFloat(ts);
        var a = maps.ACCL.get(ts), g = maps.GYRO.get(ts), gr = maps.GRAV.get(ts), c = maps.CORI.get(ts), gp = maps.GPS9.get(ts);
        var acclX = '', acclY = '', acclZ = '', gyroX = '', gyroY = '', gyroZ = '', gravX = '', gravY = '', gravZ = '';
        var coriW = '', coriX = '', coriY = '', coriZ = '', gpsLat = '', gpsLon = '', gpsAlt = '', gps2d = '', gps3d = '';
        var gpsDays = '', gpsSecs = '', gpsDop = '', gpsFix = '', altSys = '', dateStr = '';
        if (a) { acclX = a.x; acclY = a.y; acclZ = a.z; }
        if (g) { gyroX = g.x; gyroY = g.y; gyroZ = g.z; }
        if (gr) { gravX = gr.x; gravY = gr.y; gravZ = gr.z; }
        if (c) { coriW = c.w; coriX = c.x; coriY = c.y; coriZ = c.z; }
        if (gp) { gpsLat = gp.lat; gpsLon = gp.lon; gpsAlt = gp.alt; gps2d = gp.speed2d; gps3d = gp.speed3d; gpsDays = gp.days; gpsSecs = gp.secs; gpsDop = gp.dop; gpsFix = gp.fix; altSys = ''; dateStr = new Date(gpsBase.getTime() + (gp.days * 86400000) + (gp.secs * 1000)).toISOString(); }
        rows.push([t.toFixed(6), dateStr, acclX, acclY, acclZ, '', gyroX, gyroY, gyroZ, '', gravX, gravY, gravZ, coriW, coriX, coriY, coriZ, gpsLat, gpsLon, gpsAlt, gps2d, gps3d, gpsDays, gpsSecs, gpsDop, gpsFix, altSys].join(','));
    }
    return rows.join('\n');
}

function renderVideoGrid(lapsToRender) {
    var section = document.getElementById('video-section');
    var grid = document.getElementById('video-grid');
    var count = document.getElementById('video-count');
    if (!videoBlobUrl || lapsToRender.length === 0) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    grid.innerHTML = '';
    videoElements = [];

    var lapsToShow = lapsToRender;
    if (selectedLapIndices.has('all') && lapsToRender.length > maxVideoCount) lapsToShow = lapsToRender.slice(0, maxVideoCount);

    lapsToShow.forEach(function(item) {
        var lap = item.lap, index = item.index;
        var color = COLORS[index % COLORS.length];
        var wrapper = document.createElement('div');
        wrapper.className = 'video-card';
        wrapper.style.borderColor = color;
        var w = currentVideoSize, h = Math.round(w * 9 / 16);
        wrapper.style.width = w + 'px';
        wrapper.style.height = h + 'px';

        var video = document.createElement('video');
        video.src = videoBlobUrl;
        video.muted = true;
        video.preload = 'auto';
        video.playsInline = true;

        var badge = document.createElement('div');
        badge.className = 'video-badge';
        badge.innerHTML = '<span class="dot" style="background:' + color + '"></span> Lap ' + (index + 1) + ' <span class="text-gray-400 font-normal">' + formatTime(lap.duration) + '</span>';

        wrapper.append(video, badge);
        grid.appendChild(wrapper);
        videoElements.push({ lapIndex: index, element: video, lapData: lap });
    });

    count.textContent = '(' + lapsToShow.length + ' shown)';
    syncDisplay();
}

// ===================== THEME =====================
function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.documentElement.classList.toggle('dark');
    if (tileLayer) {
        map.removeLayer(tileLayer);
        if (isDarkMode) tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OSM, &copy; CARTO', subdomains: 'abcd', maxZoom: 22 }).addTo(map);
        else tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 22 }).addTo(map);
        polylineLayerGroup.addTo(map);
    }
    if (lapsData.length > 0) updateVisualization();
}

function updateVisualization() {
    if (lapsData.length === 0) return;
    var lapsToRender = getSelectedLaps();
    renderCharts(lapsToRender);
    renderMap(lapsToRender);
    updateScrubberScalingBoundaries(lapsToRender);
    renderVideoGrid(lapsToRender);
}

// ===================== DOWNLOAD CSV =====================
function downloadTelemetryCsv() {
    if (!telemetryCsvText) return;
    var blob = new Blob([telemetryCsvText], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = telemetryDownloadName; a.click();
    URL.revokeObjectURL(a.href);
}

// ===================== EVENT WIRING =====================
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    if (isDarkMode) document.documentElement.classList.add('dark');

    // File uploads
    document.getElementById('csv-upload').addEventListener('change', handleFileUpload);
    document.getElementById('video-upload').addEventListener('change', handleVideoUpload);
    document.getElementById('download-csv-btn').addEventListener('click', downloadTelemetryCsv);
    document.getElementById('new-session-btn').addEventListener('click', newSession);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('sidebar-toggle-btn').addEventListener('click', function(event) {
        event.stopPropagation();
        document.body.classList.toggle('sidebar-collapsed');
    });

    // Gate / Sector buttons
    document.getElementById('btn-set-gate').addEventListener('click', setGateMode);
    document.getElementById('btn-reset-gate').addEventListener('click', resetGate);
    document.getElementById('btn-set-s1').addEventListener('click', function() { setSectorMode('s1'); });
    document.getElementById('btn-set-s2').addEventListener('click', function() { setSectorMode('s2'); });
    document.getElementById('btn-set-s3').addEventListener('click', function() { setSectorMode('s3'); });
    document.getElementById('btn-reset-sectors').addEventListener('click', resetSectors);

    // Settings
    document.getElementById('settings-gear').addEventListener('click', function() {
        document.getElementById('settings-overlay').classList.remove('hidden');
    });
    document.getElementById('settings-close').addEventListener('click', function() {
        document.getElementById('settings-overlay').classList.add('hidden');
    });
    document.getElementById('settings-overlay').addEventListener('click', function(e) {
        if (e.target === this) this.classList.add('hidden');
    });

    // Playback
    document.getElementById('play-btn').addEventListener('click', togglePlayback);
    document.getElementById('prev-frame-btn').addEventListener('click', function() { stepFrame(-0.04); });
    document.getElementById('next-frame-btn').addEventListener('click', function() { stepFrame(0.04); });
    document.getElementById('rewind-btn').addEventListener('click', function() { stepFrame(-0.5); });
    document.getElementById('ff-btn').addEventListener('click', function() { stepFrame(0.5); });

    var scrubber = document.getElementById('main-scrubber');
    scrubber.addEventListener('input', function(e) { manualSeek(parseFloat(e.target.value)); });
    scrubber.addEventListener('mousedown', function() { pausePlayback(); });

    document.getElementById('mode-dist').addEventListener('click', function() { setPlaybackMode('distance'); });
    document.getElementById('mode-time').addEventListener('click', function() { setPlaybackMode('time'); });

    document.getElementById('playback-speed').addEventListener('change', function(e) {
        playbackState.baseSpeed = parseFloat(e.target.value);
        updateVideoPlaybackRates();
    });

    // Max videos setting
    document.getElementById('setting-max-videos').addEventListener('change', function(e) {
        maxVideoCount = parseInt(e.target.value);
        if (lapsData.length > 0) renderVideoGrid(getSelectedLaps());
        showToast('info', 'Max videos: ' + (maxVideoCount === 0 ? 'All' : maxVideoCount));
    });

    // Smoothing
    var smoothingSlider = document.getElementById('smoothing-slider');
    var smoothingValue = document.getElementById('smoothing-value');
    smoothingSlider.addEventListener('input', function() {
        currentSmoothing = parseInt(this.value);
        smoothingValue.textContent = currentSmoothing;
        if (lapsData.length > 0) renderCharts(getSelectedLaps());
    });

    // Video section collapse
    var videoCollapsed = false;
    document.getElementById('video-section-header').addEventListener('click', function() {
        videoCollapsed = !videoCollapsed;
        var grid = document.getElementById('video-grid');
        var msg = document.getElementById('video-collapsed-message');
        var chevron = document.getElementById('video-section-chevron');
        if (videoCollapsed) {
            grid.style.display = 'none';
            msg.classList.remove('hidden');
            chevron.className = 'ph ph-caret-down text-gray-600 text-sm';
        } else {
            grid.style.display = 'flex';
            msg.classList.add('hidden');
            chevron.className = 'ph ph-caret-up text-gray-600 text-sm';
        }
    });

    // Charts column collapse (header click)
    document.getElementById('charts-column-header').addEventListener('click', function() {
        document.body.classList.toggle('charts-collapsed');
    });
    document.getElementById('charts-toggle-btn').addEventListener('click', function(event) {
        event.stopPropagation();
        document.body.classList.toggle('charts-collapsed');
    });

    // Video size
    document.getElementById('video-size-slider').addEventListener('input', function(e) {
        currentVideoSize = parseInt(e.target.value);
        document.querySelectorAll('.video-card').forEach(function(card) {
            var w = currentVideoSize, h = Math.round(w * 9 / 16);
            card.style.width = w + 'px';
            card.style.height = h + 'px';
        });
    });

    // Extract CSV button
    document.getElementById('extract-csv-btn').addEventListener('click', function() {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'video/mp4';
        inp.onchange = function(e) {
            var f = e.target.files[0];
            if (f) { extractTelemetryFromVideo(f).then(function() {
                document.getElementById('csv-upload').value = '';
            }); }
        };
        inp.click();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.target.closest('input,textarea,select')) return;
        if (e.key === ' ' || e.key === 'Space') { e.preventDefault(); togglePlayback(); }
        if (e.key === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); stepFrame(-0.5); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-0.04); }
        if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); stepFrame(0.5); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(0.04); }
        if (e.key === 'Escape') {
            isDrawingGate = false; drawingSector = null;
            if (ghostLayer) { map.removeLayer(ghostLayer); ghostLayer = null; }
            document.getElementById('gate-badge').classList.add('hidden');
        }
    });

    // Chart card collapse
    document.querySelectorAll('.chart-card-header').forEach(function(header) {
        header.addEventListener('click', function() {
            var targetId = this.dataset.target;
            var body = document.getElementById(targetId);
            if (!body) return;
            var icon = this.querySelector('.ph-caret-up, .ph-caret-down');
            if (body.classList.contains('collapsed')) {
                body.classList.remove('collapsed');
                if (icon) icon.className = 'ph ph-caret-up text-gray-600 text-sm';
            } else {
                body.classList.add('collapsed');
                if (icon) icon.className = 'ph ph-caret-down text-gray-600 text-sm';
            }
            var pEl = body.closest('.chart-card');
            if (pEl) pEl.style.opacity = body.classList.contains('collapsed') ? '0.5' : '1';
        });
    });

    // Delegate lap tower events
    document.getElementById('lap-tower-body').addEventListener('change', function(e) {
        if (e.target.classList.contains('lap-enable')) {
            handleEnableChange(parseInt(e.target.dataset.idx), e.target.checked);
        }
        if (e.target.classList.contains('lap-ref')) {
            handleRefChange(parseInt(e.target.dataset.idx));
        }
    });

    // Lap tower column sorting
    var lapTowerHeaders = document.querySelectorAll('.lap-tower-table th[data-sort]');
    for (var thi = 0; thi < lapTowerHeaders.length; thi++) {
        (function(th) {
            th.addEventListener('click', function() {
                var key = this.dataset.sort;
                if (key === 'none' || !key) return;
                if (key === lapSortKey) lapSortOrder = lapSortOrder === 'asc' ? 'desc' : 'asc';
                else { lapSortKey = key; lapSortOrder = 'asc'; }
                renderLapTower();
            });
        })(lapTowerHeaders[thi]);
    }

    // Resize handler
    window.addEventListener('resize', function() {
        if (lapsData.length > 0) {
            ['chart-speed-dist','chart-speed-time','chart-speed-delta','chart-time-delta','chart-dist-delta'].forEach(function(id) {
                try { Plotly.Plots.resize(id).catch(function(){}); } catch(e) {}
            });
        }
    });

    // Drag-drop
    document.addEventListener('dragover', function(e) { e.preventDefault(); document.body.classList.add('drag-over'); });
    document.addEventListener('dragleave', function(e) { if (!e.relatedTarget || e.relatedTarget === document.documentElement) document.body.classList.remove('drag-over'); });
    document.addEventListener('drop', function(e) {
        e.preventDefault();
        document.body.classList.remove('drag-over');
        var file = e.dataTransfer.files[0];
        if (file) handleFileDrop(file);
    });
});

function handleFileDrop(file) {
    var name = file.name.toLowerCase();
    var isCsv = name.endsWith('.csv');
    var isVideo = file.type.startsWith('video/');
    if (!isCsv && !isVideo) { showToast('warning', 'Unsupported file type.'); return; }
    if (isCsv) {
        var inp = document.getElementById('csv-upload');
        var dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    } else {
        var inp = document.getElementById('video-upload');
        var dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    }
}

// ===================== NEW UI INTEGRATION =====================
(function() {
    var isNewUI = document.getElementById('lt-rows') !== null;
    if (!isNewUI) return;

    isDarkMode = true;
    document.documentElement.classList.add('dark');

    // ── Demo data generation ──
    function generateDemoData() {
        var demoRows = [];
        var centerLat = 40.8612, centerLon = 14.3641;
        var radius = 0.002;
        var pts = 600;
        for (var i = 0; i < pts; i++) {
            var angle = (i / pts) * 2 * Math.PI;
            var lat = centerLat + Math.sin(angle) * radius + Math.sin(angle * 2.5) * 0.0003;
            var lon = centerLon + Math.cos(angle) * radius + Math.cos(angle * 1.8) * 0.0003;
            var spd = 30 + 70 * (0.5 + 0.5 * Math.sin(angle * 0.7 + Math.sin(angle * 1.3) * 0.3));
            demoRows.push({
                'GPS (Lat.) [deg]': lat.toFixed(7),
                'GPS (Long.) [deg]': lon.toFixed(7),
                'GPS (2D) [m/s]': (spd / 3.6).toFixed(3),
            });
        }
        filename = 'Demo Session — KZ2 Rental Circuit Napoli';
        processIncomingCSV(demoRows);
        telemetryCsvText = '';
        telemetryDownloadName = 'demo_telemetry.csv';
        document.getElementById('file-info').classList.add('hidden');
        document.getElementById('file-info').classList.remove('flex');
    }

    // ── Enhanced lap tower rendering for new UI ──
    var origRenderLapTower = renderLapTower;
    renderLapTower = function() {
        origRenderLapTower();
        var ltRows = document.getElementById('lt-rows');
        if (!ltRows || lapsData.length === 0) return;

        var nColors = ['#2d6ef5','#e8293a','#00c853','#fb923c','#a855f7','#facc15','#06b6d4','#f43f5e','#84cc16','#ff6b35'];
        var bestTime = Math.min.apply(null, lapsData.map(function(l) { return l.duration; }).filter(function(d) { return d > 0; }));
        var refLap = referenceLapId >= 0 && lapsData[referenceLapId] ? lapsData[referenceLapId] : lapsData[0];
        var html = '';

        lapsData.forEach(function(lap, i) {
            var c = nColors[i % nColors.length];
            var isBest = lap.duration === bestTime && lapsData.length > 1;
            var isRef = i === referenceLapId;
            var delta = isRef ? 0 : lap.duration - refLap.duration;
            var dStr = isRef ? chr(8212) : (delta <= 0 ? (delta === 0 ? '0.000' : delta.toFixed(3)) : '+' + delta.toFixed(3));
            var dClass = isRef ? '' : (delta < 0 ? 'neg' : (delta > 0 ? 'pos' : ''));
            var stats = computeLapStatistics(lap);
            var s1 = lap.sectors && lap.sectors[0] ? formatTime(lap.sectors[0].time) : chr(8212);
            var s2 = lap.sectors && lap.sectors[1] ? formatTime(lap.sectors[1].time) : chr(8212);
            var s3 = lap.sectors && lap.sectors[2] ? formatTime(lap.sectors[2].time) : chr(8212);
            var isSel = selectedLapIndices.has(i) || selectedLapIndices.has('all');
            var rowCls = ['lap-row', isBest ? 'best' : '', isRef ? 'active' : ''].filter(Boolean).join(' ');

            html += '<div class="' + rowCls + '"><div class="lt-cols">';
            html += '<div class="col-en" style="display:flex;align-items:center;justify-content:center"><label class="toggle" onclick="event.stopPropagation()"><input type="checkbox" ' + (isSel ? 'checked' : '') + ' onchange="newUI_toggleLap(' + i + ',this.checked)"><div class="toggle-track"><div class="toggle-thumb"></div></div></label></div>';
            html += '<div class="col-num" style="display:flex;align-items:center;gap:4px"><span class="l-dot" style="background:' + c + '"></span><span style="color:#9098b0">' + String(i + 1).padStart(2, '0') + '</span>' + (isBest ? '<span class="badge badge-best">B</span>' : '') + '</div>';
            html += '<div class="col-time">' + formatTime(lap.duration) + '</div>';
            html += '<div class="' + dClass + '">' + dStr + '</div>';
            html += '<div>' + s1 + '</div><div>' + s2 + '</div><div>' + s3 + '</div>';
            html += '<div>' + stats.minSpeed + '</div><div>' + stats.avgSpeed + '</div><div>' + stats.maxSpeed + '</div>';
            html += '<div class="col-ref" style="text-align:center"><span class="ref-star ' + (isRef ? 'active' : '') + '" onclick="event.stopPropagation();newUI_toggleRef(' + i + ')"><i class="fa-' + (isRef ? 'solid' : 'regular') + ' fa-star"></i></span></div>';
            html += '</div></div>';
        });
        ltRows.innerHTML = html;

        var summary = document.getElementById('lt-summary');
        if (summary) {
            var avg = lapsData.reduce(function(s, l) { return s + l.duration; }, 0) / lapsData.length;
            var variance = lapsData.reduce(function(s, l) { return s + Math.pow(l.duration - avg, 2); }, 0) / lapsData.length;
            var std = Math.sqrt(variance);
            summary.innerHTML = '<div class="summary-stat"><div class="label">Best Lap</div><div class="val best-val">' + formatTime(bestTime) + '</div></div><div class="summary-stat"><div class="label">Session Avg</div><div class="val">' + formatTime(avg) + '</div></div><div class="summary-stat"><div class="label">Consistency ' + chr(963) + '</div><div class="val">' + std.toFixed(3) + 's</div></div>';
        }

        var lc = document.querySelector('.lap-count');
        if (lc) lc.textContent = lapsData.length + ' LAPS';
    };

    function chr(code) { return String.fromCharCode(code); }

    // ── New UI playback integration ──
    var origSyncDisplay = syncDisplay;
    syncDisplay = function() {
        origSyncDisplay();
        if (!document.getElementById('lt-rows')) return;

        var pct = playbackState.maxValue > 0 ? (playbackState.currentValue / playbackState.maxValue * 100).toFixed(1) + '%' : '0%';
        var fill = document.getElementById('scrubber-fill');
        var thumb = document.getElementById('scrubber-thumb');
        if (fill) fill.style.width = pct;
        if (thumb) thumb.style.left = pct;

        var timeDisplay = document.getElementById('current-time');
        if (timeDisplay) {
            var v = playbackState.currentValue;
            if (playbackState.mode === 'distance') {
                timeDisplay.textContent = Math.round(v) + 'm';
            } else {
                var m = Math.floor(v / 60);
                var s = (v % 60).toFixed(1).padStart(4, '0');
                timeDisplay.textContent = m + ':' + s;
            }
        }

        var totalEls = document.querySelectorAll('#playbar-timeline .time-display');
        if (totalEls.length >= 2) {
            var mv = playbackState.maxValue;
            if (playbackState.mode === 'distance') {
                totalEls[1].textContent = Math.round(mv) + 'm';
            } else {
                var m = Math.floor(mv / 60);
                var s = (mv % 60).toFixed(1).padStart(4, '0');
                totalEls[1].textContent = m + ':' + s;
            }
        }
    };

    // ── Wire new_ui controls ──
    window.newUI_toggleLap = function(i, v) {
        handleEnableChange(i, v);
        renderLapTower();
    };
    window.newUI_toggleRef = function(i) {
        handleRefChange(i);
    };

    var playBtn = document.getElementById('btn-play');
    if (playBtn) {
        playBtn.addEventListener('click', function() {
            togglePlayback();
            var icon = playBtn.querySelector('i');
            if (icon) icon.className = playbackState.isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        });
    }

    var scrubber = document.getElementById('scrubber');
    if (scrubber) {
        scrubber.addEventListener('click', function(e) {
            var rect = scrubber.getBoundingClientRect();
            var p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            pausePlayback();
            var pi = document.querySelector('#btn-play i');
            if (pi) pi.className = 'fa-solid fa-play';
            manualSeek(p * playbackState.maxValue);
        });
    }

    document.querySelectorAll('.speed-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.speed-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            var speed = parseFloat(btn.getAttribute('data-speed') || btn.textContent);
            playbackState.baseSpeed = speed;
            updateVideoPlaybackRates();
        });
    });

    document.querySelectorAll('.sync-toggle button').forEach(function(btn) {
        btn.addEventListener('click', function() {
            btn.closest('.sync-toggle').querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            var mode = btn.textContent.trim().toLowerCase();
            if (mode === 'time') setPlaybackMode('time');
            else setPlaybackMode('distance');
        });
    });

    document.querySelectorAll('.tb-btn').forEach(function(btn) {
        var txt = btn.textContent.trim();
        if (txt.indexOf('Upload CSV') >= 0) {
            btn.addEventListener('click', function() { document.getElementById('csv-upload').click(); });
        } else if (txt.indexOf('Upload Video') >= 0) {
            btn.addEventListener('click', function() { document.getElementById('video-upload').click(); });
        } else if (txt.indexOf('Download CSV') >= 0) {
            btn.addEventListener('click', function() { downloadTelemetryCsv(); });
        } else if (txt.indexOf('Extract CSV') >= 0) {
            btn.addEventListener('click', function() { document.getElementById('extract-csv-btn').click(); });
        }
    });

    ['btn-sf','btn-s1','btn-s2','btn-reset'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', function() {
                document.querySelectorAll('.map-btn').forEach(function(b) { b.classList.remove('active'); });
                if (id !== 'btn-reset') el.classList.add('active');
                if (id === 'btn-s1') setSectorMode('s1');
                else if (id === 'btn-s2') setSectorMode('s2');
                else if (id === 'btn-reset') resetSectors();
            });
        }
    });

    var topRight = document.getElementById('topbar-right');
    if (topRight) {
        var settingsBtn = topRight.querySelector('.settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', function() {
                var so = document.getElementById('settings-overlay');
                if (so) so.classList.remove('hidden');
            });
        }
    }

    setTimeout(generateDemoData, 100);
})();