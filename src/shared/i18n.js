// LiveDub — i18n placeholder
// Currently Chinese-only. Expand for multi-language UI in Phase 2.

const zh = {
  on: '开启',
  off: '关闭',
  ttsVolume: '翻译音量',
  mixRatio: '原声比例',
  fromLang: '源语言',
  toLang: '目标语言',
  settings: '设置',
  noCaptions: '此视频无字幕',
  noApiKey: '请先配置翻译 API Key',
  translating: '翻译中…',
};

const en = {
  on: 'ON',
  off: 'OFF',
  ttsVolume: 'Voice Volume',
  mixRatio: 'Original Mix',
  fromLang: 'From',
  toLang: 'To',
  settings: 'Settings',
  noCaptions: 'No captions available',
  noApiKey: 'Please configure API key',
  translating: 'Translating…',
};

const locales = { zh, en };

/**
 * Get a localized string. Defaults to Chinese.
 * @param {string} key
 * @param {string} [locale='zh']
 * @returns {string}
 */
export function t(key, locale = 'zh') {
  return locales[locale]?.[key] || locales.zh[key] || key;
}

export function getLocale() {
  return navigator.language?.startsWith('zh') ? 'zh' : 'en';
}
