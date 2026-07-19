/**
 * KartData Extractor — CSV parsing & MP4 GPMD extraction
 * Depends on: PapaParse (global), MP4Box (global)
 */
import state from '../core/state.js';
import { haversineDistance } from '../core/math.js';

const TELEMETRY_HEADERS = [
  'cts', 'date',
  'ACCL_x', 'ACCL_y', 'ACCL_z', 'temp_ACCL',
  'GYRO_x', 'GYRO_y', 'GYRO_z', 'temp_GYRO',
  'GRAV_x', 'GRAV_y', 'GRAV_z',
  'CORI_w', 'CORI_x', 'CORI_y', 'CORI_z',
  'GPS (Lat.) [deg]', 'GPS (Long.) [deg]', 'GPS (Alt.) [m]',
  'GPS (2D) [m/s]', 'GPS (3D) [m/s]',
  'GPS (days) [deg]', 'GPS (secs) [s]',
  'GPS (DOP) [deg]', 'GPS (fix) [deg]',
  'altitude system'
];

/**
 * Validate file type before processing
 */
export function validateFile(file) {
  const validTypes = [
    'text/csv',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'application/octet-stream',
  ];
  const validExts = ['.csv', '.mp4', '.mov', '.avi'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Please upload CSV, MP4, MOV, or AVI files.`);
  }
  // Check magic bytes for executables
  return true;
}

/**
 * Parse a CSV file into normalized TelemetryPoint array
 */
export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    if (!window.Papa) {
      reject(new Error('PapaParse library not loaded'));
      return;
    }
    state.setMeta({ fileName: file.name, source: 'csv' });
    window.Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          console.warn('[Extractor] CSV parse warnings:', results.errors);
        }
        const points = normalizeCSVData(results.data);
        resolve(points);
      },
      error: (err) => reject(new Error('CSV parse failed: ' + err.message)),
    });
  });
}

/**
 * Normalize raw CSV rows into TelemetryPoint format with derived fields
 */
function normalizeCSVData(rows) {
  if (!rows || rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  const latKey = keys.find(k => k.toLowerCase().includes('lat'));
  const lonKey = keys.find(k => k.toLowerCase().includes('lon') || k.toLowerCase().includes('long'));
  const speed2dKey = keys.find(k => k.includes('2D'));
  const speed3dKey = keys.find(k => k.includes('3D'));
  const ctsKey = keys.find(k => k.toLowerCase() === 'cts');
  const dateKey = keys.find(k => k.toLowerCase() === 'date');

  const points = [];
  let prevLat = null, prevLon = null;
  let cumulativeDist = 0;
  let startCts = null;

  for (const row of rows) {
    const lat = parseFloat(row[latKey]);
    const lon = parseFloat(row[lonKey]);
    if (isNaN(lat) || isNaN(lon)) continue;

    const cts = ctsKey ? parseFloat(row[ctsKey]) : null;
    if (startCts === null && cts !== null) startCts = cts;

    if (prevLat !== null) {
      cumulativeDist += haversineDistance(prevLat, prevLon, lat, lon);
    }
    prevLat = lat;
    prevLon = lon;

    const point = {
      cts: cts !== null ? cts : 0,
      date: dateKey ? (row[dateKey] || '') : '',
      accelX: parseFloat(row['ACCL_x']) || 0,
      accelY: parseFloat(row['ACCL_y']) || 0,
      accelZ: parseFloat(row['ACCL_z']) || 0,
      tempAccel: parseFloat(row['temp_ACCL']) || null,
      gyroX: parseFloat(row['GYRO_x']) || 0,
      gyroY: parseFloat(row['GYRO_y']) || 0,
      gyroZ: parseFloat(row['GYRO_z']) || 0,
      tempGyro: parseFloat(row['temp_GYRO']) || null,
      gravX: parseFloat(row['GRAV_x']) || 0,
      gravY: parseFloat(row['GRAV_y']) || 0,
      gravZ: parseFloat(row['GRAV_z']) || 0,
      coriW: parseFloat(row['CORI_w']) || 0,
      coriX: parseFloat(row['CORI_x']) || 0,
      coriY: parseFloat(row['CORI_y']) || 0,
      coriZ: parseFloat(row['CORI_z']) || 0,
      lat,
      lon,
      alt: parseFloat(row['GPS (Alt.) [m]']) || 0,
      speed2d: parseFloat(row[speed2dKey]) || 0,
      speed3d: parseFloat(row[speed3dKey]) || 0,
      gpsDays: parseFloat(row['GPS (days) [deg]']) || 0,
      gpsSecs: parseFloat(row['GPS (secs) [s]']) || 0,
      gpsDop: parseFloat(row['GPS (DOP) [deg]']) || 0,
      gpsFix: parseFloat(row['GPS (fix) [deg]']) || 0,
      altSystem: row['altitude system'] || 'MSLV',
      // Derived fields
      speedKmh: (parseFloat(row[speed2dKey]) || 0) * 3.6,
      cumulativeDist,
      time: cts !== null ? (cts - (startCts || 0)) / 1000 : 0,
      timestamp: cts !== null ? cts / 1000 : 0,
    };
    points.push(point);
  }
  return points;
}

/**
 * Extract telemetry from MP4 file using MP4Box
 */
export function extractFromMP4(file) {
  return new Promise((resolve, reject) => {
    if (!window.MP4Box) {
      reject(new Error('MP4Box library not loaded'));
      return;
    }
    state.setMeta({ fileName: file.name, source: 'video' });

    const sensors = { ACCL: [], GYRO: [], GPS9: [], GRAV: [], CORI: [] };
    let gpmdTrackId = null;
    let timescale = 1000;
    let sampleCount = 0;

    const mp4box = window.MP4Box.createFile();
    let resolved = false;

    mp4box.onReady = (info) => {
      const track = info.tracks.find(t => t.codec === 'gpmd');
      if (!track) {
        reject(new Error('No GPMD telemetry track found in video'));
        return;
      }
      gpmdTrackId = track.id;
      timescale = track.timescale;
      mp4box.setExtractionOptions(gpmdTrackId);
      mp4box.start();
    };

    mp4box.onError = (err) => {
      if (!resolved) reject(new Error('MP4Box error: ' + err));
    };

    mp4box.onSamples = (id, user, samples) => {
      if (id !== gpmdTrackId) return;
      sampleCount += samples.length;
      samples.forEach(sample => {
        const ctsMs = (sample.cts / timescale) * 1000;
        const durMs = (sample.duration / timescale) * 1000;
        parseGPMDSample(sample.data, ctsMs, durMs, sensors);
      });
    };

    const reader = file.stream().getReader();
    let offset = 0;

    const readChunk = async () => {
      try {
        const { done, value } = await reader.read();
        if (done) {
          mp4box.flush();
          if (!resolved) {
            resolved = true;
            const points = mergeSensors(sensors);
            resolve(points);
          }
          return;
        }
        const buffer = value.buffer;
        buffer.fileStart = offset;
        offset += buffer.byteLength;
        mp4box.appendBuffer(buffer);
        readChunk();
      } catch (err) {
        if (!resolved) { resolved = true; reject(err); }
      }
    };
    readChunk();
  });
}

/**
 * Parse GPMD binary data into sensor arrays
 */
function parseGPMDSample(data, baseCts, duration, sensors) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let currentTemp = null;

  const parse = (start, end) => {
    let i = start;
    while (i <= end - 8) {
      const fourcc = String.fromCharCode(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
      const type = String.fromCharCode(buf[i + 4]);
      const size = buf[i + 5];
      const count = view.getUint16(i + 6);
      const pSize = size * count;
      const pOff = i + 8;

      if (fourcc === 'DEVC' || fourcc === 'STRM') {
        parse(pOff, pOff + pSize);
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
            y: isFloat ? view.getFloat32(o + 4) : view.getInt16(o + 2) / 100,
            z: isFloat ? view.getFloat32(o + 8) : view.getInt16(o + 4) / 100,
            temp: currentTemp,
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
            y: isFloat ? view.getFloat32(o + 4) : view.getInt16(o + 2) / 1000,
            z: isFloat ? view.getFloat32(o + 8) : view.getInt16(o + 4) / 1000,
            temp: currentTemp,
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
            y: isFloat ? view.getFloat32(o + 4) : view.getInt16(o + 2) / 4096,
            z: isFloat ? view.getFloat32(o + 8) : view.getInt16(o + 4) / 4096,
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
            x: isFloat ? view.getFloat32(o + 4) : view.getInt16(o + 2) / 32767,
            y: isFloat ? view.getFloat32(o + 8) : view.getInt16(o + 4) / 32767,
            z: isFloat ? view.getFloat32(o + 12) : view.getInt16(o + 6) / 32767,
          });
        }
      } else if (fourcc === 'GPS9') {
        const gpsSamples = Math.floor(pSize / 32);
        for (let c = 0; c < gpsSamples; c++) {
          const o = pOff + c * 32;
          sensors.GPS9.push({
            ts: baseCts + c * (duration / gpsSamples),
            lat: view.getInt32(o) / 10000000,
            lon: view.getInt32(o + 4) / 10000000,
            alt: view.getInt32(o + 8) / 1000,
            speed2d: view.getInt32(o + 12) / 1000,
            speed3d: view.getInt32(o + 16) / 1000,
            days: view.getUint32(o + 20),
            secs: view.getUint32(o + 24) / 1000,
            dop: view.getUint16(o + 28) / 100,
            fix: view.getUint16(o + 30),
            altSys: 'MSLV',
          });
        }
      }
      i += 8 + Math.ceil(pSize / 4) * 4;
    }
  };
  parse(0, data.byteLength);
}

/**
 * Merge sensor arrays into unified TelemetryPoint array by timestamp
 */
function mergeSensors(sensors) {
  const allTs = new Set();
  Object.values(sensors).forEach(arr => arr.forEach(p => allTs.add(p.ts.toFixed(6))));
  const sortedTs = Array.from(allTs).sort((a, b) => parseFloat(a) - parseFloat(b));

  const maps = {};
  Object.keys(sensors).forEach(k => {
    maps[k] = new Map(sensors[k].map(p => [p.ts.toFixed(6), p]));
  });

  const gpsBaseDate = new Date(Date.UTC(2000, 0, 1));
  let currentDateStr = '';
  let cumulativeDist = 0;
  let prevLat = null, prevLon = null;
  const points = [];

  for (const ts of sortedTs) {
    const a = maps.ACCL.get(ts) || {};
    const g = maps.GYRO.get(ts) || {};
    const grav = maps.GRAV.get(ts) || {};
    const cori = maps.CORI.get(ts) || {};
    const gps = maps.GPS9.get(ts) || {};

    if (gps.days !== undefined && gps.secs !== undefined) {
      const d = new Date(gpsBaseDate.getTime() + (gps.days * 86400000) + (gps.secs * 1000));
      currentDateStr = d.toISOString();
    }

    const lat = gps.lat;
    const lon = gps.lon;
    if (lat !== undefined && lon !== undefined && prevLat !== null) {
      cumulativeDist += haversineDistance(prevLat, prevLon, lat, lon);
    }
    if (lat !== undefined) { prevLat = lat; prevLon = lon; }

    const cts = parseFloat(ts);
    points.push({
      cts,
      date: currentDateStr,
      accelX: a.x || 0, accelY: a.y || 0, accelZ: a.z || 0, tempAccel: a.temp ?? null,
      gyroX: g.x || 0, gyroY: g.y || 0, gyroZ: g.z || 0, tempGyro: g.temp ?? null,
      gravX: grav.x || 0, gravY: grav.y || 0, gravZ: grav.z || 0,
      coriW: cori.w || 0, coriX: cori.x || 0, coriY: cori.y || 0, coriZ: cori.z || 0,
      lat: gps.lat || 0, lon: gps.lon || 0, alt: gps.alt || 0,
      speed2d: gps.speed2d || 0, speed3d: gps.speed3d || 0,
      gpsDays: gps.days || 0, gpsSecs: gps.secs || 0,
      gpsDop: gps.dop || 0, gpsFix: gps.fix || 0, altSystem: gps.altSys || 'MSLV',
      speedKmh: (gps.speed2d || 0) * 3.6,
      cumulativeDist,
      time: cts / 1000,
      timestamp: cts / 1000,
    });
  }
  return points;
}

/**
 * Generate CSV string in the target schema format
 */
export function generateCSV(points) {
  let csv = TELEMETRY_HEADERS.join(',') + '\n';
  const gpsBaseDate = new Date(Date.UTC(2000, 0, 1));
  let currentDateStr = '';

  for (const p of points) {
    if (p.gpsDays && p.gpsSecs) {
      const d = new Date(gpsBaseDate.getTime() + (p.gpsDays * 86400000) + (p.gpsSecs * 1000));
      currentDateStr = d.toISOString();
    }
    const row = [
      p.cts ?? '', currentDateStr || p.date || '',
      p.accelX ?? '', p.accelY ?? '', p.accelZ ?? '', p.tempAccel ?? '',
      p.gyroX ?? '', p.gyroY ?? '', p.gyroZ ?? '', p.tempGyro ?? '',
      p.gravX ?? '', p.gravY ?? '', p.gravZ ?? '',
      p.coriW ?? '', p.coriX ?? '', p.coriY ?? '', p.coriZ ?? '',
      p.lat ?? '', p.lon ?? '', p.alt ?? '',
      p.speed2d ?? '', p.speed3d ?? '',
      p.gpsDays ?? '', p.gpsSecs ?? '', p.gpsDop ?? '', p.gpsFix ?? '',
      p.altSystem ?? 'MSLV',
    ];
    csv += row.join(',') + '\n';
  }
  return csv;
}
