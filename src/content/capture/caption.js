// LiveDub — YouTube Caption Extractor
// PRIMARY: Transcript-First — ytInitialPlayerResponse → timedtext JSON3
// FALLBACK: DOM observation of visible captions

import { YOUTUBE, LOG_PREFIX } from '../../shared/constants.js';

function getVideoId() {
  const m = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ─── Primary: Transcript-First via timedtext API ──────────────

/**
 * Get English caption track from ytInitialPlayerResponse.
 * The baseUrl includes auth params (expire, signature, key).
 */
function getEnglishCaptionTrack() {
  try {
    // Try multiple sources for caption data
    let tracks = null;

    // Source 1: ytInitialPlayerResponse (most common)
    let data = window.ytInitialPlayerResponse;
    if (data?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
      tracks = data.captions.playerCaptionsTracklistRenderer.captionTracks;
    }

    // Source 2: ytInitialData (embedded page data)
    if (!tracks) {
      data = window.ytInitialData;
      const contents = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
      // Not standard for captions but worth checking
    }

    // Source 3: Data from MAIN-world injection (waitForPlayerResponse)
    if (!tracks && window.__livedub_captions?.playerCaptionsTracklistRenderer?.captionTracks) {
      tracks = window.__livedub_captions.playerCaptionsTracklistRenderer.captionTracks;
    }

    if (!tracks?.length) {
      console.log(`${LOG_PREFIX} [Transcript] No tracks. ytIPR:${!!window.ytInitialPlayerResponse} __livedub:${!!window.__livedub_captions}`);
      return null;
    }

    console.log(`${LOG_PREFIX} [Transcript] ${tracks.length} tracks:`, tracks.map(t => `${t.languageCode}(${t.kind || 'manual'})`).join(', '));

    const en = tracks.filter(t => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
    if (!en.length) return null;
    return en.find(t => !t.kind || t.kind !== 'asr') || en[0];
  } catch (e) { console.warn(`${LOG_PREFIX} [Transcript] error:`, e); return null; }
}

/** Parse timedtext JSON3 format into clean segments. */
function parseJSON3(data) {
  const events = data.events || [];
  const segments = [];
  for (const ev of events) {
    if (!ev.segs) continue;
    const text = ev.segs.map(s => s.utf8 || '').join('')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    if (text) {
      segments.push({ text, start: ev.tStartMs / 1000, duration: ev.dDurationMs / 1000 });
    }
  }
  return segments;
}

/** Fetch and parse timedtext from YouTube's authenticated baseUrl. */
async function fetchTimedtext(baseUrl) {
  // baseUrl from player response already has auth params
  const url = baseUrl.includes('fmt=json3') ? baseUrl : baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  if (!text || text.length < 20) throw new Error('Empty response');

  try {
    return parseJSON3(JSON.parse(text));
  } catch {
    // Fallback XML parse
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('XML parse error');
    const segs = [];
    for (const el of doc.querySelectorAll('text')) {
      const t = el.textContent?.replace(/<[^>]+>/g, '').trim();
      if (t) segs.push({ text: t, start: +el.getAttribute('start') || 0, duration: +el.getAttribute('dur') || 0 });
    }
    return segs;
  }
}

/**
 * Main entry: extract captions from YouTube's timedtext API.
 * Returns clean segments [{text, start, duration}...] or null.
 */
export async function extractCaptions() {
  const vid = getVideoId();
  if (!vid) return null;

  console.log(`${LOG_PREFIX} [Transcript] Extracting for ${vid}`);
  const track = getEnglishCaptionTrack();
  if (!track) {
    console.log(`${LOG_PREFIX} [Transcript] No English track found`);
    return null;
  }

  console.log(`${LOG_PREFIX} [Transcript] Fetching ${track.languageCode} (${track.kind || 'manual'})`);
  try {
    const segments = await fetchTimedtext(track.baseUrl);
    if (segments?.length) {
      console.log(`${LOG_PREFIX} [Transcript] ✅ ${segments.length} segments`);
      return segments;
    }
  } catch (e) {
    console.warn(`${LOG_PREFIX} [Transcript] Fetch failed:`, e.message);
  }
  return null;
}

// ─── Phrase grouping ──────────────────────────────────────────

export function segmentsToPhrases(segments) {
  if (!segments?.length) return [];
  const gap = YOUTUBE.PHRASE_BOUNDARY_GAP_MS / 1000;
  const phrases = [];
  let cur = { text: segments[0].text, start: segments[0].start, end: segments[0].start + segments[0].duration };
  for (let i = 1; i < segments.length; i++) {
    const s = segments[i], e = s.start + s.duration;
    if (s.start - cur.end >= gap) {
      if (cur.text.trim()) phrases.push({ text: cur.text.trim(), start: cur.start, end: cur.end });
      cur = { text: s.text, start: s.start, end: e };
    } else { cur.text += ' ' + s.text; cur.end = e; }
  }
  if (cur.text.trim()) phrases.push({ text: cur.text.trim(), start: cur.start, end: cur.end });
  return phrases;
}

// ─── Fallback: DOM caption observer ───────────────────────────

function getVisibleCaptionText() {
  const wins = document.querySelectorAll('.caption-window');
  for (let i = wins.length - 1; i >= 0; i--) {
    const s = window.getComputedStyle(wins[i]);
    if (s.display !== 'none' && s.visibility !== 'hidden') {
      const t = wins[i].textContent.trim().replace(/\[music\]|\[applause\]|\[laughter\]|\[cheering\]/gi, '');
      if (t) return t;
    }
  }
  return '';
}

function extractSentences(text) {
  if (!text) return null;
  const parts = text.match(/[^.!?]*[.!?]/g);
  if (!parts?.length) return null;
  return parts.map(s => s.trim()).filter(s => s.length > 1);
}

function enableCC() {
  try {
    let btn = document.querySelector('.ytp-subtitles-button');
    const p = document.querySelector('#movie_player');
    if (!btn && p?.shadowRoot) btn = p.shadowRoot.querySelector('.ytp-subtitles-button');
    if (btn && btn.getAttribute('aria-pressed') !== 'true') btn.click();
  } catch {}
}

export function startDOMCaptionObserver(video, onText) {
  try {
    enableCC();
    if (!document.querySelector('#movie_player')) return null;

    const spokenSet = new Set();
    let lastRaw = '';
    let batchBuf = '';
    let batchStart = 0;

    const timer = setInterval(() => {
      const raw = getVisibleCaptionText();
      const t = video.currentTime;
      if (!raw || raw === lastRaw) return;

      // Detect caption RESET
      if (lastRaw && !raw.startsWith(lastRaw) && lastRaw.length > 15 && !extractSentences(lastRaw)) {
        if (!spokenSet.has(lastRaw)) {
          spokenSet.add(lastRaw);
          // Add to batch instead of sending immediately
          batchBuf += (batchBuf ? ' ' : '') + lastRaw.trim();
          batchStart = batchStart || t;
          console.log(`${LOG_PREFIX} [DOM] ➤ reset batch: "${lastRaw.substring(0, 60)}"`);
        }
      }
      lastRaw = raw;

      const sentences = extractSentences(raw);
      if (!sentences) return;

      // Collect genuinely new complete sentences
      const newOnes = [];
      for (const s of sentences) {
        if (spokenSet.has(s)) continue;
        const recent = Array.from(spokenSet).slice(-20);
        if (recent.some(sp => sp.includes(s))) continue;
        spokenSet.add(s);
        newOnes.push(s);
      }
      if (spokenSet.size > 50) spokenSet.clear();

      // Accumulate and batch: don't send individual small fragments
      if (newOnes.length > 0) {
        batchBuf += (batchBuf ? ' ' : '') + newOnes.join(' ');
        batchStart = batchStart || t;
        if (batchBuf.length > 80 || (t - batchStart) > 3) {
          onText({ text: batchBuf.trim(), start: batchStart, duration: t - batchStart });
          batchBuf = '';
          batchStart = 0;
        }
      }
    }, 100);

    console.log(`${LOG_PREFIX} [DOM] Fallback observer started`);
    return { stop: () => clearInterval(timer) };
  } catch (e) {
    return null;
  }
}

export function waitForPlayerResponse() {
  return new Promise(resolve => {
    // Fast path
    if (window.ytInitialPlayerResponse) { resolve(); return; }

    // Poll in content script context
    const i = setInterval(() => {
      if (window.ytInitialPlayerResponse) { clearInterval(i); resolve(); return; }
    }, 200);

    // Inject MAIN-world script to read the player response directly
    try {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          var check = setInterval(function() {
            if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
              clearInterval(check);
              window.postMessage({type:'LIVEDUB_PLAYER_RESPONSE', data: window.ytInitialPlayerResponse.captions}, '*');
            }
          }, 200);
          setTimeout(function() { clearInterval(check); }, 5000);
        })();
      `;
      document.documentElement.appendChild(script);
      script.remove();

      const handler = (e) => {
        if (e.data?.type === 'LIVEDUB_PLAYER_RESPONSE') {
          window.removeEventListener('message', handler);
          // Copy data to content script context
          window.__livedub_captions = e.data.data;
          clearInterval(i);
          resolve();
        }
      };
      window.addEventListener('message', handler);
    } catch(e) { /* ignore, polling will handle it */ }

    setTimeout(() => { clearInterval(i); resolve(); }, 8000);
  });
}
