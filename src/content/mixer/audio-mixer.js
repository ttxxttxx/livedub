// LiveDub — Audio Mixer
// Controls original video volume. Tries captureStream first (avoids
// conflict with YouTube), falls back to video.volume property.

import { LOG_PREFIX } from '../../shared/constants.js';

export class AudioMixer {
  constructor(videoElement) {
    this.video = videoElement;
    this.ctx = null;
    this.source = null;
    this.gainNode = null;
    this._mixRatio = 0.3;
    this._active = false;
    this._fallbackMode = false;
  }

  init() {
    if (this._active) return !this._fallbackMode;

    // Try createMediaElementSource first (intercepts original audio)
    try {
      this.ctx = new AudioContext();
      this.source = this.ctx.createMediaElementSource(this.video);
      this.gainNode = this.ctx.createGain();
      this.source.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
      this.gainNode.gain.value = this._mixRatio;
      this._active = true;
      console.log(`${LOG_PREFIX} [Mixer] MediaElement OK (gain=${this._mixRatio})`);
      return true;
    } catch(e) { /* fall through */ }

    // Try captureStream + mute original
    try {
      const stream = this.video.captureStream();
      if (stream && stream.getAudioTracks().length > 0) {
        if (!this.ctx) this.ctx = new AudioContext();
        this.source = this.ctx.createMediaStreamSource(stream);
        this.gainNode = this.ctx.createGain();
        this.source.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);
        this.gainNode.gain.value = this._mixRatio;
        // Mute original — captureStream output is independent of muted state
        this.video.muted = true;
        this._active = true;
        this._captureMode = true;
        console.log(`${LOG_PREFIX} [Mixer] captureStream+mute OK (gain=${this._mixRatio})`);
        return true;
      }
    } catch(e) { /* fall through */ }

    // Fallback: control native volume (YouTube may reset it periodically)
    this._fallbackMode = true;
    this._active = true;
    this.video.volume = this._mixRatio;
    // Re-apply volume every 300ms (fights YouTube's resets)
    this._volInterval = setInterval(() => {
      if (this.video && this._active && this._fallbackMode) {
        this.video.volume = this._mixRatio;
      }
    }, 300);
    console.log(`${LOG_PREFIX} [Mixer] Fallback vol=${this._mixRatio}`);
    return false;
  }

  setMixRatio(ratio) {
    this._mixRatio = Math.max(0, Math.min(1, ratio));
    console.log(`${LOG_PREFIX} [Mixer] setMixRatio(${this._mixRatio.toFixed(2)}) fallback=${this._fallbackMode}`);
    if (this._fallbackMode) {
      if (this.video) this.video.volume = this._mixRatio;
    } else if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(this._mixRatio, this.ctx.currentTime, 0.05);
    }
  }

  getMixRatio() { return this._mixRatio; }

  mute() {
    if (this._savedRatio === undefined) {
      this._savedRatio = this._mixRatio;
    }
    this.setMixRatio(0);
  }
  unmute() {
    if (this._savedRatio !== undefined) {
      this.setMixRatio(this._savedRatio);
    }
  }

  destroy() {
    if (!this._active) return;
    if (this._volInterval) { clearInterval(this._volInterval); this._volInterval = null; }
    try {
      // Restore video audio
      if (this._captureMode && this.video) {
        this.video.muted = false;
      }
      if (this._fallbackMode && this.video) {
        this.video.volume = 1.0;
      }
      if (this.gainNode) this.gainNode.disconnect();
      if (this.source) this.source.disconnect();
      if (this.ctx) this.ctx.close();
    } catch(e) {}
    this._active = false;
    this.ctx = null;
    this.source = null;
    this.gainNode = null;
  }
}
