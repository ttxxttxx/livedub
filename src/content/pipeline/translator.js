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

// ─── Google Translate (free unofficial, best quality) ─────────

async function translateWithGoogle(text, from, to) {
  // Google Translate unofficial API — no key needed
  const tl = to === 'zh-Hans' ? 'zh-CN' : to;
  const sl = from;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!resp.ok) throw new Error(`Google HTTP ${resp.status}`);
  const data = await resp.json();
  // Response format: [[["translated text", "original", ...]], ...]
  const result = data[0]?.map(part => part[0]).join('');
  if (!result || result === text) throw new Error('Google empty/same');
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

  // Priority 1: MS Translator (if API key configured)
  if (apiKey) {
    for (let i = 0; i <= MAX_RETRIES; i++) {
      try {
        const result = await translateWithAzure(text, from, to, apiKey,
          await getStored(STORAGE_KEYS.REGION, API.MS_TRANSLATOR.DEFAULT_REGION));
        console.log(`${LOG_PREFIX} [Azure] → "${result.substring(0, 50)}…"`);
        return result;
      } catch (e) {
        if (i < MAX_RETRIES) await sleep(1000 * (i + 1));
      }
    }
  }

  // Priority 2: Google Translate (free, best quality)
  try {
    const result = await translateWithGoogle(text, from, to);
    console.log(`${LOG_PREFIX} [Google] → "${result.substring(0, 50)}…"`);
    return result;
  } catch (e) {
    console.warn(`${LOG_PREFIX} [Google] Failed:`, e.message);
  }

  // Priority 3: MyMemory
  try {
    const result = await translateWithMyMemory(text, from, to);
    console.log(`${LOG_PREFIX} [MyMemory] → "${result.substring(0, 50)}…"`);
    return result;
  } catch (e) {
    console.warn(`${LOG_PREFIX} [MyMemory] Failed:`, e.message);
  }

  // Fallback: passthrough
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
