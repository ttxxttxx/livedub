// LiveDub — Translator Module
// Priority 1: Microsoft Translator (when API key configured)
// Priority 2: MyMemory free API (no key needed, ~5000 chars/day)
// Fallback: passthrough (TTS reads original text)

import { API, STORAGE_KEYS, LOG_PREFIX } from '../../shared/constants.js';
import { getStored } from '../../shared/storage.js';

const MAX_RETRIES = 2;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function hasApiKey() {
  const key = await getStored(STORAGE_KEYS.API_KEY, '');
  return key.length > 0;
}

// ─── MS Translator ─────────────────────────────────────────────

async function translateWithAzure(text, from, to, apiKey, region) {
  const url = `${API.MS_TRANSLATOR.BASE_URL}?api-version=${API.MS_TRANSLATOR.API_VERSION}&from=${from}&to=${to}&textType=html`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Ocp-Apim-Subscription-Region': region,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ Text: text }]),
  });
  if (!resp.ok) throw new Error(`Azure HTTP ${resp.status}`);
  const data = await resp.json();
  const result = data[0]?.translations?.[0]?.text;
  if (!result) throw new Error('Azure empty response');
  return result;
}

// ─── MyMemory (free, no key) ───────────────────────────────────

async function translateWithMyMemory(text, from, to) {
  // MyMemory uses ISO 639-1 codes; zh-Hans → zh-CN
  const toLang = to === 'zh-Hans' ? 'zh-CN' : to;
  const fromLang = from;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`MyMemory HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.responseStatus !== 200 && data.responseStatus !== '200') {
    throw new Error(`MyMemory status ${data.responseStatus}: ${data.responseDetails || ''}`);
  }
  const result = data.responseData?.translatedText;
  if (!result) throw new Error('MyMemory empty response');
  return result;
}

// ─── Main API ──────────────────────────────────────────────────

export async function translate(text, from = 'en', to = 'zh-Hans') {
  if (!text || !text.trim()) return '';

  const apiKey = await getStored(STORAGE_KEYS.API_KEY, '');
  const region = await getStored(STORAGE_KEYS.REGION, API.MS_TRANSLATOR.DEFAULT_REGION);

  // Priority 1: MS Translator (if API key configured)
  if (apiKey) {
    for (let i = 0; i <= MAX_RETRIES; i++) {
      try {
        const result = await translateWithAzure(text, from, to, apiKey, region);
        console.log(`${LOG_PREFIX} [Azure] "${text.substring(0, 40)}…" → "${result.substring(0, 40)}…"`);
        return result;
      } catch (e) {
        console.warn(`${LOG_PREFIX} [Azure] Attempt ${i + 1} failed:`, e.message);
        if (i < MAX_RETRIES) await sleep(1000 * (i + 1));
      }
    }
    console.warn(`${LOG_PREFIX} [Azure] All retries failed, falling back to MyMemory`);
  }

  // Priority 2: MyMemory free API
  try {
    const result = await translateWithMyMemory(text, from, to);
    console.log(`${LOG_PREFIX} [MyMemory] "${text.substring(0, 40)}…" → "${result.substring(0, 40)}…"`);
    return result;
  } catch (e) {
    console.warn(`${LOG_PREFIX} [MyMemory] Failed:`, e.message);
  }

  // Fallback: passthrough
  console.warn(`${LOG_PREFIX} [Translator] All translation services failed — passthrough`);
  return text;
}

export async function translateBatch(texts, from = 'en', to = 'zh-Hans') {
  if (!texts?.length) return [];
  const results = [];
  for (const t of texts) {
    results.push(await translate(t, from, to));
  }
  return results;
}
