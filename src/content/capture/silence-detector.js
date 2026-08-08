// LiveDub — Silence Detector
// Monitors an AnalyserNode to detect speech/silence transitions.
// Triggers a callback when silence persists for the configured duration.
// Used by the audio ASR fallback path for phrase boundary detection.

import { SILENCE, LOG_PREFIX } from '../../shared/constants.js';

export class SilenceDetector {
  /**
   * @param {object} options
   * @param {AnalyserNode} options.analyserNode — Web Audio AnalyserNode
   * @param {Function} options.onSpeechStart — called when speech begins
   * @param {Function} options.onSpeechEnd — called when silence threshold met
   * @param {number} [options.threshold=SILENCE.THRESHOLD_DB] — dB threshold
   * @param {number} [options.silenceMs=300] — ms of silence to trigger end
   */
  constructor({
    analyserNode,
    onSpeechStart,
    onSpeechEnd,
    threshold = SILENCE.THRESHOLD_DB,
    silenceMs = SILENCE.SILENT_SAMPLES_REQUIRED * SILENCE.SAMPLE_INTERVAL_MS,
  }) {
    this.analyser = analyserNode;
    this._onSpeechStart = onSpeechStart || (() => {});
    this._onSpeechEnd = onSpeechEnd || (() => {});
    this.threshold = threshold;
    this.silenceMs = silenceMs;

    // State
    this._isRunning = false;
    this._isSpeaking = false;
    this._silentSamples = 0;
    this._sampleInterval = SILENCE.SAMPLE_INTERVAL_MS;
    this._timerId = null;

    // For computing RMS
    this._dataArray = new Uint8Array(this.analyser.fftSize || 2048);
  }

  /**
   * Start monitoring.
   */
  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._silentSamples = 0;
    this._isSpeaking = false;
    console.log(`${LOG_PREFIX} [Silence] Monitoring started (threshold=${this.threshold}dB, window=${this.silenceMs}ms)`);
    this._poll();
  }

  /**
   * Stop monitoring.
   */
  stop() {
    this._isRunning = false;
    if (this._timerId) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    // If we were speaking, flush
    if (this._isSpeaking) {
      this._isSpeaking = false;
      try { this._onSpeechEnd(); } catch (e) { /* noop */ }
    }
    console.log(`${LOG_PREFIX} [Silence] Monitoring stopped`);
  }

  /**
   * Poll the analyser node at configured interval.
   */
  _poll() {
    if (!this._isRunning) return;

    const db = this._computeRMSdB();

    if (db >= this.threshold) {
      // Speech detected
      this._silentSamples = 0;
      if (!this._isSpeaking) {
        this._isSpeaking = true;
        console.log(`${LOG_PREFIX} [Silence] Speech started (${db.toFixed(1)}dB)`);
        try { this._onSpeechStart(); } catch (e) { /* noop */ }
      }
    } else {
      // Silence
      if (this._isSpeaking) {
        this._silentSamples++;
        const silentDuration = this._silentSamples * this._sampleInterval;
        if (silentDuration >= this.silenceMs) {
          // Silence threshold met — phrase boundary
          this._isSpeaking = false;
          this._silentSamples = 0;
          console.log(`${LOG_PREFIX} [Silence] Speech ended (${silentDuration}ms silence)`);
          try { this._onSpeechEnd(); } catch (e) { /* noop */ }
        }
      }
    }

    this._timerId = setTimeout(() => this._poll(), this._sampleInterval);
  }

  /**
   * Compute RMS level in dB from the analyser's time-domain data.
   * @returns {number} dB value (typically -100 to 0)
   */
  _computeRMSdB() {
    this.analyser.getByteTimeDomainData(this._dataArray);

    // Compute RMS
    let sum = 0;
    for (let i = 0; i < this._dataArray.length; i++) {
      // Convert 0-255 to -1 to 1
      const val = (this._dataArray[i] - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / this._dataArray.length);

    // Convert to dB, avoid -Infinity
    if (rms < 1e-10) return -100;
    return 20 * Math.log10(rms);
  }

  /**
   * Update the silence threshold.
   */
  setThreshold(db) {
    this.threshold = db;
  }

  /**
   * Check if currently detecting speech.
   */
  isSpeaking() {
    return this._isSpeaking;
  }
}
