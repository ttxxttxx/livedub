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
    this._voiceId = config.voiceId ?? TTS_CONF.DEFAULT_VOICE; // 'auto' or specific name
    this._voice = null;
    this._pendingCount = 0;
    this._allVoices = [];
    this._initVoices();
  }

  _initVoices() {
    const select = () => {
      this._allVoices = speechSynthesis.getVoices();
      if (this._allVoices.length > 0) this._applyVoice();
    };
    select();
    speechSynthesis.addEventListener('voiceschanged', select);
  }

  /** Set voice by id ('auto' = best neural, or specific name like 'Microsoft Yunxi') */
  setVoice(voiceId) {
    this._voiceId = voiceId;
    this._applyVoice();
  }

  getVoice() { return this._voiceId; }
  getAvailableVoices() { return this._allVoices; }

  _applyVoice() {
    const voices = this._allVoices;
    if (!voices.length) return;

    // Diagnostic (once)
    if (!window.__livedub_tts_voices_logged) {
      window.__livedub_tts_voices_logged = true;
      const zh = voices.filter(v => v.lang.startsWith('zh'));
      console.log(`${LOG_PREFIX} [TTS] Available (${zh.length}): ${zh.map(v => v.name).join(', ')}`);
    }

    if (this._voiceId && this._voiceId !== 'auto') {
      let match = voices.find(v => v.name === this._voiceId);
      if (!match) match = voices.find(v => v.name.includes(this._voiceId) || this._voiceId.includes(v.name));
      if (match) {
        if (this._voice !== match) {
          this._voice = match;
          console.log(`${LOG_PREFIX} [TTS] ✓ ${match.name}`);
        }
        return;
      }
    }

    // Auto mode or voice not found: pick best neural voice
    const zh = voices.filter(v => v.lang.startsWith('zh'));
    const neural = zh.filter(v => v.name.includes('Natural') || v.name.includes('Online'));
    const pool = neural.length > 0 ? neural : zh;

    // Prefer Xiaoxiao (female) or Yunxi (male) as default, avoid Huihui
    const preferred = pool.find(v => v.name.includes('晓晓') || v.name.includes('Xiaoxiao')) ||
                      pool.find(v => v.name.includes('云希') || v.name.includes('Yunxi')) ||
                      pool.find(v => !v.name.includes('Huihui')) ||
                      pool[0];

    if (preferred && this._voice !== preferred) {
      this._voice = preferred;
      console.log(`${LOG_PREFIX} [TTS] Selected: ${preferred.name}`);
    }
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
