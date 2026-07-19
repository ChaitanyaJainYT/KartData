/**
 * KartData Mapping Module — Leaflet map, GPS track, gate drawing, position marker
 * Depends on: Leaflet (global L)
 */
import state from '../core/state.js';
import { detectLaps, computeCumulativeDistances } from '../core/math.js';

export class MappingModule {
  constructor() {
    this.map = null;
    this.tileLayer = null;
    this.trackPolyline = null;
    this.gatePolyline = null;
    this.ghostLine = null;
    this.positionMarker = null;
    this.gatePoints = [];
    this.isDrawing = false;
    this.lapLayer = null;
    this.startMarker = null;
    this.endMarker = null;
    this._gateResolve = null;
  }

  /**
   * Initialize Leaflet map in container element
   */
  init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('[Mapping] Container not found:', containerId);
      return;
    }

    this.map = L.map(container, {
      zoomControl: false,
      attributionControl: true,
    }).setView([0, 0], 2);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    this.tileLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }
    ).addTo(this.map);

    this.lapLayer = L.layerGroup().addTo(this.map);

    // Gate drawing events
    this.map.on('mousemove', (e) => this._onMouseMove(e));
    this.map.on('click', (e) => this._onClick(e));

    // Resize handler
    const ro = new ResizeObserver(() => {
      if (this.map) this.map.invalidateSize();
    });
    ro.observe(container);

    return this;
  }

  /**
   * Plot GPS track on the map
   */
  plotTrack(points) {
    if (!this.map || !points || points.length === 0) return;
    this.lapLayer.clearLayers();

    const latlngs = points.map(p => [p.lat, p.lon]);

    this.trackPolyline = L.polyline(latlngs, {
      color: '#b138ff',
      weight: 2,
      opacity: 0.8,
      smoothFactor: 1,
    }).addTo(this.lapLayer);

    // Start marker
    if (points.length > 0) {
      this.startMarker = L.circleMarker([points[0].lat, points[0].lon], {
        radius: 5,
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 1,
      }).addTo(this.lapLayer).bindTooltip('Start', { permanent: false, direction: 'top' });
    }

    // Fit bounds
    const bounds = L.latLngBounds(latlngs);
    this.map.fitBounds(bounds, { padding: [30, 30] });
  }

  /**
   * Highlight specific lap segments on the map
   */
  highlightLaps(laps, telemetry) {
    if (!this.map) return;
    this.lapLayer.clearLayers();

    if (!laps || laps.length === 0 || !telemetry || telemetry.length === 0) return;

    const colors = ['#00d2ff', '#ec4899', '#f97316', '#22c55e', '#e8ff00', '#b138ff', '#ef4444', '#3b82f6'];
    const boundsArr = [];

    laps.forEach((lap, idx) => {
      const pts = telemetry.slice(lap.startIndex, lap.endIndex + 1);
      if (pts.length < 2) return;
      const latlngs = pts.map(p => [p.lat, p.lon]);
      const color = colors[idx % colors.length];
      const poly = L.polyline(latlngs, {
        color,
        weight: lap.isReference ? 4 : 2.5,
        opacity: 0.9,
        smoothFactor: 1,
      }).addTo(this.lapLayer);

      latlngs.forEach(ll => boundsArr.push(ll));

      // Lap label
      if (latlngs.length > 0) {
        const mid = latlngs[Math.floor(latlngs.length / 2)];
        L.circleMarker(mid, {
          radius: 4,
          color,
          fillColor: color,
          fillOpacity: 0.8,
        }).addTo(this.lapLayer)
          .bindTooltip(`Lap ${lap.id}${lap.isReference ? ' (Ref)' : ''}`, { permanent: false, direction: 'top' });
      }
    });

    if (boundsArr.length > 0) {
      this.map.fitBounds(L.latLngBounds(boundsArr), { padding: [20, 20] });
    }
  }

  /**
   * Start gate drawing mode - returns promise that resolves with gate coords
   */
  startGateDrawing() {
    return new Promise((resolve) => {
      this.isDrawing = true;
      this.gatePoints = [];
      this._gateResolve = resolve;
      if (this.ghostLine) { this.map.removeLayer(this.ghostLine); this.ghostLine = null; }
      if (this.gatePolyline) { this.map.removeLayer(this.gatePolyline); this.gatePolyline = null; }
    });
  }

  cancelGateDrawing() {
    this.isDrawing = false;
    this.gatePoints = [];
    if (this.ghostLine) { this.map.removeLayer(this.ghostLine); this.ghostLine = null; }
    if (this.gatePolyline) { this.map.removeLayer(this.gatePolyline); this.gatePolyline = null; }
    this._gateResolve = null;
  }

  clearGate() {
    this.cancelGateDrawing();
  }

  _onMouseMove(e) {
    if (!this.isDrawing || this.gatePoints.length !== 1) return;
    if (this.ghostLine) this.map.removeLayer(this.ghostLine);
    this.ghostLine = L.polyline(
      [this.gatePoints[0], e.latlng],
      { color: '#ef4444', weight: 3, dashArray: '6,6', opacity: 0.6 }
    ).addTo(this.map);
  }

  _onClick(e) {
    if (!this.isDrawing) return;

    if (this.gatePoints.length === 0) {
      this.gatePoints.push(e.latlng);
    } else {
      this.gatePoints.push(e.latlng);
      this.isDrawing = false;

      if (this.ghostLine) { this.map.removeLayer(this.ghostLine); this.ghostLine = null; }

      this.gatePolyline = L.polyline(this.gatePoints, {
        color: '#ef4444',
        weight: 4,
        opacity: 1,
      }).addTo(this.map);

      const resolve = this._gateResolve;
      this._gateResolve = null;
      if (resolve) {
        resolve([[this.gatePoints[0].lat, this.gatePoints[0].lng],
                 [this.gatePoints[1].lat, this.gatePoints[1].lng]]);
      }
    }
  }

  /**
   * Update position marker for playback sync
   */
  updatePosition(lat, lon) {
    if (!this.map) return;
    if (this.positionMarker) {
      this.positionMarker.setLatLng([lat, lon]);
    } else {
      this.positionMarker = L.circleMarker([lat, lon], {
        radius: 6,
        color: '#e8ff00',
        fillColor: '#e8ff00',
        fillOpacity: 0.8,
        weight: 2,
      }).addTo(this.map);
    }
  }

  /**
   * Invalidate map size (call on panel resize)
   */
  invalidateSize() {
    if (this.map) this.map.invalidateSize();
  }
}
