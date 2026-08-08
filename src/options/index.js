// LiveDub — Options Page Script
// Manages extension settings: API key, region, TTS volume, mix ratio.

import { STORAGE_KEYS } from '../shared/constants.js';
import { loadAllSettings, saveSettings } from '../shared/storage.js';

// ─── DOM Elements ──────────────────────────────────────────────────
const apiKeyInput = document.getElementById('apiKey');
const regionSelect = document.getElementById('region');
const ttsVoiceSelect = document.getElementById('ttsVoice');
const ttsVolumeSlider = document.getElementById('ttsVolume');
const ttsRateSlider = document.getElementById('ttsRate');
const mixRatioSlider = document.getElementById('mixRatio');
const saveBtn = document.getElementById('saveBtn');
const saveStatus = document.getElementById('saveStatus');

// Display elements
const ttsVolumeDisplay = document.getElementById('ttsVolumeDisplay');
const ttsRateDisplay = document.getElementById('ttsRateDisplay');
const mixRatioDisplay = document.getElementById('mixRatioDisplay');

// ─── Load Saved Settings ───────────────────────────────────────────

async function loadAndDisplay() {
  const settings = await loadAllSettings();

  // API settings
  if (settings[STORAGE_KEYS.API_KEY]) {
    apiKeyInput.value = settings[STORAGE_KEYS.API_KEY];
  }
  if (settings[STORAGE_KEYS.REGION]) {
    regionSelect.value = settings[STORAGE_KEYS.REGION];
  }

  // Voice
  if (settings[STORAGE_KEYS.VOICE]) {
    ttsVoiceSelect.value = settings[STORAGE_KEYS.VOICE];
  }

  // TTS settings
  const ttsVol = Math.round((settings[STORAGE_KEYS.TTS_VOLUME] || 1.0) * 100);
  ttsVolumeSlider.value = ttsVol;
  ttsVolumeDisplay.textContent = `${ttsVol}%`;

  const ttsRate = Math.round((settings[STORAGE_KEYS.TTS_RATE] || 1.1) * 100);
  ttsRateSlider.value = ttsRate;
  ttsRateDisplay.textContent = `${(ttsRate / 100).toFixed(1)}x`;

  // Mix settings
  const mixRatio = Math.round((settings[STORAGE_KEYS.MIX_RATIO] || 0.3) * 100);
  mixRatioSlider.value = mixRatio;
  mixRatioDisplay.textContent = `${mixRatio}%`;
}

// ─── Live Display Updates ──────────────────────────────────────────

ttsVolumeSlider.addEventListener('input', () => {
  ttsVolumeDisplay.textContent = `${ttsVolumeSlider.value}%`;
});

ttsRateSlider.addEventListener('input', () => {
  ttsRateDisplay.textContent = `${(parseInt(ttsRateSlider.value) / 100).toFixed(1)}x`;
});

mixRatioSlider.addEventListener('input', () => {
  mixRatioDisplay.textContent = `${mixRatioSlider.value}%`;
});

// ─── Save ──────────────────────────────────────────────────────────

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中…';

  const settings = {
    [STORAGE_KEYS.API_KEY]: apiKeyInput.value.trim(),
    [STORAGE_KEYS.REGION]: regionSelect.value,
    [STORAGE_KEYS.VOICE]: ttsVoiceSelect.value,
    [STORAGE_KEYS.TTS_VOLUME]: parseInt(ttsVolumeSlider.value) / 100,
    [STORAGE_KEYS.TTS_RATE]: parseInt(ttsRateSlider.value) / 100,
    [STORAGE_KEYS.MIX_RATIO]: parseInt(mixRatioSlider.value) / 100,
  };

  try {
    await saveSettings(settings);
    showStatus('✅ 设置已保存');
  } catch (e) {
    showStatus('❌ 保存失败');
  }

  saveBtn.disabled = false;
  saveBtn.textContent = '💾 保存设置';
});

function showStatus(message) {
  saveStatus.textContent = message;
  saveStatus.classList.add('visible');
  setTimeout(() => {
    saveStatus.classList.remove('visible');
  }, 2500);
}

// ─── Boot ──────────────────────────────────────────────────────────
loadAndDisplay();
