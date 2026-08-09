// LiveDub — Pipeline Orchestrator
// Transcript-First: timedtext data → batch translate → timed TTS playback
// DOM fallback when timedtext unavailable

import { TRANSLATION, LOG_PREFIX } from '../../shared/constants.js';
import { extractCaptions, segmentsToPhrases, waitForPlayerResponse, startDOMCaptionObserver } from '../capture/caption.js';
import { translate, hasApiKey } from './translator.js';
import { TtsEngine } from './tts.js';

const State = { IDLE: 'idle', WAITING: 'waiting', RUNNING: 'running' };

export class PipelineOrchestrator {
  constructor({ videoElement, config = {} }) {
    this.video = videoElement;
    this.state = State.IDLE;
    this.config = { fromLang: config.fromLang || 'en', toLang: config.toLang || 'zh-Hans' };
    this.tts = new TtsEngine({ volume: config.ttsVolume, rate: config.ttsRate, voiceId: config.voiceId });

    this._phrases = [];          // [{text, start, end}] — all phrases to speak
    this._phraseIdx = 0;        // current phrase index
    this._translated = new Map(); // index → translated text cache
    this._videoStartTime = 0;
    this._startRealTime = 0;
    this._domObserver = null;
    this._tickId = null;

    this.onStateChange = null;
    this.onError = null;
    this.onPhraseTranslated = null;

    this._onPlay = () => { this.tts?.resume(); };
    this._onPause = () => { this.tts?.pause(); };
    this._onSeeked = () => { this._phraseIdx = this._findPhraseIndex(this.video.currentTime); this.tts?.stop(); };
    this._onEnded = () => this.stop();
  }

  // ── Start ──────────────────────────────────────────────────

  async start() {
    if (this.state !== State.IDLE) return;
    console.log(`${LOG_PREFIX} [Pipeline] Starting...`);
    this._setState(State.WAITING);

    this.video.addEventListener('play', this._onPlay);
    this.video.addEventListener('pause', this._onPause);
    this.video.addEventListener('seeked', this._onSeeked);
    this.video.addEventListener('ended', this._onEnded);

    // Try Transcript-First
    let captionsOk = false;
    try {
      await waitForPlayerResponse();
      const segments = await extractCaptions();
      if (segments?.length) {
        this._phrases = segmentsToPhrases(segments);
        captionsOk = true;
        console.log(`${LOG_PREFIX} [Pipeline] Transcript: ${segments.length} segs → ${this._phrases.length} phrases`);
      }
    } catch (e) { console.warn(`${LOG_PREFIX} [Pipeline] Transcript failed:`, e); }

    if (!captionsOk) {
      // Fallback to DOM
      console.log(`${LOG_PREFIX} [Pipeline] Falling back to DOM observer`);
      this._domObserver = startDOMCaptionObserver(this.video, seg => {
        if (this.state === State.IDLE) return;
        this._phrases.push({ text: seg.text, start: seg.start, end: seg.start + (seg.duration || 2) });
      });
      if (!this._domObserver) {
        if (this.onError) this.onError(new Error('此视频无英文字幕'));
        this.stop(); return;
      }
      // Wait a moment for DOM captions to start accumulating
      await new Promise(r => setTimeout(r, 1000));
    }

    this._videoStartTime = this.video.currentTime;
    this._startRealTime = performance.now();
    this._setState(State.RUNNING);

    // Start playback loop (timed for transcript, polling for DOM)
    this._tick();
    // Start background translation
    this._translateAhead();
  }

  stop() {
    this.video.removeEventListener('play', this._onPlay);
    this.video.removeEventListener('pause', this._onPause);
    this.video.removeEventListener('seeked', this._onSeeked);
    this.video.removeEventListener('ended', this._onEnded);
    if (this._domObserver) { this._domObserver.stop(); this._domObserver = null; }
    if (this._tickId) { cancelAnimationFrame(this._tickId); this._tickId = null; }
    this.tts.stop();
    this._setState(State.IDLE);
    console.log(`${LOG_PREFIX} [Pipeline] Stopped`);
  }

  // ── Playback loop ──────────────────────────────────────────

  _tick() {
    if (this.state === State.IDLE) return;
    const now = performance.now();
    const elapsed = (now - this._startRealTime) / 1000;
    const videoTime = this._videoStartTime + elapsed;

    // Flush phrases whose time has come
    while (this._phraseIdx < this._phrases.length) {
      const p = this._phrases[this._phraseIdx];
      if (p.start <= videoTime) {
        this._flushPhrase(p);
        this._phraseIdx++;
      } else {
        break;
      }
    }

    this._tickId = requestAnimationFrame(() => this._tick());
  }

  _findPhraseIndex(videoTime) {
    for (let i = this._phrases.length - 1; i >= 0; i--) {
      if (this._phrases[i].start <= videoTime) return i;
    }
    return 0;
  }

  // ── Background translation ─────────────────────────────────

  async _translateAhead() {
    const BATCH = 5;
    while (this.state !== State.IDLE) {
      // Find next untranslated phrase within ~30s ahead
      const videoTime = this.video?.currentTime || 0;
      let batch = [];
      for (let i = this._phraseIdx; i < this._phrases.length && batch.length < BATCH; i++) {
        const p = this._phrases[i];
        if (!this._translated.has(i) && p.start <= videoTime + 30) {
          batch.push({ idx: i, text: p.text });
        }
      }
      if (batch.length === 0) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Translate batch
      const texts = batch.map(b => b.text);
      try {
        const results = await Promise.all(texts.map(t => translate(t, this.config.fromLang, this.config.toLang)));
        batch.forEach((b, j) => {
          this._translated.set(b.idx, results[j] || b.text);
        });
      } catch (e) {
        console.warn(`${LOG_PREFIX} [Pipeline] Batch translate failed:`, e);
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // ── Flush ──────────────────────────────────────────────────

  async _flushPhrase(phrase) {
    const text = phrase.text.trim();
    if (!text || text.length < 2) return;

    // Get translation (from cache or translate now)
    const idx = this._phraseIdx; // current phrase being flushed
    let translated = this._translated.get(idx);
    if (!translated) {
      try {
        translated = await translate(text, this.config.fromLang, this.config.toLang);
      } catch { translated = text; }
    }

    if (this.state === State.IDLE) return;

    if (this.onPhraseTranslated) {
      this.onPhraseTranslated({ original: text, translated, timestamp: phrase.start });
    }

    await this.tts.speak(translated);
  }

  // ── Helpers ────────────────────────────────────────────────

  _setState(s) {
    if (this.state !== s) {
      const old = this.state; this.state = s;
      if (this.onStateChange) this.onStateChange(s);
    }
  }

  getStats() {
    return { state: this.state, totalPhrases: this._phrases.length, processed: this._phraseIdx, pending: this.tts.pendingCount };
  }
}
