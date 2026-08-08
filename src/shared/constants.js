// LiveDub — Shared Constants
// Central place for all magic numbers, API endpoints, and default config.

export const API = {
  // Microsoft Translator Text API v3
  // Free tier: 2M characters/month
  MS_TRANSLATOR: {
    BASE_URL: 'https://api.cognitive.microsofttranslator.com/translate',
    API_VERSION: '3.0',
    DEFAULT_REGION: 'eastasia', // Lowest latency from mainland China
  },
};

export const YOUTUBE = {
  // URL patterns for video pages
  VIDEO_URL_PATTERN: /^https?:\/\/www\.youtube\.com\/watch\?v=/,
  // Selectors
  VIDEO_SELECTOR: 'video.html5-main-video',
  PLAYER_CONTAINER: '#movie_player',
  AD_DETECTOR: '.ad-showing',
  // Caption gap threshold: if gap between two caption segments >= this (ms),
  // we consider it a phrase boundary and flush the buffer to translation.
  PHRASE_BOUNDARY_GAP_MS: 500,
  // How often to poll for new captions (ms)
  CAPTION_POLL_INTERVAL_MS: 100,
};

export const SILENCE = {
  // RMS threshold in dB — audio below this is considered silence
  THRESHOLD_DB: -45,
  // How often to check the analyser node (ms)
  SAMPLE_INTERVAL_MS: 100,
  // Consecutive silent samples before triggering phrase boundary
  SILENT_SAMPLES_REQUIRED: 3, // 3 × 100ms = 300ms
};

export const TTS = {
  DEFAULT_LANG: 'zh-CN',
  DEFAULT_RATE: 1.5,  // Slightly faster speech for reduced latency
  DEFAULT_PITCH: 1.0,
  DEFAULT_VOLUME: 1.0,
  // Voice preference — Edge has these high-quality Chinese voices
  PREFERRED_VOICES: [
    'Microsoft Xiaoxiao',
    'Microsoft Yunxi',
    'Microsoft Xiaoyi',
  ],
};

export const TRANSLATION = {
  FROM_LANG: 'en',
  TO_LANG: 'zh-Hans',
  // Max pending translations before we start dropping phrases
  MAX_QUEUE_DEPTH: 5,
};

export const UI = {
  BUBBLE_ID: 'livedub-bubble-root',
  BUBBLE_WIDTH: 260,
  BUBBLE_MINIMIZED_WIDTH: 48,
  AUTO_FADE_DELAY_MS: 5000,
  FADE_OPACITY: 0.35,
};

export const STORAGE_KEYS = {
  API_KEY: 'livedub_api_key',
  REGION: 'livedub_region',
  TTS_VOLUME: 'livedub_tts_volume',
  TTS_RATE: 'livedub_tts_rate',
  MIX_RATIO: 'livedub_mix_ratio',
  ENABLED: 'livedub_enabled',
  FROM_LANG: 'livedub_from_lang',
  TO_LANG: 'livedub_to_lang',
};

export const LOG_PREFIX = '[LiveDub]';
