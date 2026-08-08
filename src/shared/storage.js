// LiveDub — chrome.storage wrapper
// Provides a simple async interface over chrome.storage.sync and chrome.storage.local.

import { STORAGE_KEYS } from './constants.js';

/**
 * Get a value from chrome.storage (sync first, then local fallback).
 * @param {string} key
 * @param {*} defaultValue
 * @returns {Promise<*>}
 */
export async function getStored(key, defaultValue = null) {
  try {
    const result = await chrome.storage.sync.get(key);
    if (result[key] !== undefined) return result[key];
    const localResult = await chrome.storage.local.get(key);
    if (localResult[key] !== undefined) return localResult[key];
  } catch (e) {
    console.warn('[LiveDub] storage.get error:', e);
  }
  return defaultValue;
}

/**
 * Set a value in chrome.storage.sync.
 * @param {string} key
 * @param {*} value
 */
export async function setStored(key, value) {
  try {
    await chrome.storage.sync.set({ [key]: value });
  } catch (e) {
    console.warn('[LiveDub] storage.set error:', e);
  }
}

/**
 * Load all LiveDub settings at once.
 * @returns {Promise<object>}
 */
export async function loadAllSettings() {
  const defaults = {
    [STORAGE_KEYS.API_KEY]: '',
    [STORAGE_KEYS.REGION]: 'eastasia',
    [STORAGE_KEYS.TTS_VOLUME]: 1.0,
    [STORAGE_KEYS.TTS_RATE]: 1.5,
    [STORAGE_KEYS.MIX_RATIO]: 0.3,
    [STORAGE_KEYS.ENABLED]: false,
    [STORAGE_KEYS.FROM_LANG]: 'en',
    [STORAGE_KEYS.TO_LANG]: 'zh-Hans',
  };

  const keys = Object.keys(defaults);
  try {
    const result = await chrome.storage.sync.get(keys);
    const merged = {};
    for (const k of keys) {
      merged[k] = result[k] !== undefined ? result[k] : defaults[k];
    }
    return merged;
  } catch (e) {
    console.warn('[LiveDub] loadAllSettings error:', e);
    return defaults;
  }
}

/**
 * Save settings batch.
 * @param {object} settings - key-value pairs
 */
export async function saveSettings(settings) {
  try {
    await chrome.storage.sync.set(settings);
  } catch (e) {
    console.warn('[LiveDub] saveSettings error:', e);
  }
}
