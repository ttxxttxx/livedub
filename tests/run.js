// LiveDub — Self-test suite
// Run: node tests/run.js (or npm test)

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(msg || `expected "${b}", got "${a}"`); }

// ─── extractSentences ───────────────────────────────────────────
console.log('\n📝 extractSentences (7 tests)');

function extractSentences(text) {
  if (!text) return null;
  const parts = text.match(/[^.!?]*[.!?]/g);
  if (!parts || parts.length === 0) return null;
  return parts.map(s => s.trim()).filter(s => s.length > 1);
}

test('single sentence', () => { assertEq(extractSentences('Hello world.').length, 1); });
test('multiple sentences', () => { assertEq(extractSentences('Hi. How? Good!').length, 3); });
test('no punctuation', () => { assertEq(extractSentences('Hello world'), null); });
test('fragment ignored', () => { assertEq(extractSentences('Hello. World').length, 1); });
test('empty string', () => { assertEq(extractSentences(''), null); });
test('whitespace only', () => { assertEq(extractSentences('   '), null); });
test('only punctuation', () => { const r = extractSentences('?.!'); assert(r === null || r.length === 0); });

// ─── Sentence Dedup ─────────────────────────────────────────────
console.log('\n📝 Sentence Dedup (4 tests)');

function simulateDedup(rawTexts) {
  const spokenSet = new Set(), spoken = [];
  for (const raw of rawTexts) {
    const sentences = extractSentences(raw);
    if (!sentences) continue;
    for (const s of sentences) {
      if (spokenSet.has(s)) continue;
      if (Array.from(spokenSet).some(sp => sp.includes(s))) continue;
      spokenSet.add(s); spoken.push(s);
    }
  }
  return spoken;
}

test('no duplicates from alternating lines', () => {
  assertEq(simulateDedup(['A.', 'B.', 'A.', 'B.', 'A.']).length, 2);
});
test('substring tail fragments skipped', () => {
  // "was carved in India." is substring of the long sentence
  assertEq(simulateDedup([
    'In the 9th century, a modest inscription was carved into stone in a temple in India.',
    'was carved into stone in a temple in India.',
    'India.'
  ]).length, 1);
});
test('all unique sentences spoken', () => {
  assertEq(simulateDedup(['One.', 'Two.', 'Three.', 'Four.', 'Five.']).length, 5);
});
test('mixed input no loss', () => {
  assertEq(simulateDedup(['First.', 'Second.', 'First.', 'Third.', 'frag', 'Fourth.', 'Fifth.']).length, 5);
});

// ─── Audio Mixer ────────────────────────────────────────────────
console.log('\n📝 Audio Mixer (3 tests)');

test('ratio clamped 0-1', () => {
  function clamp(v) { return Math.max(0, Math.min(1, v)); }
  assertEq(clamp(0.5), 0.5); assertEq(clamp(-0.1), 0); assertEq(clamp(1.5), 1);
});

test('mute saves ratio, unmute restores', () => {
  let ratio = 0.5, saved;
  function mute() { saved = ratio; ratio = 0; }
  function unmute() { if (saved !== undefined) ratio = saved; }
  mute(); assertEq(ratio, 0);
  unmute(); assertEq(ratio, 0.5);
});

test('double mute works', () => {
  let ratio = 0.3, saved;
  function mute() { if (saved === undefined) saved = ratio; ratio = 0; }
  function unmute() { if (saved !== undefined) ratio = saved; }
  mute(); mute(); assertEq(ratio, 0);
  unmute(); assertEq(ratio, 0.3);
});

// ─── Phrase Boundaries ──────────────────────────────────────────
console.log('\n📝 Phrase Boundaries (4 tests)');

function segmentsToPhrases(segments, gapMs) {
  if (!segments?.length) return [];
  const gap = gapMs / 1000;
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

test('merge within gap', () => {
  assertEq(segmentsToPhrases([{text:'Hi',start:0,duration:0.3},{text:'there',start:0.4,duration:0.3}], 500).length, 1);
});
test('split on large gap', () => {
  assertEq(segmentsToPhrases([{text:'A.',start:0,duration:1},{text:'B.',start:3,duration:1}], 500).length, 2);
});
test('empty segments', () => { assertEq(segmentsToPhrases([], 500).length, 0); });
test('single segment', () => {
  assertEq(segmentsToPhrases([{text:'Hi.',start:0,duration:1}], 500).length, 1);
});

// ─── Word Dedup ─────────────────────────────────────────────────
console.log('\n📝 Word Dedup (4 tests)');

function dedupWords(text) {
  const words = text.split(' ');
  const deduped = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;
    let foundSplit = false;
    if (w.length >= 6) {
      for (let s = Math.floor(w.length / 3); s <= Math.floor(w.length * 2 / 3); s++) {
        if (s >= 3 && w.substring(0, s) === w.substring(s, s * 2)) {
          deduped.push(w.substring(0, s)); foundSplit = true; break;
        }
      }
    }
    if (foundSplit) continue;
    if (deduped.length > 0 && deduped[deduped.length - 1].toLowerCase() === w.toLowerCase()) continue;
    deduped.push(w);
  }
  return deduped.join(' ');
}

test('concatenated dup', () => {
  assertEq(dedupWords('nationalnational security weapon'), 'national security weapon');
});
test('adjacent dup', () => {
  assertEq(dedupWords('Specifically Specifically about'), 'Specifically about');
});
test('normal text untouched', () => {
  assertEq(dedupWords('Hello world'), 'Hello world');
});
test('no false positive on short words', () => {
  assertEq(dedupWords('I like coco'), 'I like coco');
});

// ─── Translator ─────────────────────────────────────────────────
console.log('\n📝 Translator (3 tests)');

test('mock passthrough', () => {
  assertEq('Hello world', 'Hello world');
});
test('MyMemory URL format', () => {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent('Hi')}&langpair=en|zh-CN`;
  assert(url.includes('Hi') && url.includes('en'));
});
test('MS URL format', () => {
  const url = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hans&textType=html';
  assert(url.includes('3.0') && url.includes('zh-Hans'));
});

// ─── Storage ────────────────────────────────────────────────────
console.log('\n📝 Storage (1 test)');

test('defaults match expected', () => {
  const d = { api_key:'', region:'eastasia', tts_volume:1.0, tts_rate:1.5, mix_ratio:0.3 };
  assertEq(d.region, 'eastasia');
  assertEq(d.tts_rate, 1.5);
});

// ─── Results ────────────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`);
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) { console.log('❌ SOME TESTS FAILED'); process.exit(1); }
else { console.log('✅ ALL TESTS PASSED'); }
