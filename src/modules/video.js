/**
 * KartData Video Module — video mounting, playback, sync
 */
import state from '../core/state.js';
import { formatTime } from '../core/math.js';

export class VideoModule {
  constructor() {
    this.videos = [];
    this.container = null;
  }

  /**
   * Initialize video container
   */
  init(containerId) {
    this.container = document.getElementById(containerId);
    return this;
  }

  /**
   * Mount a video file
   */
  mountVideo(file) {
    if (!this.container) return;

    const idx = this.videos.length;
    const url = URL.createObjectURL(file);

    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    wrapper.style.cssText = 'flex: 1; min-width: 280px; height: 100%; position: relative; background: #000; border-radius: 4px; overflow: hidden;';

    const vid = document.createElement('video');
    vid.src = url;
    vid.controls = false;
    vid.preload = 'auto';
    vid.playsInline = true;
    vid.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
    vid.addEventListener('loadedmetadata', () => {
      // Try to enable H.265 playback
      vid.playbackRate = state.session.isPlaying ? 1 : 1;
    });

    const label = document.createElement('div');
    label.style.cssText = 'position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.7); color: #94a3b8; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-family: JetBrains Mono, monospace;';
    label.textContent = file.name;

    wrapper.appendChild(vid);
    wrapper.appendChild(label);
    this.container.appendChild(wrapper);

    this.videos.push({ video: vid, url, file });
    return vid;
  }

  /**
   * Seek all videos to a specific time
   */
  seekTo(timeMs) {
    const offsetMs = state.session.videoOffsetMs || 0;
    const targetTime = Math.max(0, (timeMs - offsetMs) / 1000);
    this.videos.forEach(v => {
      if (isFinite(targetTime) && v.video.readyState >= 1) {
        v.video.currentTime = targetTime;
      }
    });
  }

  /**
   * Play/pause all videos
   */
  setPlaying(playing) {
    this.videos.forEach(v => {
      if (playing) {
        v.video.play().catch(() => {});
      } else {
        v.video.pause();
      }
    });
  }

  /**
   * Set playback rate for all videos
   */
  setPlaybackRate(rate) {
    this.videos.forEach(v => { v.video.playbackRate = rate; });
  }

  /**
   * Remove all videos
   */
  clear() {
    this.videos.forEach(v => {
      v.video.pause();
      v.video.src = '';
      URL.revokeObjectURL(v.url);
    });
    if (this.container) this.container.innerHTML = '';
    this.videos = [];
  }

  /**
   * Sync videos to current playback time from state
   */
  syncToState() {
    const time = state.session.currentPlaybackTime;
    this.seekTo(time * 1000);
  }
}
