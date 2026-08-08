// LiveDub — YouTube Caption Extractor
// Sentence-based DOM extraction: reads YouTube's .caption-window,
// extracts complete sentences, speaks each one exactly once.

import { YOUTUBE, LOG_PREFIX } from '../../shared/constants.js';

function getVideoId() {
  const m = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function getVisibleCaptionText() {
  // Try .caption-window first
  const wins = document.querySelectorAll('.caption-window');
  let bestText = '';
  for (let i = wins.length - 1; i >= 0; i--) {
    const s = window.getComputedStyle(wins[i]);
    if (s.display !== 'none' && s.visibility !== 'hidden') {
      const t = cleanCaptionText(wins[i]);
      if (t && t.length > bestText.length) bestText = t;
    }
  }
  if (bestText) return bestText;

  // Fallback: .ytp-caption-segment
  const segs = document.querySelectorAll('.ytp-caption-segment');
  const parts = [];
  for (const el of segs) {
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    if (parseFloat(s.opacity) < 0.5) continue;
    const t = cleanCaptionText(el);
    if (t) parts.push(t);
  }
  return parts.join(' ');
}

/**
 * Extract text from a caption element, removing duplicated words.
 * YouTube sometimes renders words twice in overlapping caption elements.
 */
function cleanCaptionText(el) {
  let text = el.textContent || '';
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const words = text.split(' ');
  const deduped = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;

    // Case 1: concatenated duplicate "wordword" → "word"
    // Only check words ≥ 6 chars (shorter words are rarely true duplicates)
    let foundSplit = false;
    if (w.length >= 6) {
      for (let split = Math.floor(w.length / 3); split <= Math.floor(w.length * 2 / 3); split++) {
        if (split >= 3 && w.substring(0, split) === w.substring(split, split * 2)) {
          deduped.push(w.substring(0, split));
          foundSplit = true;
          break;
        }
      }
    }
    if (foundSplit) continue;

    // Case 2: adjacent same word "word word" → "word"
    if (deduped.length > 0 &&
        deduped[deduped.length - 1].toLowerCase() === w.toLowerCase()) {
      continue;
    }

    deduped.push(w);
  }
  return deduped.join(' ');
}

function enableYouTubeCaptions() {
  try {
    let btn = document.querySelector('.ytp-subtitles-button');
    if (!btn) {
      const p = document.querySelector('#movie_player');
      if (p?.shadowRoot) btn = p.shadowRoot.querySelector('.ytp-subtitles-button');
    }
    if (btn && btn.getAttribute('aria-pressed') !== 'true') {
      btn.click();
      console.log(`${LOG_PREFIX} [DOM] CC enabled`);
    }
  } catch(e) {}
}

/**
 * Extract all complete sentences from caption text.
 * A sentence is text ending with . ! or ?
 * Returns array of sentences in order, or null if no complete sentences found.
 */
function extractSentences(text) {
  if (!text) return null;
  // Split on sentence boundaries, keeping the delimiter
  const parts = text.match(/[^.!?]*[.!?]/g);
  if (!parts || parts.length === 0) return null;
  return parts.map(s => s.trim()).filter(s => s.length > 1);
}

// ─── DOM Caption Observer (sentence-based) ──────────────────────

export function startDOMCaptionObserver(video, onText) {
  try {
    enableYouTubeCaptions();
    if (!document.querySelector('#movie_player')) {
      console.warn(`${LOG_PREFIX} [DOM] No #movie_player`);
      return null;
    }

    const spokenSet = new Set();
    const MAX_SPOKEN = 50;
    let lastRaw = '';
    let count = 0;

    let changeN = 0; // Count every caption change
    const timer = setInterval(() => {
      const raw = getVisibleCaptionText();
      const t = video.currentTime;
      if (video.paused || t < 0.1) return;

      if (!raw) {
        // Captions disappeared → flush any pending fragment
        if (lastRaw && !extractSentences(lastRaw) && lastRaw.length > 15) {
          const ft = lastRaw.trim();
          if (!spokenSet.has(ft)) {
            spokenSet.add(ft);
            console.log(`${LOG_PREFIX} [DOM] ➤ flush(empty): "${ft.substring(0, 60)}"`);
            onText({ text: ft, start: t - 2, duration: 2 });
          }
        }
        lastRaw = ''; return;
      }
      if (raw === lastRaw) return;

      // Detect caption RESET: new text doesn't extend old text
      if (lastRaw && !raw.startsWith(lastRaw)) {
        // Old text is being replaced — flush any unspoken fragment
        const oldSentences = extractSentences(lastRaw);
        if (!oldSentences && lastRaw.length > 15) {
          const ft = lastRaw.trim();
          if (!spokenSet.has(ft)) {
            spokenSet.add(ft);
            console.log(`${LOG_PREFIX} [DOM] ➤ flush(reset): "${ft.substring(0, 60)}"`);
            onText({ text: ft, start: t - 2, duration: 2 });
          }
        }
      }

      // Log EVERY caption change — compact format
      changeN++;
      lastRaw = raw;
      const sentences = extractSentences(raw);
      const tag = sentences ? `+${sentences.length}s` : '…'; // +Ns = N sentences, … = no punct
      console.log(`${LOG_PREFIX} [CC#${changeN} ${tag}] "${raw.substring(0, 100)}"`);

      // Send ALL new complete sentences as one combined block
      // for better translation context (whole sentences, not fragments)
      const newSentences = [];
      for (const s of sentences) {
        if (spokenSet.has(s)) {
          console.log(`${LOG_PREFIX} [DOM] ⊘ skip(dup): "${s.substring(0, 60)}"`);
          continue;
        }
        const recent = Array.from(spokenSet).slice(-20);
        if (recent.some(sp => sp.includes(s))) {
          console.log(`${LOG_PREFIX} [DOM] ⊘ skip(sub): "${s.substring(0, 60)}"`);
          continue;
        }
        spokenSet.add(s);
        newSentences.push(s);
      }
      if (spokenSet.size > MAX_SPOKEN) spokenSet.clear();

      if (newSentences.length > 0) {
        count++;
        const combined = newSentences.join(' ');
        if (count <= 5 || count % 10 === 0) {
          console.log(`${LOG_PREFIX} [DOM] #${count} "${combined.substring(0, 80)}"`);
        }
        onText({ text: combined, start: t, duration: 1 });
      }
    }, 150);

    console.log(`${LOG_PREFIX} [DOM] Sentence observer started`);
    return { stop: () => clearInterval(timer) };
  } catch (e) {
    console.warn(`${LOG_PREFIX} [DOM] Failed:`, e);
    return null;
  }
}

// ─── API-based extraction (strategies 2 & 3) ────────────────────

function getCaptionTracksFromPlayerResponse() {
  try {
    const d = window.ytInitialPlayerResponse;
    if (!d?.captions) return null;
    const t = d.captions.playerCaptionsTracklistRenderer?.captionTracks;
    return t?.length ? t : null;
  } catch { return null; }
}

function selectEnglishTrack(tracks) {
  if (!tracks?.length) return null;
  const en = tracks.filter(t => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
  if (!en.length) return null;
  return en.find(t => !t.kind || t.kind !== 'asr') || en[0];
}

function parseJSON3(data) {
  const segs = [];
  for (const ev of (data.events || [])) {
    if (!ev.segs) continue;
    const t = ev.segs.map(s => s.utf8 || '').join('').replace(/<[^>]+>/g, '').trim();
    if (t) segs.push({ text: t, start: ev.tStartMs / 1000, duration: ev.dDurationMs / 1000 });
  }
  return segs;
}

function parseXML(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) return [];
  const segs = [];
  for (const el of doc.querySelectorAll('text')) {
    const t = el.textContent?.replace(/<[^>]+>/g, '').trim();
    if (t) segs.push({ text: t, start: +el.getAttribute('start') || 0, duration: +el.getAttribute('dur') || 0 });
  }
  return segs;
}

async function fetchTimedText(url) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'fmt=json3');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  return t.trim().startsWith('{') ? parseJSON3(JSON.parse(t)) : parseXML(t);
}

async function fetchCaptionsDirectly(videoId) {
  for (const lang of ['en', 'en-US', 'en-GB']) {
    for (const fmt of ['&fmt=json3', '']) {
      try {
        const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${fmt}`;
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) continue;
        const t = await r.text();
        if (!t || t.length < 20 || /^\s*<!DOCTYPE|<html/i.test(t)) continue;
        const segs = t.trim().startsWith('{') ? parseJSON3(JSON.parse(t)) : parseXML(t);
        if (segs?.length) { console.log(`${LOG_PREFIX} API: ${segs.length}`); return segs; }
      } catch(e) {}
    }
  }
  return null;
}

export async function extractCaptions() {
  const vid = getVideoId();
  if (!vid) return null;
  const tracks = getCaptionTracksFromPlayerResponse();
  if (tracks) {
    const en = selectEnglishTrack(tracks);
    if (en) {
      try { const s = await fetchTimedText(en.baseUrl); if (s?.length) return s; } catch(e) {}
    }
  }
  const s = await fetchCaptionsDirectly(vid);
  if (s?.length) return s;
  return null;
}

export function segmentsToPhrases(segments) {
  if (!segments?.length) return [];
  const gap = YOUTUBE.PHRASE_BOUNDARY_GAP_MS / 1000;
  const phrases = [];
  let cur = { text: segments[0].text, start: segments[0].start, end: segments[0].start + segments[0].duration };
  for (let i = 1; i < segments.length; i++) {
    const s = segments[i], e = s.start + s.duration;
    if (s.start - cur.end >= gap) {
      if (cur.text.trim()) phrases.push({ ...cur });
      cur = { text: s.text, start: s.start, end: e };
    } else { cur.text += ' ' + s.text; cur.end = e; }
  }
  if (cur.text.trim()) phrases.push(cur);
  return phrases;
}

export function waitForPlayerResponse() {
  return new Promise(resolve => {
    if (window.ytInitialPlayerResponse) { resolve(); return; }
    const i = setInterval(() => { if (window.ytInitialPlayerResponse) { clearInterval(i); resolve(); } }, 200);
    setTimeout(() => { clearInterval(i); resolve(); }, 5000);
  });
}
