// LiveDub — Text-to-Speech Engine
// Wraps the browser's built-in speechSynthesis API.
// Manages voice selection, volume, rate, and queuing.

import { TTS as TTS_CONF, STORAGE_KEYS, LOG_PREFIX } from '../../shared/constants.js';
import { getStored } from '../../shared/storage.js';

export class TtsEngine {
  constructor(config = {}) {
    this.volume = config.volume ?? TTS_CONF.DEFAULT_VOLUME;
    this.rate = config.rate ?? TTS_CONF.DEFAULT_RATE;
    this.pitch = config.pitch ?? TTS_CONF.DEFAULT_PITCH;
    this.lang = config.lang ?? TTS_CONF.DEFAULT_LANG;

    // The selected voice instance
    this._voice = null;

    // Promise that resolves when all pending speech is done
    this._pendingResolve = null;
    this._pendingCount = 0;

    // Initialize voices (may load async)
    this._initVoices();
  }

  /**
   * Initialize voice list. On Edge, voices may load asynchronously.
   */
  _initVoices() {
    const populate = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        this._selectBestVoice(voices);
      }
    };

    populate();

    // Listen for async voice loading (Edge behavior)
    speechSynthesis.addEventListener('voiceschanged', () => {
      const voices = speechSynthesis.getVoices();
      this._selectBestVoice(voices);
    });
  }

  /**
   * Select the best available Chinese voice.
   * Prioritizes Edge's Microsoft neural voices.
   */
  _selectBestVoice(voices) {
    if (!voices || voices.length === 0) return;

    // Try preferred voices in order
    for (const preferred of TTS_CONF.PREFERRED_VOICES) {
      const match = voices.find(v => v.name.includes(preferred));
      if (match) {
        this._voice = match;
        console.log(`${LOG_PREFIX} [TTS] Selected voice: ${match.name} (${match.lang})`);
        return;
      }
    }

    // Fallback: any Chinese voice
    const zhVoice = voices.find(v =>
      v.lang.startsWith('zh-CN') ||
      v.lang.startsWith('zh-Hans') ||
      v.lang === 'zh'
    );
    if (zhVoice) {
      this._voice = zhVoice;
      console.log(`${LOG_PREFIX} [TTS] Fallback voice: ${zhVoice.name} (${zhVoice.lang})`);
      return;
    }

    // Last resort: default voice
    console.warn(`${LOG_PREFIX} [TTS] No Chinese voice found, using default`);
  }

  /**
   * Speak a text string. Returns a Promise that resolves when speech ends.
   * Low-latency mode: if queue is too deep, cancel old utterances and only speak
   * the latest to avoid cascading delay.
   *
   * @param {string} text
   * @returns {Promise<void>}
   */
  speak(text) {
    return new Promise((resolve) => {
      if (!text || !text.trim()) {
        resolve();
        return;
      }

      // Queue management: if >5 pending, skip oldest to prevent
      // cascading delay (one-way broadcast, better to skip than lag)
      if (this._pendingCount > 5) {
        speechSynthesis.cancel();
        this._pendingCount = 0;
        console.log(`${LOG_PREFIX} [TTS] Queue purged (>5 pending)`);
      }

      this._pendingCount++;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.lang;
      utterance.volume = this.volume;
      utterance.rate = this.rate;
      utterance.pitch = this.pitch;

      if (this._voice) {
        utterance.voice = this._voice;
      }

      utterance.onend = () => {
        this._pendingCount--;
        resolve();
      };

      utterance.onerror = (e) => {
        this._pendingCount--;
        if (e.error !== 'canceled') {
          console.warn(`${LOG_PREFIX} [TTS] Error:`, e.error);
        }
        resolve();
      };

      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Stop all queued and in-progress speech immediately.
   */
  stop() {
    speechSynthesis.cancel();
    this._pendingCount = 0;
    console.log(`${LOG_PREFIX} [TTS] Stopped`);
  }

  /**
   * Pause current speech (resumable).
   */
  pause() {
    speechSynthesis.pause();
  }

  /**
   * Resume paused speech.
   */
  resume() {
    speechSynthesis.resume();
  }

  /**
   * Check if speech is currently active (speaking or queued).
   * @returns {boolean}
   */
  isSpeaking() {
    return speechSynthesis.speaking || this._pendingCount > 0;
  }

  /**
   * Get the number of pending utterances.
   * @returns {number}
   */
  get pendingCount() {
    return this._pendingCount;
  }

  // --- Configuration setters (used by UI) ---

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  setRate(r) {
    this.rate = Math.max(0.5, Math.min(2, r));
  }

  setPitch(p) {
    this.pitch = Math.max(0.5, Math.min(2, p));
  }

  setLang(lang) {
    this.lang = lang;
    // Re-select voice for new language
    this._selectBestVoice(speechSynthesis.getVoices());
  }

  /**
   * Reload settings from storage.
   */
  async reloadFromStorage() {
    this.volume = await getStored(STORAGE_KEYS.TTS_VOLUME, TTS_CONF.DEFAULT_VOLUME);
    this.rate = await getStored(STORAGE_KEYS.TTS_RATE, TTS_CONF.DEFAULT_RATE);
  }
}
