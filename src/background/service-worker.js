// LiveDub — Background Service Worker (MV3)
// Lightweight: primarily serves as a storage bridge and message relay.
// In MV3, the service worker may be terminated when idle — all state lives in
// chrome.storage and the content script.

import { LOG_PREFIX } from '../shared/constants.js';

console.log(`${LOG_PREFIX} Background service worker started`);

// Listen for messages from content script or options page
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Handle any cross-context requests here (future use)
  switch (message.type) {
    case 'GET_API_KEY':
      chrome.storage.sync.get('livedub_api_key', (result) => {
        sendResponse({ apiKey: result.livedub_api_key || '' });
      });
      return true; // Keep the message channel open for async response

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log(`${LOG_PREFIX} First install — setting defaults`);
    chrome.storage.sync.set({
      livedub_region: 'eastasia',
      livedub_tts_volume: 1.0,
      livedub_tts_rate: 1.1,
      livedub_mix_ratio: 0.3,
      livedub_enabled: false,
      livedub_from_lang: 'en',
      livedub_to_lang: 'zh-Hans',
    });
  }
});
