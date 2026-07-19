/**
 * KartData State Manager — Pub/Sub reactive state
 */
class StateManager {
  constructor() {
    this._state = {
      telemetry: [],     // Array<TelemetryPoint>
      laps: [],          // Array<Lap>
      session: {
        referenceLapId: null,
        videoOffsetMs: 0,
        currentPlaybackTime: 0,
        totalDuration: 0,
        mode: 'distance', // 'distance' | 'time'
        isPlaying: false,
      },
      meta: {
        fileName: '',
        source: null,     // 'csv' | 'video'
        lapCount: 0,
      },
    };
    this._listeners = {};
    this._idCounter = 0;
  }

  // ---- Pub/Sub ----
  subscribe(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    const id = ++this._idCounter;
    return () => {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    };
  }

  _publish(event, data) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[State] Error in ${event}:`, e); }
    });
  }

  // ---- Getters ----
  get(key) {
    return key ? this._state[key] : this._state;
  }

  get telemetry() { return this._state.telemetry; }
  get laps() { return this._state.laps; }
  get session() { return this._state.session; }
  get meta() { return this._state.meta; }

  // ---- Telemetry ----
  setTelemetry(data) {
    this._state.telemetry = data;
    if (data.length > 0) {
      this._state.session.totalDuration = data[data.length - 1].cts / 1000;
    }
    this._publish('telemetry:loaded', data);
  }

  // ---- Laps ----
  setLaps(laps) {
    this._state.laps = laps;
    this._state.meta.lapCount = laps.length;
    this._publish('laps:updated', laps);
  }

  selectReferenceLap(lapId) {
    this._state.session.referenceLapId = lapId;
    this._state.laps.forEach(l => {
      l.isReference = (l.id === lapId);
    });
    this._publish('reference:changed', lapId);
  }

  // ---- Playback ----
  setPlaybackTime(time) {
    this._state.session.currentPlaybackTime = time;
    this._publish('playback:tick', time);
  }

  setPlaying(playing) {
    this._state.session.isPlaying = playing;
    this._publish('playback:playing', playing);
  }

  setMode(mode) {
    this._state.session.mode = mode;
    this._publish('playback:mode', mode);
  }

  setVideoOffset(offset) {
    this._state.session.videoOffsetMs = offset;
  }

  // ---- Meta ----
  setMeta(meta) {
    Object.assign(this._state.meta, meta);
    this._publish('meta:updated', this._state.meta);
  }

  // ---- Reset ----
  reset() {
    this._state.telemetry = [];
    this._state.laps = [];
    this._state.session.referenceLapId = null;
    this._state.session.currentPlaybackTime = 0;
    this._state.session.totalDuration = 0;
    this._state.session.isPlaying = false;
    this._state.meta = { fileName: '', source: null, lapCount: 0 };
    this._publish('state:reset', null);
  }
}

// Singleton
const state = new StateManager();
export default state;
