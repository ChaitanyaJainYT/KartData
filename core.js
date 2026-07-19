// ═══════════════════════════════════════════
// KartData — Core: State, Utilities, Parsing
// ═══════════════════════════════════════════

// --- Global State ---
let rawData = [];
let lapsData = [];
let map = null;
let tileLayer = null;
let lapMarkers = {};
let polylineLayerGroup = null;
let selectedLapIndices = new Set(['all']);
let currentVideoSize = 350;
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
let telemetryCsvText = "";
let isUploadingVideo = false;
let telemetryDownloadName = "telemetry.csv";
let telemetrySource = null;
let extractMetadataEnabled = true;

let playbackState = {
    isPlaying: false,
    mode: 'distance',
    currentValue: 0,
    maxValue: 0,
    animFrameId: null,
    lastFrameTime: 0,
    baseSpeed: 1.0,
    distanceSimSpeed: 25.0
};

const COLORS = [
    '#b138ff', '#00d2ff', '#22c55e', '#e8ff00', '#ec4899', '#f97316',
    '#3b82f6', '#ef4444', '#a855f7', '#06b6d4', '#84cc16', '#f59e0b',
    '#6366f1', '#10b981', '#d946ef', '#14b8a6'
];

// --- Utility Functions ---
function deg2rad(deg) { return deg * (Math.PI / 180); }

function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatTime(seconds) {
    if (seconds === null || isNaN(seconds)) return "--:--.---";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${m}:${s < 10 ? '0' : ''}${s}.${ms.toString().padStart(3, '0')}`;
}

function smoothData(data, windowSize) {
    if (!windowSize || windowSize <= 0) return data;
    const smoothed = [];
    for (let i = 0; i < data.length; i++) {
        let sum = 0, count = 0;
        for (let j = i - windowSize; j <= i + windowSize; j++) {
            if (j >= 0 && j < data.length) { sum += data[j]; count++; }
        }
        smoothed.push(sum / count);
    }
    return smoothed;
}

function intersects(a, b, c, d, p, q, r, s) {
    let det = (c - a) * (s - q) - (r - p) * (d - b);
    if (det === 0) return false;
    let lambda = ((s - q) * (r - a) + (p - r) * (s - b)) / det;
    let gamma = ((b - d) * (r - a) + (c - a) * (s - b)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

// --- GPMD Parsing ---
function parseGPMD(data, baseCts, duration, sensors) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    let currentTemp = null;

    const recursive = (start, end) => {
        let i = start;
        while (i <= end - 8) {
            const fourcc = String.fromCharCode(buf[i], buf[i+1], buf[i+2], buf[i+3]);
            const type = String.fromCharCode(buf[i+4]);
            const size = buf[i+5];
            const count = view.getUint16(i+6);
            const pSize = size * count;
            const pOff = i + 8;

            if (fourcc === 'DEVC' || fourcc === 'STRM') {
                recursive(pOff, pOff + pSize);
            } else if (fourcc === 'TAMP') {
                currentTemp = view.getInt16(pOff) / 100;
            } else if (fourcc === 'ACCL') {
                const isFloat = type === 'f';
                const bps = isFloat ? 12 : 6;
                const samples = Math.floor(pSize / bps);
                for (let c = 0; c < samples; c++) {
                    const o = pOff + c * bps;
                    sensors.ACCL.push({
                        ts: baseCts + c * (duration / samples),
                        x: isFloat ? view.getFloat32(o) : view.getInt16(o) / 100,
                        y: isFloat ? view.getFloat32(o+4) : view.getInt16(o+2) / 100,
                        z: isFloat ? view.getFloat32(o+8) : view.getInt16(o+4) / 100,
                        temp: currentTemp
                    });
                }
            } else if (fourcc === 'GYRO') {
                const isFloat = type === 'f';
                const bps = isFloat ? 12 : 6;
                const samples = Math.floor(pSize / bps);
                for (let c = 0; c < samples; c++) {
                    const o = pOff + c * bps;
                    sensors.GYRO.push({
                        ts: baseCts + c * (duration / samples),
                        x: isFloat ? view.getFloat32(o) : view.getInt16(o) / 1000,
                        y: isFloat ? view.getFloat32(o+4) : view.getInt16(o+2) / 1000,
                        z: isFloat ? view.getFloat32(o+8) : view.getInt16(o+4) / 1000,
                        temp: currentTemp
                    });
                }
            } else if (fourcc === 'GRAV') {
                const isFloat = type === 'f';
                const bps = isFloat ? 12 : 6;
                const samples = Math.floor(pSize / bps);
                for (let c = 0; c < samples; c++) {
                    const o = pOff + c * bps;
                    sensors.GRAV.push({
                        ts: baseCts + c * (duration / samples),
                        x: isFloat ? view.getFloat32(o) : view.getInt16(o) / 4096,
                        y: isFloat ? view.getFloat32(o+4) : view.getInt16(o+2) / 4096,
                        z: isFloat ? view.getFloat32(o+8) : view.getInt16(o+4) / 4096
                    });
                }
            } else if (fourcc === 'CORI') {
                const isFloat = type === 'f';
                const bps = isFloat ? 16 : 8;
                const samples = Math.floor(pSize / bps);
                for (let c = 0; c < samples; c++) {
                    const o = pOff + c * bps;
                    sensors.CORI.push({
                        ts: baseCts + c * (duration / samples),
                        w: isFloat ? view.getFloat32(o) : view.getInt16(o) / 32767,
                        x: isFloat ? view.getFloat32(o+4) : view.getInt16(o+2) / 32767,
                        y: isFloat ? view.getFloat32(o+8) : view.getInt16(o+4) / 32767,
                        z: isFloat ? view.getFloat32(o+12) : view.getInt16(o+6) / 32767
                    });
                }
            } else if (fourcc === 'GPS9') {
                const gpsSamples = Math.floor(pSize / 32);
                for (let c = 0; c < gpsSamples; c++) {
                    const o = pOff + c * 32;
                    sensors.GPS9.push({
                        ts: baseCts + c * (duration / gpsSamples),
                        lat: view.getInt32(o) / 10000000,
                        lon: view.getInt32(o+4) / 10000000,
                        alt: view.getInt32(o+8) / 1000,
                        speed2d: view.getInt32(o+12) / 1000,
                        speed3d: view.getInt32(o+16) / 1000,
                        days: view.getUint32(o+20),
                        secs: view.getUint32(o+24) / 1000,
                        dop: view.getUint16(o+28) / 100,
                        fix: view.getUint16(o+30),
                        altSys: 'MSLV'
                    });
                }
            }
            i += 8 + Math.ceil(pSize / 4) * 4;
        }
    };
    recursive(0, data.byteLength);
}

function buildCombinedTelemetryCsv(sensors) {
    const allTs = new Set();
    Object.values(sensors).forEach(arr => arr.forEach(p => allTs.add(p.ts.toFixed(6))));
    const sortedTs = Array.from(allTs).sort((a, b) => parseFloat(a) - parseFloat(b));
    const maps = {};
    Object.keys(sensors).forEach(k => {
        maps[k] = new Map(sensors[k].map(p => [p.ts.toFixed(6), p]));
    });

    let csv = 'cts,date,ACCL_x,ACCL_y,ACCL_z,temp_ACCL,GYRO_x,GYRO_y,GYRO_z,temp_GYRO,GRAV_x,GRAV_y,GRAV_z,CORI_w,CORI_x,CORI_y,CORI_z,GPS (Lat.) [deg],GPS (Long.) [deg],GPS (Alt.) [m],GPS (2D) [m/s],GPS (3D) [m/s],GPS (days) [deg],GPS (secs) [s],GPS (DOP) [deg],GPS (fix) [deg],altitude system\n';
    const gpsBaseDate = new Date(Date.UTC(2000, 0, 1));
    let currentDateStr = '';

    sortedTs.forEach(ts => {
        const accl = maps.ACCL.get(ts) || {};
        const gyro = maps.GYRO.get(ts) || {};
        const grav = maps.GRAV.get(ts) || {};
        const cori = maps.CORI.get(ts) || {};
        const gps = maps.GPS9.get(ts) || {};
        if (gps.days !== undefined && gps.secs !== undefined) {
            const d = new Date(gpsBaseDate.getTime() + gps.days * 86400000 + gps.secs * 1000);
            currentDateStr = d.toISOString();
        }
        const row = [
            ts, currentDateStr,
            accl.x ?? '', accl.y ?? '', accl.z ?? '', accl.temp ?? '',
            gyro.x ?? '', gyro.y ?? '', gyro.z ?? '', gyro.temp ?? '',
            grav.x ?? '', grav.y ?? '', grav.z ?? '',
            cori.w ?? '', cori.x ?? '', cori.y ?? '', cori.z ?? '',
            gps.lat ?? '', gps.lon ?? '', gps.alt ?? '',
            gps.speed2d ?? '', gps.speed3d ?? '',
            gps.days ?? '', gps.secs ?? '', gps.dop ?? '', gps.fix ?? '', gps.altSys ?? ''
        ];
        csv += row.join(',') + '\n';
    });
    return csv;
}

// --- CSV Processing ---
function processIncomingCSV(data) {
    const clean = [];
    let totalDist = 0;
    let startTime = null;
    if (data.length === 0) return;

    const keys = Object.keys(data[0]);
    const latKey = keys.find(k => k.toLowerCase().includes("lat"));
    const lonKey = keys.find(k => k.toLowerCase().includes("lon") || k.toLowerCase().includes("long"));
    const speedKey = keys.find(k => k.includes("2D") || k.toLowerCase().includes("speed") || k.includes("3D"));
    const timeKey = keys.find(k => k.toLowerCase().includes("date") || k.includes("cts") || k.toLowerCase().includes("time"));
    const acclXKey = keys.find(k => k === 'ACCL_x');
    const acclYKey = keys.find(k => k === 'ACCL_y');
    const acclZKey = keys.find(k => k === 'ACCL_z');

    if (!latKey || !lonKey) return;

    let prevLat = null, prevLon = null;
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const lat = parseFloat(row[latKey]);
        const lon = parseFloat(row[lonKey]);
        if (isNaN(lat) || isNaN(lon)) continue;

        let speedMS = parseFloat(row[speedKey] || 0);
        let speed = speedMS * 3.6;

        let timestamp = 0;
        if (row[timeKey]) {
            if (!isNaN(row[timeKey]) && row[timeKey] > 100000) {
                if (startTime === null) startTime = row[timeKey];
                timestamp = (row[timeKey] - startTime) / 1000;
            } else {
                const t = new Date(row[timeKey]).getTime();
                if (!isNaN(t)) {
                    if (startTime === null) startTime = t;
                    timestamp = (t - startTime) / 1000;
                } else { timestamp = i * 0.1; }
            }
        } else { timestamp = i * 0.1; }

        if (prevLat !== null) totalDist += getDistanceFromLatLonInM(prevLat, prevLon, lat, lon);

        // Calculate G-forces from accelerometer if available
        let latG = 0, lonG = 0;
        const ax = parseFloat(row[acclXKey]);
        const ay = parseFloat(row[acclYKey]);
        const az = parseFloat(row[acclZKey]);
        if (!isNaN(ax) && !isNaN(ay)) {
            latG = ay / 9.81;
            lonG = ax / 9.81;
        }

        clean.push({ index: i, lat, lon, speed, speedMS, time: timestamp, totalDistance: totalDist, rowId: i, latG, lonG });
        prevLat = lat; prevLon = lon;
    }

    if (clean.length === 0) return;
    rawData = clean;
    document.getElementById('draw-gate-btn').disabled = false;
    calculateDefaultSingleLap();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('telemetry:loaded', { detail: { rawData, lapsData } }));
    }
}

function calculateDefaultSingleLap() {
    if (!rawData || rawData.length === 0) return;
    const totalTime = rawData[rawData.length - 1].time || 0;
    lapsData = [{
        id: 1,
        startIndex: 0,
        endIndex: rawData.length - 1,
        lapTime: totalTime,
        sectors: [totalTime],
        isReference: true
    }];
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('laps:updated', { detail: { lapsData } }));
    }
}

// --- Video Extraction ---
async function extractTelemetryFromVideo(file) {
    if (!window.MP4Box) { alert("MP4Box is not available."); return; }
    const fileNameBase = file.name.replace(/\.[^/.]+$/, "");
    document.getElementById('filename-display').textContent = `Extracting ${file.name}`;
    document.getElementById('download-csv-btn').classList.add('hidden');

    const sensors = { ACCL: [], GYRO: [], GPS9: [], GRAV: [], CORI: [] };
    let gpmdTrackId = null;
    let timescale = 1000;

    const mp4box = MP4Box.createFile();
    const extractionPromise = new Promise((resolve, reject) => {
        mp4box.onReady = (info) => {
            const track = info.tracks.find(t => t.codec === 'gpmd');
            if (!track) { reject(new Error('No GPMD track found.')); return; }
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
            if (done) { mp4box.flush(); resolve(); return; }
            const buffer = value.buffer;
            buffer.fileStart = offset;
            offset += buffer.byteLength;
            mp4box.appendBuffer(buffer);
            await readChunk();
        };
        readChunk().catch(reject);
    });

    try { await extractionPromise; } catch (error) {
        console.error(error);
        alert(error.message || 'Telemetry extraction failed.');
        return;
    }

    telemetryCsvText = buildCombinedTelemetryCsv(sensors);
    telemetrySource = 'video';
    telemetryDownloadName = `${fileNameBase}_Full_Telemetry.csv`;
    document.getElementById('download-csv-btn').classList.remove('hidden');
    document.getElementById('filename-display').textContent = `${fileNameBase} • extracted`;

    Papa.parse(telemetryCsvText, {
        header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: (results) => processIncomingCSV(results.data),
        error: (err) => alert('Telemetry parsing failed: ' + err.message)
    });
}
