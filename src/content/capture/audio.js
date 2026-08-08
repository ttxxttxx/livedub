// LiveDub — Audio Capture (ASR Fallback)
// Captures audio from the video element and performs speech recognition
// using the browser's built-in Web Speech API.
// Only activated when YouTube captions are unavailable.
//
// On Edge: Web Speech API uses Azure Speech Services internally.
// On Chrome (China): Web Speech API won't work — will need alternative backend.

import { LOG_PREFIX } from '../../shared/constants.js';
import { SilenceDetector } from './silence-detector.js';

export class AudioCapture {
  /**
   * @param {HTMLVideoElement} videoElement
   * @param {object} [options]
   */
  constructor(videoElement, options = {}) {
    this.video = videoElement;
    this.audioCtx = null;
    this.analyser = null;
    this.silenceDetector = null;
    this.recognition = null;
    this._isRunning = false;
    this._phraseCallback = null; // Called with each recognized phrase
    this._textBuffer = '';
    this._language = options.language || 'en-US';
  }

  /**
   * Start audio capture and speech recognition.
   * @param {Function} onPhrase — callback(string) when a phrase boundary is detected
   */
  async start(onPhrase) {
    if (this._isRunning) return;
    this._phraseCallback = onPhrase;

    try {
      // 1. Set up Web Audio API for silence detection
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Try to connect to the video element's audio
      try {
        const source = this.audioCtx.createMediaElementSource(this.video);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.3;
        source.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination); // Pass through — don't mute

        console.log(`${LOG_PREFIX} [Audio] Connected to video element audio`);
      } catch (e) {
        console.warn(`${LOG_PREFIX} [Audio] Cannot connect to video audio:`, e);
        // Create a silent analyser — we'll rely solely on the speech recognition
        // for phrase boundaries
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;
      }

      // 2. Set up silence detector
      this.silenceDetector = new SilenceDetector({
        analyserNode: this.analyser,
        onSpeechEnd: () => this._flushBuffer(),
      });
      this.silenceDetector.start();

      // 3. Set up Web Speech API
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        throw new Error('Web Speech API not available in this browser');
      }

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this._language;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript + ' ';
          } else {
            interim += result[0].transcript + ' ';
          }
        }

        if (final) {
          this._textBuffer += final;
          console.log(`${LOG_PREFIX} [Audio] Final ASR: "${final.trim()}"`);
        }
      };

      this.recognition.onerror = (event) => {
        console.warn(`${LOG_PREFIX} [Audio] Recognition error:`, event.error, event.message);

        // 'no-speech' and 'aborted' are normal — don't stop
        // 'network' likely means API blocked (China firewall)
        if (event.error === 'network') {
          console.error(`${LOG_PREFIX} [Audio] Network error — Web Speech API may be blocked`);
        }

        // Auto-restart on non-fatal errors
        if (event.error !== 'aborted' && this._isRunning) {
          setTimeout(() => {
            if (this._isRunning && this.recognition) {
              try { this.recognition.start(); } catch (e) { /* ignore */ }
            }
          }, 500);
        }
      };

      this.recognition.onend = () => {
        // Auto-restart if still running
        if (this._isRunning) {
          try {
            this.recognition.start();
          } catch (e) {
            console.warn(`${LOG_PREFIX} [Audio] Recognition restart failed:`, e);
          }
        }
      };

      // Start recognition
      this.recognition.start();
      this._isRunning = true;

      console.log(`${LOG_PREFIX} [Audio] Capture started (lang: ${this._language})`);
    } catch (e) {
      console.error(`${LOG_PREFIX} [Audio] Start failed:`, e);
      this.stop();
      throw e;
    }
  }

  /**
   * Stop audio capture and recognition.
   */
  stop() {
    this._isRunning = false;

    // Flush remaining buffer
    this._flushBuffer();

    // Stop recognition
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) { /* ignore */ }
      this.recognition = null;
    }

    // Stop silence detector
    if (this.silenceDetector) {
      this.silenceDetector.stop();
      this.silenceDetector = null;
    }

    // Close audio context
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }

    console.log(`${LOG_PREFIX} [Audio] Capture stopped`);
  }

  /**
   * Flush accumulated text to the phrase callback.
   */
  _flushBuffer() {
    const text = this._textBuffer.trim();
    if (text && this._phraseCallback) {
      console.log(`${LOG_PREFIX} [Audio] Flushing phrase: "${text.substring(0, 60)}"`);
      this._phraseCallback(text);
    }
    this._textBuffer = '';
  }
}
