// LiveDub — Pipeline Orchestrator
// Coordinates the entire translation pipeline:
//   Caption Extraction → Phrase Boundary Detection → Translation → TTS
//
// State machine:
//   IDLE → WAITING → CAPTURING → TRANSLATING → SPEAKING → CAPTURING ...
//
// Also handles the audio fallback path when captions are unavailable.

import { TRANSLATION, LOG_PREFIX } from '../../shared/constants.js';
import { extractCaptions, segmentsToPhrases, waitForPlayerResponse, startDOMCaptionObserver } from '../capture/caption.js';
import { translate, hasApiKey } from './translator.js';
import { TtsEngine } from './tts.js';

// Orchestrator states
const State = {
  IDLE: 'idle',
  WAITING: 'waiting',       // Waiting for video/captions to be ready
  CAPTURING: 'capturing',   // Extracting caption segments
  TRANSLATING: 'translating',
  SPEAKING: 'speaking',
};

export class PipelineOrchestrator {
  /**
   * @param {object} options
   * @param {HTMLVideoElement} options.videoElement — the YouTube video element
   * @param {object} [options.config] — initial config overrides
   */
  constructor({ videoElement, config = {} }) {
    this.video = videoElement;
    this.state = State.IDLE;
    this.config = {
      fromLang: config.fromLang || TRANSLATION.FROM_LANG,
      toLang: config.toLang || TRANSLATION.TO_LANG,
      ...config,
    };

    // Components
    this.tts = new TtsEngine({
      volume: config.ttsVolume,
      rate: config.ttsRate,
    });

    // Caption data
    this._allSegments = [];     // All parsed caption segments
    this._phrases = [];         // Segments grouped into phrases
    this._phraseIndex = 0;      // Current position in phrases array

    // Timing
    this._startTime = 0;        // When the pipeline started (performance.now() ref)
    this._videoStartTime = 0;   // video.currentTime when pipeline started
    this._lastFlushTime = 0;    // Last phrase flush timestamp

    // Audio fallback
    this._audioCapture = null;  // AudioCapture instance (set by content/index.js)

    // Callbacks
    this.onStateChange = null;  // (newState) => void
    this.onPhraseTranslated = null; // ({original, translated, timestamp}) => void
    this.onError = null;        // (error) => void

    // Bound methods
    this._onVideoPlay = this._onVideoPlay.bind(this);
    this._onVideoPause = this._onVideoPause.bind(this);
    this._onVideoSeek = this._onVideoSeek.bind(this);
    this._onVideoEnded = this._onVideoEnded.bind(this);
  }

  /**
   * Start the translation pipeline.
   * @returns {Promise<void>}
   */
  async start() {
    if (this.state !== State.IDLE) {
      console.warn(`${LOG_PREFIX} [Pipeline] Cannot start — already running (state: ${this.state})`);
      return;
    }

    console.log(`${LOG_PREFIX} [Pipeline] Starting...`);
    this._setState(State.WAITING);

    // Bind video events
    this.video.addEventListener('play', this._onVideoPlay);
    this.video.addEventListener('pause', this._onVideoPause);
    this.video.addEventListener('seeked', this._onVideoSeek);
    this.video.addEventListener('ended', this._onVideoEnded);

    // Check if API key is configured
    const hasKey = await hasApiKey();
    if (!hasKey) {
      console.warn(`${LOG_PREFIX} [Pipeline] No API key configured — mock mode (TTS reads English text directly)`);
    }

    // Try primary path: YouTube captions
    let captionsAvailable = false;

    try {
      await waitForPlayerResponse();
      const segments = await extractCaptions();

      if (segments && segments.length > 0) {
        this._allSegments = segments;
        this._phrases = segmentsToPhrases(segments);
        this._phraseIndex = 0;
        this._videoStartTime = this.video.currentTime;
        this._lastFlushTime = this._videoStartTime;
        captionsAvailable = true;

        console.log(`${LOG_PREFIX} [Pipeline] Caption path active: ${segments.length} segments → ${this._phrases.length} phrases`);
      }
    } catch (e) {
      console.warn(`${LOG_PREFIX} [Pipeline] Caption extraction failed:`, e);
    }

    if (!captionsAvailable) {
      // Try DOM-based live caption observation as last resort
      console.log(`${LOG_PREFIX} [Pipeline] Trying DOM caption observer...`);

      try {
        const observer = startDOMCaptionObserver(this.video, (segment) => {
          if (this.state === State.IDLE) return;
          this._flushPhrase(segment); // Don't await — let browser queue naturally
        });

        if (observer) {
          this._domObserver = observer;
          console.log(`${LOG_PREFIX} [Pipeline] DOM caption observer active`);
          captionsAvailable = true; // proceed to the loop
        } else {
          console.error(`${LOG_PREFIX} [Pipeline] No English captions available for this video`);
          if (this.onError) {
            this.onError(new Error('此视频没有英文字幕，无法翻译。\n请确认视频已开启英文字幕 (CC 按钮)。'));
          }
          this.stop();
          return;
        }
      } catch (e) {
        console.error(`${LOG_PREFIX} [Pipeline] DOM observer failed:`, e);
        this.stop();
        return;
      }
    }

    // Start processing
    this._setState(State.CAPTURING);
    this._startTime = performance.now();

    if (captionsAvailable && this._phrases.length > 0) {
      this._processCaptionLoop();
    } else if (!captionsAvailable) {
      // Nothing to do — stop was already called
    } else {
      console.log(`${LOG_PREFIX} [Pipeline] Live DOM mode (observer-driven, no timed loop)`);
    }
  }

  /**
   * Stop the pipeline, flush remaining items, and restore original state.
   */
  stop() {
    console.log(`${LOG_PREFIX} [Pipeline] Stopping...`);

    // Unbind video events
    this.video.removeEventListener('play', this._onVideoPlay);
    this.video.removeEventListener('pause', this._onVideoPause);
    this.video.removeEventListener('seeked', this._onVideoSeek);
    this.video.removeEventListener('ended', this._onVideoEnded);

    // Stop DOM caption observer
    if (this._domObserver) {
      this._domObserver.stop();
      this._domObserver = null;
    }

    // Stop TTS
    this.tts.stop();
    if (this._audioCapture) {
      this._audioCapture.stop();
    }

    this._setState(State.IDLE);
    console.log(`${LOG_PREFIX} [Pipeline] Stopped`);
  }

  /**
   * Main processing loop for the caption path.
   * Runs on a timer, checking the video's currentTime against phrase boundaries.
   */
  _processCaptionLoop() {
    if (this.state === State.IDLE) return;

    const now = performance.now();
    const elapsed = (now - this._startTime) / 1000; // seconds since start
    const currentVideoTime = this._videoStartTime + elapsed;

    // Find phrases whose end time has passed
    while (this._phraseIndex < this._phrases.length) {
      const phrase = this._phrases[this._phraseIndex];

      // If the phrase should have started playing by now (with a small lead)
      if (phrase.start <= currentVideoTime) {
        // Check if we should flush (phrase has ended)
        if (phrase.end <= currentVideoTime) {
          this._flushPhrase(phrase);
          this._phraseIndex++;
        } else if (this.video.paused) {
          // Video paused mid-phrase — wait
          break;
        } else {
          // Phrase is currently "active" — wait for next tick
          break;
        }
      } else {
        // Phrase hasn't started yet — wait
        break;
      }
    }

    // Check if we're done
    if (this._phraseIndex >= this._phrases.length) {
      console.log(`${LOG_PREFIX} [Pipeline] All phrases processed`);
      // Continue polling in case more captions load (live streams)
    }

    // Schedule next tick
    if (this.state !== State.IDLE) {
      this._tickTimer = requestAnimationFrame(() => this._processCaptionLoop());
    }
  }

  /**
   * Flush a phrase: translate → TTS.
   * @param {{text: string, start: number, end: number}} phrase
   */
  async _flushPhrase(phrase) {
    const text = phrase.text.trim();
    if (!text) return;

    console.log(`${LOG_PREFIX} [Pipeline] Flushing phrase: "${text.substring(0, 60)}${text.length > 60 ? '…' : ''}"`);

    try {
      this._setState(State.TRANSLATING);

      const translated = await translate(
        text,
        this.config.fromLang,
        this.config.toLang
      );

      if (this.state === State.IDLE) return; // Stopped during translation

      if (this.onPhraseTranslated) {
        this.onPhraseTranslated({
          original: text,
          translated,
          timestamp: phrase.start,
        });
      }

      this._setState(State.SPEAKING);
      await this.tts.speak(translated);

      this._lastFlushTime = phrase.end;
      if (this.state !== State.IDLE) {
        this._setState(State.CAPTURING);
      }
    } catch (e) {
      console.error(`${LOG_PREFIX} [Pipeline] Phrase flush error:`, e);
      if (this.onError) this.onError(e);
      // Continue — don't stop the pipeline on individual phrase errors
      if (this.state !== State.IDLE) {
        this._setState(State.CAPTURING);
      }
    }
  }

  /**
   * Callback from AudioCapture when a phrase boundary is detected.
   * @param {string} phrase — recognized text
   */
  async _onAudioPhrase(phrase) {
    if (this.state === State.IDLE) return;
    await this._flushPhrase({ text: phrase, start: 0, end: 0 });
  }

  // --- Video event handlers ---

  _onVideoPlay() {
    console.log(`${LOG_PREFIX} [Pipeline] Video play`);
    if (this.state !== State.IDLE && this.tts) {
      this.tts.resume();
    }
  }

  _onVideoPause() {
    console.log(`${LOG_PREFIX} [Pipeline] Video pause`);
    if (this.tts) {
      this.tts.pause();
    }
  }

  _onVideoSeek() {
    console.log(`${LOG_PREFIX} [Pipeline] Video seek — resetting phrase index`);
    // Reset to the correct phrase after seek
    const currentTime = this.video.currentTime;
    this._startTime = performance.now();
    this._videoStartTime = currentTime;

    // Find the closest phrase before current time
    this._phraseIndex = 0;
    for (let i = this._phrases.length - 1; i >= 0; i--) {
      if (this._phrases[i].start <= currentTime) {
        this._phraseIndex = i;
        break;
      }
    }

    // Clear TTS queue
    this.tts.stop();
  }

  _onVideoEnded() {
    console.log(`${LOG_PREFIX} [Pipeline] Video ended`);
    this.stop();
  }

  // --- Helpers ---

  _setState(newState) {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      console.log(`${LOG_PREFIX} [Pipeline] State: ${oldState} → ${newState}`);
      if (this.onStateChange) {
        this.onStateChange(newState);
      }
    }
  }

  /**
   * Get pipeline stats for debugging/dashboard.
   */
  getStats() {
    return {
      state: this.state,
      totalPhrases: this._phrases.length,
      processedPhrases: this._phraseIndex,
      pendingCount: this.tts.pendingCount,
      mode: this._allSegments.length > 0 ? 'captions' : 'audio-asr',
    };
  }
}
