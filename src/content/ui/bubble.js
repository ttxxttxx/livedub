// LiveDub — Floating Bubble UI
// Injects a floating control panel into the YouTube page.
// Controls: toggle switch, TTS volume slider, mix ratio slider, language display.

import { UI, STORAGE_KEYS, LOG_PREFIX } from '../../shared/constants.js';
import { getStored, setStored, loadAllSettings } from '../../shared/storage.js';

export class BubbleUI {
  /**
   * @param {object} options
   * @param {Function} options.onToggle — called when user toggles ON/OFF; receives (enabled: boolean)
   * @param {Function} options.onTtsVolumeChange — (volume: number)
   * @param {Function} options.onMixRatioChange — (ratio: number)
   */
  constructor({ onToggle, onTtsVolumeChange, onMixRatioChange } = {}) {
    this._onToggle = onToggle || (() => {});
    this._onTtsVolumeChange = onTtsVolumeChange || (() => {});
    this._onMixRatioChange = onMixRatioChange || (() => {});

    this._enabled = false;
    this._ttsVolume = 1.0;
    this._mixRatio = 0.3;

    this._dragState = null; // { startX, startY, startLeft, startTop }
    this._fadeTimer = null;

    this._root = null;
    this._panel = null;
    this._initialized = false;
  }

  /**
   * Inject the bubble into the page and load saved settings.
   */
  async init() {
    if (this._initialized) return;

    // Load saved settings
    const settings = await loadAllSettings();
    this._enabled = settings[STORAGE_KEYS.ENABLED] || false;
    this._ttsVolume = settings[STORAGE_KEYS.TTS_VOLUME] || 1.0;
    this._mixRatio = settings[STORAGE_KEYS.MIX_RATIO] || 0.3;

    this._render();
    this._bindEvents();
    this._initialized = true;

    console.log(`${LOG_PREFIX} [UI] Bubble initialized (enabled=${this._enabled})`);
  }

  /**
   * Remove the bubble from the DOM.
   */
  destroy() {
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    this._initialized = false;
  }

  // --- Rendering ---

  _render() {
    const root = document.createElement('div');
    root.id = UI.BUBBLE_ID;

    root.innerHTML = `
      <div class="ld-panel">
        <!-- Header -->
        <div class="ld-header" data-ld-drag-handle>
          <div class="ld-logo">
            <span class="ld-logo-icon">🎙</span>
            LiveDub
          </div>
          <button class="ld-close" data-ld-action="close" title="Close">✕</button>
        </div>

        <!-- Body -->
        <div class="ld-body">
          <!-- Toggle -->
          <div class="ld-toggle-row">
            <span class="ld-toggle-label">翻译</span>
            <button class="ld-toggle${this._enabled ? ' active' : ''}" data-ld-action="toggle">
              <span class="ld-toggle-knob"></span>
            </button>
          </div>

          <!-- TTS Volume -->
          <div class="ld-slider-group">
            <div class="ld-slider-label">
              <span>🔊 翻译音量</span>
              <span data-ld-display="tts-volume">${Math.round(this._ttsVolume * 100)}%</span>
            </div>
            <input type="range" class="ld-slider" min="0" max="100"
                   value="${Math.round(this._ttsVolume * 100)}"
                   data-ld-slider="tts-volume" />
          </div>

          <!-- Mix Ratio -->
          <div class="ld-slider-group">
            <div class="ld-slider-label">
              <span>🎵 原声比例</span>
              <span data-ld-display="mix-ratio">${Math.round(this._mixRatio * 100)}%</span>
            </div>
            <input type="range" class="ld-slider" min="0" max="100"
                   value="${Math.round(this._mixRatio * 100)}"
                   data-ld-slider="mix-ratio" />
          </div>

          <!-- Language -->
          <div class="ld-lang-row">
            <span class="ld-lang-badge">🇺🇸 EN</span>
            <span class="ld-lang-arrow">→</span>
            <span class="ld-lang-badge">🇨🇳 中文</span>
          </div>
        </div>

        <!-- Status -->
        <div class="ld-status">
          <span class="ld-status-dot${this._enabled ? ' active' : ''}" data-ld-status-dot></span>
          <span data-ld-status-text>${this._enabled ? '翻译运行中' : '已关闭'}</span>
        </div>
      </div>
    `;

    this._root = root;
    document.body.appendChild(root);

    // Cache commonly accessed elements
    this._panel = root.querySelector('.ld-panel');
    this._toggleBtn = root.querySelector('[data-ld-action="toggle"]');
    this._statusDot = root.querySelector('[data-ld-status-dot]');
    this._statusText = root.querySelector('[data-ld-status-text]');

    // Start auto-fade timer
    this._resetFadeTimer();
  }

  // --- Events ---

  _bindEvents() {
    // Toggle
    this._toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._enabled = !this._enabled;
      this._updateToggleUI();
      this._onToggle(this._enabled);
      setStored(STORAGE_KEYS.ENABLED, this._enabled);
    });

    // Close button
    const closeBtn = this._root.querySelector('[data-ld-action="close"]');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._root.style.display = 'none';
      // Show a small "reopen" button — TODO: minimizable state
    });

    // TTS Volume slider
    const ttsSlider = this._root.querySelector('[data-ld-slider="tts-volume"]');
    ttsSlider.addEventListener('input', (e) => {
      this._ttsVolume = parseInt(e.target.value) / 100;
      this._root.querySelector('[data-ld-display="tts-volume"]').textContent =
        `${Math.round(this._ttsVolume * 100)}%`;
      this._onTtsVolumeChange(this._ttsVolume);
      setStored(STORAGE_KEYS.TTS_VOLUME, this._ttsVolume);
    });

    // Mix ratio slider
    const mixSlider = this._root.querySelector('[data-ld-slider="mix-ratio"]');
    mixSlider.addEventListener('input', (e) => {
      this._mixRatio = parseInt(e.target.value) / 100;
      this._root.querySelector('[data-ld-display="mix-ratio"]').textContent =
        `${Math.round(this._mixRatio * 100)}%`;
      this._onMixRatioChange(this._mixRatio);
      setStored(STORAGE_KEYS.MIX_RATIO, this._mixRatio);
    });

    // Drag
    const header = this._root.querySelector('[data-ld-drag-handle]');
    header.addEventListener('mousedown', this._onDragStart.bind(this));
    document.addEventListener('mousemove', this._onDragMove.bind(this));
    document.addEventListener('mouseup', this._onDragEnd.bind(this));

    // Auto-fade on inactivity
    this._root.addEventListener('mouseenter', () => {
      this._root.classList.remove('ld-faded');
    });
    this._root.addEventListener('mouseleave', () => {
      this._resetFadeTimer();
    });
    this._root.addEventListener('mousedown', () => {
      this._resetFadeTimer();
    });
  }

  // --- Drag handling ---

  _onDragStart(e) {
    // Don't start drag if clicking a button inside the header
    if (e.target.closest('button')) return;

    const rect = this._root.getBoundingClientRect();
    this._dragState = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
    e.preventDefault();
  }

  _onDragMove(e) {
    if (!this._dragState) return;

    const dx = e.clientX - this._dragState.startX;
    const dy = e.clientY - this._dragState.startY;

    let newLeft = this._dragState.startLeft + dx;
    let newTop = this._dragState.startTop + dy;

    // Clamp to viewport
    const maxLeft = window.innerWidth - this._root.offsetWidth - 10;
    const maxTop = window.innerHeight - this._root.offsetHeight - 10;
    newLeft = Math.max(10, Math.min(newLeft, maxLeft));
    newTop = Math.max(10, Math.min(newTop, maxTop));

    this._root.style.right = 'auto';
    this._root.style.left = newLeft + 'px';
    this._root.style.top = newTop + 'px';
  }

  _onDragEnd() {
    this._dragState = null;
  }

  // --- UI Updates ---

  _updateToggleUI() {
    if (this._enabled) {
      this._toggleBtn.classList.add('active');
      this._statusDot.classList.add('active');
      this._statusText.textContent = '翻译运行中';
    } else {
      this._toggleBtn.classList.remove('active');
      this._statusDot.classList.remove('active');
      this._statusText.textContent = '已关闭';
    }
  }

  /**
   * Public: update status text (e.g., show "翻译中…" or error messages).
   */
  setStatus(text, type = '') {
    if (!this._statusText) return;
    this._statusText.textContent = text;
    this._statusDot.className = 'ld-status-dot';
    if (type) {
      this._statusDot.classList.add(type);
    } else if (this._enabled) {
      this._statusDot.classList.add('active');
    }
  }

  /**
   * Update the UI to reflect current enabled state.
   */
  setEnabled(enabled) {
    this._enabled = enabled;
    this._updateToggleUI();
  }

  _resetFadeTimer() {
    if (this._fadeTimer) clearTimeout(this._fadeTimer);
    this._root.classList.remove('ld-faded');
    this._fadeTimer = setTimeout(() => {
      if (!this._dragState) {
        this._root.classList.add('ld-faded');
      }
    }, UI.AUTO_FADE_DELAY_MS);
  }

  /**
   * Get current mix ratio.
   */
  getMixRatio() {
    return this._mixRatio;
  }

  /**
   * Get current TTS volume.
   */
  getTtsVolume() {
    return this._ttsVolume;
  }
}
