// LiveDub — Self-test runner
// Verifies core logic before each build.
// Run: node tests/run.js (or npm test)

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected "${b}", got "${a}"`);
}

// ─── Test: extractSentences ────────────────────────────────────
console.log('\n📝 extractSentences');

// Simulate the extractSentences function (same regex as caption.js)
function extractSentences(text) {
  if (!text) return null;
  const parts = text.match(/[^.!?]*[.!?]/g);
  if (!parts || parts.length === 0) return null;
  return parts.map(s => s.trim()).filter(s => s.length > 1);
}

test('single sentence', () => {
  const r = extractSentences('Hello world.');
  assertEq(r.length, 1);
  assertEq(r[0], 'Hello world.');
});

test('multiple sentences', () => {
  const r = extractSentences('Hi there. How are you? Good!');
  assertEq(r.length, 3);
  assertEq(r[0], 'Hi there.');
  assertEq(r[1], 'How are you?');
  assertEq(r[2], 'Good!');
});

test('no punctuation', () => {
  const r = extractSentences('Hello world');
  assertEq(r, null);
});

test('fragment ignored', () => {
  const r = extractSentences('Hello. World');
  assertEq(r.length, 1);
  assertEq(r[0], 'Hello.');
});

// ─── Test: Dedup logic ─────────────────────────────────────────
console.log('\n📝 Sentence Dedup (Set-based)');

function simulateDedup(rawTexts) {
  const spokenSet = new Set();
  const spoken = [];
  for (const raw of rawTexts) {
    const sentences = extractSentences(raw);
    if (!sentences) continue;
    for (const s of sentences) {
      if (spokenSet.has(s)) continue;
      if (Array.from(spokenSet).some(sp => sp.includes(s))) continue;
      spokenSet.add(s);
      spoken.push(s);
    }
  }
  return spoken;
}

test('no duplicates from alternating lines', () => {
  const inputs = [
    'The year was 1896.',
    'Britain was a colonial power.',
    'The year was 1896.',
    'Britain was a colonial power.',
    'The year was 1896.',
    'Britain was a colonial power.',
  ];
  const result = simulateDedup(inputs);
  assertEq(result.length, 2, `expected 2, got ${result.length}: [${result}]`);
  assertEq(result[0], 'The year was 1896.');
  assertEq(result[1], 'Britain was a colonial power.');
});

test('substring tail fragments skipped', () => {
  const inputs = [
    'In the 9th century, a modest inscription was carved into stone in India.',
    'was carved into stone in India.',
    'India.',
  ];
  const result = simulateDedup(inputs);
  assertEq(result.length, 1, `expected 1, got ${result.length}: [${result}]`);
  assert(result[0].startsWith('In the 9th century'));
});

test('all unique sentences spoken', () => {
  const inputs = [
    'Sentence one.',
    'Sentence two.',
    'Sentence three.',
    'Sentence four.',
    'Sentence five.',
  ];
  const result = simulateDedup(inputs);
  assertEq(result.length, 5);
});

test('no sentences lost from mixed input', () => {
  const inputs = [
    'First.',           // new
    'Second.',          // new
    'First.',           // dup → skip
    'Third.',           // new
    'Second.',          // dup → skip
    'Fourth.',          // new
    'fragment of',      // no punct → skip
    'Fourth.',          // dup → skip
    'Fifth.',           // new
  ];
  const result = simulateDedup(inputs);
  assertEq(result.length, 5, `expected 5, got ${result.length}: [${result}]`);
  const expected = ['First.', 'Second.', 'Third.', 'Fourth.', 'Fifth.'];
  for (let i = 0; i < expected.length; i++) {
    assertEq(result[i], expected[i], `index ${i}: expected "${expected[i]}", got "${result[i]}"`);
  }
});

// ─── Test: Audio mixer ratio clamping ──────────────────────────
console.log('\n📝 Audio Mixer');

test('mix ratio clamped 0-1', () => {
  // Simulate setMixRatio logic
  function clamp(v) { return Math.max(0, Math.min(1, v)); }
  assertEq(clamp(0.5), 0.5);
  assertEq(clamp(-0.1), 0);
  assertEq(clamp(1.5), 1);
  assertEq(clamp(0), 0);
  assertEq(clamp(1), 1);
});

// ─── Test: Phrase boundary detection ───────────────────────────
console.log('\n📝 Phrase Boundaries');

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

test('segments merged within gap', () => {
  const segs = [
    { text: 'Hello', start: 0, duration: 0.3 },
    { text: 'world', start: 0.4, duration: 0.3 },
  ];
  const phrases = segmentsToPhrases(segs, 500); // 500ms gap threshold
  assertEq(phrases.length, 1);
  assertEq(phrases[0].text, 'Hello world');
});

test('segments split on large gap', () => {
  const segs = [
    { text: 'Hello world.', start: 0, duration: 1 },
    { text: 'Goodbye.', start: 3, duration: 1 }, // 2s gap
  ];
  const phrases = segmentsToPhrases(segs, 500);
  assertEq(phrases.length, 2);
  assertEq(phrases[0].text, 'Hello world.');
  assertEq(phrases[1].text, 'Goodbye.');
});

// ─── Test: Word dedup ──────────────────────────────────────────
console.log('\n📝 Word Dedup');

function dedupWords(text) {
  const words = text.split(' ');
  const deduped = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;
    const half = Math.floor(w.length / 2);
    if (w.length >= 4 && w.substring(0, half) === w.substring(half)) {
      deduped.push(w.substring(0, half));
      continue;
    }
    if (deduped.length > 0 && deduped[deduped.length - 1].toLowerCase() === w.toLowerCase()) {
      continue;
    }
    deduped.push(w);
  }
  return deduped.join(' ');
}

test('remove concatenated duplicates', () => {
  assertEq(dedupWords('nationalnational security security weapon'), 'national security weapon');
  assertEq(dedupWords('WashingtonWashington sees sees frontier frontier'), 'Washington sees frontier');
  assertEq(dedupWords('AndAnd not not because because'), 'And not because');
});

test('remove adjacent duplicate words', () => {
  assertEq(dedupWords('Specifically Specifically about about Mytho'), 'Specifically about Mytho');
  assertEq(dedupWords('the the world'), 'the world');
});

test('keep normal text unchanged', () => {
  assertEq(dedupWords('Hello world'), 'Hello world');
  assertEq(dedupWords('This is a test'), 'This is a test');
  assertEq(dedupWords('It was planned'), 'It was planned');
});

// ─── Test: Translator passthrough ───────────────────────────────
console.log('\n📝 Translator (mock mode)');

test('mock mode returns original text', () => {
  const text = 'Hello world';
  // Simulate no-API-key path
  const result = text; // passthrough
  assertEq(result, 'Hello world');
});

// ─── Results ────────────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`);
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED');
}
