/**
 * KartData Charts Module — Plotly telemetry visualizations
 * Depends on: Plotly (global)
 */
import state from '../core/state.js';
import { computeCumulativeDistances, smoothData, computeGGDiagram, computeSlipChart } from '../core/math.js';

const CHART_CONFIG = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: [
    'lasso2d', 'select2d', 'autoScale2d',
    'toggleSpikelines', 'hoverClosestCartesian',
    'hoverCompareCartesian',
  ],
  displaylogo: false,
};

const CHART_LAYOUT_BASE = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'JetBrains Mono, monospace', color: '#94a3b8', size: 9 },
  margin: { l: 50, r: 20, t: 30, b: 30 },
  xaxis: {
    gridcolor: '#2a3143',
    zerolinecolor: '#2a3143',
    linecolor: '#2a3143',
    tickfont: { size: 8 },
  },
  yaxis: {
    gridcolor: '#2a3143',
    zerolinecolor: '#2a3143',
    linecolor: '#2a3143',
    tickfont: { size: 8 },
  },
  hovermode: 'x unified',
  dragmode: 'pan',
  legend: {
    font: { size: 8, color: '#94a3b8' },
    bgcolor: 'rgba(21,25,36,0.8)',
    bordercolor: '#2a3143',
    borderwidth: 1,
  },
};

const LAP_COLORS = [
  '#00d2ff', '#ec4899', '#f97316', '#22c55e',
  '#e8ff00', '#b138ff', '#ef4444', '#3b82f6',
  '#84cc16', '#06b6d4', '#a855f7', '#14b8a6',
];

export class ChartsModule {
  constructor() {
    this.containerSpeedDist = null;
    this.containerSpeedTime = null;
    this.containerGG = null;
    this.containerSlip = null;
  }

  /**
   * Initialize chart containers
   */
  init(speedDistId, speedTimeId, ggId, slipId) {
    this.containerSpeedDist = document.getElementById(speedDistId);
    this.containerSpeedTime = document.getElementById(speedTimeId);
    this.containerGG = document.getElementById(ggId);
    this.containerSlip = document.getElementById(slipId);

    // Set up resize observers
    const observe = (el) => {
      if (!el) return;
      const ro = new ResizeObserver(() => {
        if (el.data && el.data.length) {
          try { Plotly.Plots.resize(el); } catch (e) {}
        }
      });
      ro.observe(el);
    };
    observe(this.containerSpeedDist);
    observe(this.containerSpeedTime);
    observe(this.containerGG);
    observe(this.containerSlip);
  }

  /**
   * Render Speed vs Distance chart
   */
  renderSpeedDistance(laps, telemetry, smoothing = 0) {
    if (!this.containerSpeedDist || !laps || laps.length === 0) return;

    const traces = [];
    let maxDist = 0;

    laps.forEach((lap, idx) => {
      const pts = telemetry.slice(lap.startIndex, lap.endIndex + 1);
      if (pts.length < 2) return;

      const dist = pts.map(p => p.cumulativeDist);
      const speed = smoothData(pts.map(p => p.speedKmh), smoothing);
      const normalizedDist = dist.map(d => d - dist[0]);

      if (normalizedDist[normalizedDist.length - 1] > maxDist) {
        maxDist = normalizedDist[normalizedDist.length - 1];
      }

      traces.push({
        x: normalizedDist,
        y: speed,
        type: 'scattergl',
        mode: 'lines',
        name: `Lap ${lap.id}${lap.isReference ? ' (Ref)' : ''}`,
        line: {
          color: lap.isReference ? '#b138ff' : LAP_COLORS[idx % LAP_COLORS.length],
          width: lap.isReference ? 2.5 : 1.5,
        },
        hovertemplate: 'Dist: %{x:.0f}m<br>Speed: %{y:.1f} km/h<extra></extra>',
      });
    });

    const layout = {
      ...CHART_LAYOUT_BASE,
      title: { text: 'Speed vs Distance', font: { size: 10, color: '#94a3b8' } },
      xaxis: { ...CHART_LAYOUT_BASE.xaxis, title: { text: 'Distance (m)', font: { size: 9 } } },
      yaxis: { ...CHART_LAYOUT_BASE.yaxis, title: { text: 'Speed (km/h)', font: { size: 9 } } },
      shapes: [],
    };

    // Current time indicator line
    const currentTime = state.session.currentPlaybackTime;
    if (currentTime > 0 && telemetry.length > 0) {
      const idx = this._findIndex(telemetry, currentTime);
      if (idx >= 0) {
        const dist = telemetry[idx].cumulativeDist;
        layout.shapes.push({
          type: 'line',
          x0: dist, y0: 0, x1: dist, y1: 1,
          yref: 'paper',
          line: { color: '#e8ff00', width: 1, dash: 'dot' },
        });
      }
    }

    Plotly.newPlot(this.containerSpeedDist, traces, layout, CHART_CONFIG);
  }

  /**
   * Render Speed vs Time chart
   */
  renderSpeedTime(laps, telemetry, smoothing = 0) {
    if (!this.containerSpeedTime || !laps || laps.length === 0) return;

    const traces = [];

    laps.forEach((lap, idx) => {
      const pts = telemetry.slice(lap.startIndex, lap.endIndex + 1);
      if (pts.length < 2) return;

      const time = pts.map(p => p.time - pts[0].time);
      const speed = smoothData(pts.map(p => p.speedKmh), smoothing);

      traces.push({
        x: time,
        y: speed,
        type: 'scattergl',
        mode: 'lines',
        name: `Lap ${lap.id}${lap.isReference ? ' (Ref)' : ''}`,
        line: {
          color: lap.isReference ? '#b138ff' : LAP_COLORS[idx % LAP_COLORS.length],
          width: lap.isReference ? 2.5 : 1.5,
        },
        hovertemplate: 'Time: %{x:.1f}s<br>Speed: %{y:.1f} km/h<extra></extra>',
      });
    });

    const layout = {
      ...CHART_LAYOUT_BASE,
      title: { text: 'Speed vs Time', font: { size: 10, color: '#94a3b8' } },
      xaxis: { ...CHART_LAYOUT_BASE.xaxis, title: { text: 'Time (s)', font: { size: 9 } } },
      yaxis: { ...CHART_LAYOUT_BASE.yaxis, title: { text: 'Speed (km/h)', font: { size: 9 } } },
      shapes: [],
    };

    const currentTime = state.session.currentPlaybackTime;
    if (currentTime > 0) {
      const lapTime = currentTime - (telemetry[0]?.time || 0);
      layout.shapes.push({
        type: 'line',
        x0: lapTime, y0: 0, x1: lapTime, y1: 1,
        yref: 'paper',
        line: { color: '#e8ff00', width: 1, dash: 'dot' },
      });
    }

    Plotly.newPlot(this.containerSpeedTime, traces, layout, CHART_CONFIG);
  }

  /**
   * Update crosshair line position on both charts
   */
  updateCrosshairs(time, telemetry) {
    if (!telemetry || telemetry.length === 0) return;

    // Speed-Distance
    if (this.containerSpeedDist && this.containerSpeedDist._fullLayout) {
      const idx = this._findIndex(telemetry, time);
      if (idx >= 0) {
        const dist = telemetry[idx].cumulativeDist;
        const distLayout = {
          ...this.containerSpeedDist._fullLayout,
          shapes: [{
            type: 'line',
            x0: dist, y0: 0, x1: dist, y1: 1,
            yref: 'paper',
            line: { color: '#e8ff00', width: 1, dash: 'dot' },
          }],
        };
        Plotly.relayout(this.containerSpeedDist, { shapes: distLayout.shapes });
      }
    }

    // Speed-Time
    if (this.containerSpeedTime && this.containerSpeedTime._fullLayout) {
      const lapTime = time - (telemetry[0]?.time || 0);
      const timeLayout = {
        shapes: [{
          type: 'line',
          x0: lapTime, y0: 0, x1: lapTime, y1: 1,
          yref: 'paper',
          line: { color: '#e8ff00', width: 1, dash: 'dot' },
        }],
      };
      Plotly.relayout(this.containerSpeedTime, timeLayout);
    }
  }

  /**
   * Render G-G Friction Circle
   */
  renderGG(laps, telemetry) {
    if (!this.containerGG || !laps || laps.length === 0) return;

    const traces = [];
    laps.forEach((lap, idx) => {
      const pts = telemetry.slice(lap.startIndex, lap.endIndex + 1);
      if (pts.length < 5) return;
      const gg = computeGGDiagram(pts);
      if (gg.length < 2) return;

      traces.push({
        x: gg.map(d => d.lonG),
        y: gg.map(d => d.latG),
        mode: 'markers',
        type: 'scattergl',
        name: `Lap ${lap.id}${lap.isReference ? ' (Ref)' : ''}`,
        marker: {
          size: 2.5,
          color: lap.isReference ? '#b138ff' : LAP_COLORS[idx % LAP_COLORS.length],
          opacity: 0.6,
        },
        hovertemplate: 'LonG: %{x:.2f}g<br>LatG: %{y:.2f}g<extra></extra>',
      });
    });

    const layout = {
      ...CHART_LAYOUT_BASE,
      title: { text: 'G-G Friction Circle', font: { size: 10, color: '#94a3b8' } },
      xaxis: { ...CHART_LAYOUT_BASE.xaxis, title: { text: 'Longitudinal G', font: { size: 9 } }, range: [-2, 2] },
      yaxis: { ...CHART_LAYOUT_BASE.yaxis, title: { text: 'Lateral G', font: { size: 9 } }, range: [-2, 2] },
      hovermode: 'closest',
      shapes: [
        { type: 'line', x0: -2, y0: 0, x1: 2, y1: 0, line: { color: '#2a3143', width: 1 } },
        { type: 'line', x0: 0, y0: -2, x1: 0, y1: 2, line: { color: '#2a3143', width: 1 } },
      ],
    };
    Plotly.newPlot(this.containerGG, traces, layout, CHART_CONFIG);
  }

  /**
   * Render Slip Chart (time delta between reference and comparison laps)
   */
  renderSlipChart(laps, telemetry) {
    if (!this.containerSlip || !laps || laps.length < 2) return this._clearSlipChart();

    const ref = laps.find(l => l.isReference);
    const others = laps.filter(l => !l.isReference);
    if (!ref || others.length === 0) return this._clearSlipChart();

    const refPts = telemetry.slice(ref.startIndex, ref.endIndex + 1);
    if (refPts.length < 2) return;

    const traces = [];
    others.forEach((lap, idx) => {
      const compPts = telemetry.slice(lap.startIndex, lap.endIndex + 1);
      if (compPts.length < 2) return;
      const slip = computeSlipChart(refPts, compPts);
      if (slip.length < 2) return;

      traces.push({
        x: slip.map(d => d.distance),
        y: slip.map(d => d.delta),
        type: 'scattergl',
        mode: 'lines',
        name: `Lap ${lap.id} vs Ref`,
        line: {
          color: LAP_COLORS[idx % LAP_COLORS.length],
          width: 1.5,
        },
        fill: 'tozeroy',
        fillcolor: `${LAP_COLORS[idx % LAP_COLORS.length]}22`,
        hovertemplate: 'Dist: %{x:.0f}m<br>Delta: %{y:.2f}s<extra></extra>',
      });
    });

    const layout = {
      ...CHART_LAYOUT_BASE,
      title: { text: 'Slip Chart (Time Delta)', font: { size: 10, color: '#94a3b8' } },
      xaxis: { ...CHART_LAYOUT_BASE.xaxis, title: { text: 'Distance (m)', font: { size: 9 } } },
      yaxis: { ...CHART_LAYOUT_BASE.yaxis, title: { text: 'Delta (s)', font: { size: 9 } } },
      hovermode: 'x unified',
    };
    Plotly.newPlot(this.containerSlip, traces, layout, CHART_CONFIG);
  }

  _clearSlipChart() {
    if (this.containerSlip && this.containerSlip.data && this.containerSlip.data.length) {
      Plotly.purge(this.containerSlip);
    }
  }

  /**
   * Clear all charts
   */
  clear() {
    if (this.containerSpeedDist) Plotly.purge(this.containerSpeedDist);
    if (this.containerSpeedTime) Plotly.purge(this.containerSpeedTime);
    if (this.containerGG) Plotly.purge(this.containerGG);
    if (this.containerSlip) Plotly.purge(this.containerSlip);
  }

  _findIndex(telemetry, time) {
    let lo = 0, hi = telemetry.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (telemetry[mid].time <= time) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}
