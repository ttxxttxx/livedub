// LiveDub — Content Script Entry Point
// Pure IIFE — no imports needed (bundled by esbuild)

import { YOUTUBE, LOG_PREFIX } from '../shared/constants.js';
import { loadAllSettings, setStored } from '../shared/storage.js';
import { BubbleUI } from './ui/bubble.js';
import { PipelineOrchestrator } from './pipeline/orchestrator.js';
import { AudioMixer } from './mixer/audio-mixer.js';

// ─── Global State ──────────────────────────────────────────────────
let bubble = null;
let pipeline = null;
let mixer = null;
let currentVideo = null;
let currentVideoId = null;
let settings = null;

// ─── Initialization ────────────────────────────────────────────────

async function init() {
  console.log(`${LOG_PREFIX} ╔══════════════════════════════════════╗`);
  console.log(`${LOG_PREFIX} ║   LiveDub Content Script Starting   ║`);
  console.log(`${LOG_PREFIX} ╚══════════════════════════════════════╝`);
  console.log(`${LOG_PREFIX} URL: ${window.location.href}`);
  console.log(`${LOG_PREFIX} Video elements on page: ${document.querySelectorAll('video').length}`);

  // Load settings
  try {
    settings = await loadAllSettings();
    console.log(`${LOG_PREFIX} Settings loaded:`, JSON.stringify(settings));
  } catch (e) {
    console.error(`${LOG_PREFIX} Settings load failed:`, e);
    settings = {};
  }

  // Wait for video element
  try {
    currentVideo = await waitForVideoElement();
  } catch (e) {
    console.error(`${LOG_PREFIX} Video wait failed:`, e);
  }

  if (!currentVideo) {
    console.warn(`${LOG_PREFIX} No video element found — retrying in 2s`);
    setTimeout(init, 2000);
    return;
  }

  console.log(`${LOG_PREFIX} Video element found successfully`);

  // Create audio capture
  // Create the floating bubble UI
  bubble = new BubbleUI({
    onToggle: handleToggle,
    onTtsVolumeChange: handleTtsVolumeChange,
    onMixRatioChange: handleMixRatioChange,
    onVoiceChange: handleVoiceChange,
  });
  await bubble.init();
  console.log(`${LOG_PREFIX} Bubble UI initialized`);

  // Create audio mixer
  mixer = new AudioMixer(currentVideo);
  console.log(`${LOG_PREFIX} Audio mixer ready`);

  // Start SPA navigation watcher
  watchForNavigation();

  console.log(`${LOG_PREFIX} LiveDub initialized successfully ✅`);

  // Auto-start pipeline if it was enabled before page refresh
  if (settings && settings.livedub_enabled) {
    console.log(`${LOG_PREFIX} Auto-starting pipeline (was enabled before refresh)`);
    await startPipeline();
  }
}

// ─── Video Detection ───────────────────────────────────────────────

function waitForVideoElement(timeoutMs = 15000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(YOUTUBE.VIDEO_SELECTOR);
    if (existing) {
      console.log(`${LOG_PREFIX} Video element found immediately`);
      currentVideoId = getYouTubeVideoId();
      resolve(existing);
      return;
    }

    let resolved = false;

    const observer = new MutationObserver(() => {
      const video = document.querySelector(YOUTUBE.VIDEO_SELECTOR);
      if (video && !resolved) {
        resolved = true;
        observer.disconnect();
        console.log(`${LOG_PREFIX} Video element detected via MutationObserver`);
        currentVideoId = getYouTubeVideoId();
        resolve(video);
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        const video = document.querySelector(YOUTUBE.VIDEO_SELECTOR);
        if (video) {
          currentVideoId = getYouTubeVideoId();
          console.log(`${LOG_PREFIX} Video found after timeout`);
          resolve(video);
        } else {
          console.warn(`${LOG_PREFIX} Video element not found within ${timeoutMs}ms`);
          resolve(null);
        }
      }
    }, timeoutMs);
  });
}

function getYouTubeVideoId() {
  const urlMatch = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (urlMatch) return urlMatch[1];
  try {
    const id = window.ytInitialPlayerResponse?.videoDetails?.videoId;
    if (id) return id;
  } catch (e) { /* ignore */ }
  return null;
}

let _navHandler = null;
let _adObserver = null;

// ─── SPA Navigation ─────────────────────────────────────────────────

let _lastVideoId = null;

function watchForNavigation() {
  _lastVideoId = currentVideoId;

  // Remove old handler to prevent duplicates
  if (_navHandler) document.removeEventListener('yt-navigate-finish', _navHandler);

  _navHandler = () => {
    const newVideoId = getYouTubeVideoId();
    if (!newVideoId) return;

    // If we weren't on a watch page before, do full init
    if (!_lastVideoId) {
      console.log(`${LOG_PREFIX} Navigation to video: ${newVideoId} — full init`);
      if (pipeline) { pipeline.stop(); pipeline = null; }
      if (mixer) { mixer.destroy(); mixer = null; }
      if (bubble) bubble.destroy();
      window.__livedub_initialized = false;
      boot();
      return;
    }

    // Same video or no change
    if (newVideoId === _lastVideoId) return;

    // Different video — restart only the pipeline, keep mixer
    console.log(`${LOG_PREFIX} SPA: ${_lastVideoId} → ${newVideoId}`);
    if (pipeline) { pipeline.stop(); pipeline = null; }
    _lastVideoId = newVideoId;
    currentVideoId = newVideoId;
    currentVideo = document.querySelector(YOUTUBE.VIDEO_SELECTOR);
    if (currentVideo) {
      // Reuse mixer with new video to avoid AudioContext lag
      if (mixer) { mixer.setVideo(currentVideo); }
      else { mixer = new AudioMixer(currentVideo); }
      if (bubble && bubble._enabled) startPipeline();
    }
  };

  document.addEventListener('yt-navigate-finish', _navHandler);
}

// ─── UI Event Handlers ─────────────────────────────────────────────

async function handleToggle(enabled) {
  console.log(`${LOG_PREFIX} Toggle: ${enabled ? 'ON' : 'OFF'}`);
  if (enabled) {
    await startPipeline();
  } else {
    stopPipeline();
  }
  setStored('livedub_enabled', enabled);
}

function handleTtsVolumeChange(volume) {
  if (pipeline && pipeline.tts) pipeline.tts.setVolume(volume);
}

function handleMixRatioChange(ratio) {
  if (mixer) mixer.setMixRatio(ratio);
}

function handleVoiceChange(voiceId) {
  if (pipeline && pipeline.tts) {
    pipeline.tts.setVoice(voiceId);
    console.log(`${LOG_PREFIX} Voice changed to: ${voiceId}`);
  }
  setStored('livedub_voice', voiceId);
}

// ─── Pipeline Control ──────────────────────────────────────────────

async function startPipeline() {
  if (pipeline) { console.warn(`${LOG_PREFIX} Pipeline already running`); return; }
  if (!currentVideo) { console.error(`${LOG_PREFIX} No video element`); return; }

  if (mixer) {
    mixer.init();
    mixer.setMixRatio(bubble.getMixRatio());
  }

  pipeline = new PipelineOrchestrator({
    videoElement: currentVideo,
    config: {
      fromLang: settings?.livedub_from_lang || 'en',
      toLang: settings?.livedub_to_lang || 'zh-Hans',
      ttsVolume: bubble.getTtsVolume(),
      voiceId: settings?.livedub_voice || 'auto',
    },
  });

  pipeline.onStateChange = (state) => {
    const messages = {
      translating: '翻译中…',
      speaking: '播报中',
      capturing: '监听中',
      waiting: '等待中…',
    };
    bubble.setStatus(messages[state] || state, state === 'translating' || state === 'speaking' ? 'active' : '');
  };

  pipeline.onError = (error) => {
    console.error(`${LOG_PREFIX} Pipeline error:`, error);
    bubble.setStatus(`错误: ${error.message}`, 'error');
  };

  pipeline.onPhraseTranslated = ({ original, translated }) => {
    console.log(`${LOG_PREFIX} ✅ [EN] "${original.substring(0, 50)}"`);
    console.log(`${LOG_PREFIX} ✅ [ZH] "${translated.substring(0, 50)}"`);
  };

  try {
    await pipeline.start();
    bubble.setEnabled(true);
  } catch (e) {
    console.error(`${LOG_PREFIX} Pipeline start failed:`, e);
    bubble.setStatus(`启动失败: ${e.message}`, 'error');
    pipeline = null;
  }
}

function stopPipeline() {
  if (pipeline) { pipeline.stop(); pipeline = null; }
  if (mixer) mixer.destroy();
  bubble.setEnabled(false);
  bubble.setStatus('已关闭', '');
}

// ─── Ad Detection ──────────────────────────────────────────────────

function watchForAds() {
  if (_adObserver) _adObserver.disconnect();
  _adObserver = new MutationObserver(() => {
    const isAd = document.querySelector(YOUTUBE.AD_DETECTOR);
    if (isAd && pipeline) {
      console.log(`${LOG_PREFIX} Ad detected — pausing`);
      pipeline.tts?.pause();
    }
  });
  const playerContainer = document.querySelector(YOUTUBE.PLAYER_CONTAINER);
  if (playerContainer) {
    _adObserver.observe(playerContainer, { attributes: true, attributeFilter: ['class'], subtree: false });
  }
}

// ─── Boot ──────────────────────────────────────────────────────────

console.log('[LiveDub] 🔥 TOP-LEVEL EXECUTION STARTED');

/**
 * Initialize the extension on the current page if it's a watch page.
 * Always registers the navigation watcher (even on non-watch pages).
 */
function boot() {
  if (YOUTUBE.VIDEO_URL_PATTERN.test(window.location.href)) {
    console.log('[LiveDub] URL matches — calling init()');
    if (window.__livedub_initialized) return;
    window.__livedub_initialized = true;
    init().then(() => { watchForNavigation(); watchForAds(); }).catch((e) => {
      console.error(`${LOG_PREFIX} Init failed:`, e);
    });
  } else {
    console.log('[LiveDub] Not a watch page:', window.location.href, '(waiting for navigation)');
    // Still register navigation watcher so we detect when user clicks a video
    watchForNavigation();
  }
}

// Initial boot
boot();

// First-boot navigation is handled by watchForNavigation() inside init()

