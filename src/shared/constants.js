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
  DEFAULT_RATE: 1.5,
  DEFAULT_PITCH: 1.0,
  DEFAULT_VOLUME: 1.0,
  DEFAULT_VOICE: 'auto', // 'auto' = best available
  // Edge neural Chinese voices — ordered by naturalness
  VOICES: [
    { id: 'auto', name: '自动（最佳可用）', gender: 'auto' },
    { id: 'Microsoft Xiaoxiao', name: '晓晓 (女·活泼)', gender: 'female' },
    { id: 'Microsoft Yunxi', name: '云希 (男·自然)', gender: 'male' },
    { id: 'Microsoft Xiaoyi', name: '晓伊 (女·温柔)', gender: 'female' },
    { id: 'Microsoft Yunyang', name: '云扬 (男·新闻)', gender: 'male' },
    { id: 'Microsoft Xiaobei', name: '晓北 (女·东北)', gender: 'female' },
    { id: 'Microsoft Xihan', name: '希涵 (女·粤语)', gender: 'female' },
    { id: 'Microsoft Yunhao', name: '云浩 (男·沉稳)', gender: 'male' },
    { id: 'Microsoft Huihui', name: '慧慧 (女·默认)', gender: 'female' },
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
  VOICE: 'livedub_voice',
};

export const LOG_PREFIX = '[LiveDub]';
