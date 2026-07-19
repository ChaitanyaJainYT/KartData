/**
 * KartData Math Engine — physics calculations, filtering, lap detection
 */

/**
 * Haversine distance between two GPS points in meters
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function deg2rad(deg) { return deg * (Math.PI / 180); }

/**
 * Simple moving average smoother
 */
export function smoothData(data, windowSize) {
  if (!windowSize || windowSize <= 0) return data;
  const result = [];
  for (let i = 0; i < data.length; i++) {
    let sum = 0, count = 0;
    for (let j = i - windowSize; j <= i + windowSize; j++) {
      if (j >= 0 && j < data.length) { sum += data[j]; count++; }
    }
    result.push(count > 0 ? sum / count : 0);
  }
  return result;
}

/**
 * Line segment intersection test (for gate/lap detection)
 * Returns true if segments (a,b) and (c,d) intersect
 */
export function lineSegmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const det = (bx - ax) * (dy - cy) - (dx - cx) * (by - ay);
  if (Math.abs(det) < 1e-12) return false;
  const t = ((cx - ax) * (dy - cy) + (cy - ay) * (dx - cx)) / det;
  const u = ((cx - ax) * (by - ay) + (cy - ay) * (ax - bx)) / det;
  return (t > 0 && t < 1) && (u > 0 && u < 1);
}

/**
 * Detect lap crossings given a gate line and GPS path
 * gateLine: [[lat1, lng1], [lat2, lng2]]
 * Returns array of {startIndex, endIndex}
 */
export function detectLaps(gpsPoints, gateLine) {
  if (!gpsPoints || gpsPoints.length < 2 || !gateLine || gateLine.length < 2) {
    return [];
  }
  const [g1, g2] = gateLine;
  const gLat1 = g1[0], gLng1 = g1[1];
  const gLat2 = g2[0], gLng2 = g2[1];

  const crossings = [];
  for (let i = 1; i < gpsPoints.length; i++) {
    const a = gpsPoints[i - 1], b = gpsPoints[i];
    if (lineSegmentsIntersect(a.lon, a.lat, b.lon, b.lat, gLng1, gLat1, gLng2, gLat2)) {
      if (crossings.length === 0 || i - crossings[crossings.length - 1] > 50) {
        crossings.push(i);
      }
    }
  }

  if (crossings.length < 2) return [];

  const laps = [];
  for (let i = 0; i < crossings.length - 1; i++) {
    laps.push({
      startIndex: crossings[i],
      endIndex: crossings[i + 1],
    });
  }
  return laps;
}

/**
 * Calculate cumulative distances for GPS path
 */
export function computeCumulativeDistances(points) {
  let total = 0;
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    distances.push(total);
  }
  return distances;
}

/**
 * Lateral G-force calculation (centripetal acceleration)
 * speed: m/s, radius: m
 * Returns G-force (where 1G = 9.81 m/s²)
 */
export function lateralG(speedMs, radius) {
  if (!radius || radius < 0.01) return 0;
  return (speedMs ** 2 / radius) / 9.81;
}

/**
 * Longitudinal G-force (acceleration / braking)
 * accelMs2: m/s²
 * Returns G-force
 */
export function longitudinalG(accelMs2) {
  return accelMs2 / 9.81;
}

/**
 * Estimate turn radius from three consecutive GPS points (in meters)
 */
export function estimateTurnRadius(p1, p2, p3) {
  const a = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
  const b = haversineDistance(p2.lat, p2.lon, p3.lat, p3.lon);
  const c = haversineDistance(p3.lat, p3.lon, p1.lat, p1.lon);
  if (a < 0.01 || b < 0.01 || c < 0.01) return Infinity;
  const s = (a + b + c) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
  if (area < 0.0001) return Infinity;
  return (a * b * c) / (4 * area);
}

/**
 * Format seconds to mm:ss.SSS
 */
export function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Compute slip chart data comparing reference lap to comparison lap
 * Returns array of {distance, delta}
 */
/**
 * Split a lap into equal-distance sectors
 * Returns array of sector boundary indices (3 sectors = 4 boundaries)
 */
export function computeSectors(points, numSectors = 3) {
  if (!points || points.length < 2) return [];
  const totalDist = points[points.length - 1].cumulativeDist - points[0].cumulativeDist;
  if (totalDist <= 0) return [points[0].cumulativeDist];

  const sectorDist = totalDist / numSectors;
  const boundaries = [points[0].cumulativeDist];
  let nextTarget = sectorDist;
  for (let i = 1; i < points.length && nextTarget < totalDist; i++) {
    if (points[i].cumulativeDist - points[0].cumulativeDist >= nextTarget) {
      boundaries.push(points[i].cumulativeDist);
      nextTarget += sectorDist;
    }
  }
  boundaries.push(points[points.length - 1].cumulativeDist);
  return boundaries;
}

/**
 * Compute G-G diagram data (lateral G vs longitudinal G)
 * Returns array of {latG, lonG, speedKmh, idx}
 */
export function computeGGDiagram(points, smoothingWindow = 3) {
  if (!points || points.length < 5) return [];
  const result = [];
  for (let i = 1; i < points.length - 1; i++) {
    const pPrev = points[i - 1];
    const pCurr = points[i];
    const pNext = points[i + 1];

    const radius = estimateTurnRadius(pPrev, pCurr, pNext);
    const speedMs = pCurr.speed2d || (pCurr.speedKmh / 3.6) || 0;
    const latG = lateralG(speedMs, radius);

    const dt = pNext.time - pPrev.time;
    const speedPrevMs = pPrev.speed2d || (pPrev.speedKmh / 3.6) || 0;
    const accel = dt > 0 ? (speedMs - speedPrevMs) / dt : 0;
    const lonG = longitudinalG(accel);

    if (isFinite(latG) && isFinite(lonG)) {
      result.push({ latG, lonG, speedKmh: pCurr.speedKmh, idx: i });
    }
  }
  return result;
}

export function computeSlipChart(reference, comparison, distanceField = 'cumulativeDist') {
  if (!reference || !comparison || reference.length < 2) return [];
  const deltas = [];
  let compIdx = 0;

  for (let i = 0; i < reference.length; i++) {
    const refDist = reference[i][distanceField] || 0;
    while (compIdx < comparison.length - 1
      && (comparison[compIdx + 1][distanceField] || 0) < refDist) {
      compIdx++;
    }
    if (compIdx < comparison.length) {
      const comp = comparison[compIdx];
      const delta = reference[i].time - comp.time;
      deltas.push({ distance: refDist, delta });
    }
  }
  return deltas;
}
