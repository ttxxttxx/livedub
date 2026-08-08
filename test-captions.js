// LiveDub — Self-test for caption sentence extraction
// Run: node test-captions.js

// Simulated getVisibleCaptionText return values over time
const testRawTexts = [
  // Poll 1-3: growing progressively
  "In the 9th century, a modest inscription",
  "In the 9th century, a modest inscription was carved into stone in a temple in India.",
  // Poll 4-5: YouTube truncates (tail fragment ends with period!)
  "was carved into stone in a temple in India.",
  "India.",
  // Poll 6-7: new content growing
  "flower garlands would be given for it every day.",
  // Poll 8: truncation
  "every day.",
  // Poll 9-10: alternating lines
  "The year was 1896.",
  "Britain was a colonial power.",
  "The year was 1896.",
  "Britain was a colonial power.",
  // Poll 11: new content
  "to connect Kenya and Uganda.",
];

// ---- Logic copied from caption.js ----
function extractSentences(text) {
  if (!text) return null;
  const parts = text.match(/[^.!?]*[.!?]/g);
  if (!parts || parts.length === 0) return null;
  return parts.map(s => s.trim()).filter(s => s.length > 1);
}

const spokenSet = new Set();
let count = 0;
let errors = 0;

for (const raw of testRawTexts) {
  const sentences = extractSentences(raw);
  if (!sentences) {
    console.log(`  raw="${raw}" → no complete sentences`);
    continue;
  }
  for (const s of sentences) {
    if (spokenSet.has(s)) {
      console.log(`  ✅ SKIP (dup): "${s}"`);
      continue;
    }
    const isSubstring = Array.from(spokenSet).some(spoken => spoken.includes(s));
    if (isSubstring) {
      console.log(`  ✅ SKIP (substr): "${s}"`);
      continue;
    }
    spokenSet.add(s);
    count++;
    console.log(`  🗣 SPEAK #${count}: "${s}"`);
  }
}

console.log(`\n--- Results ---`);
console.log(`Total spoken: ${count}`);
const expected = [
  "In the 9th century, a modest inscription was carved into stone in a temple in India.",
  "flower garlands would be given for it every day.",
  "The year was 1896.",
  "Britain was a colonial power.",
  "to connect Kenya and Uganda.",
];

console.log(`Expected: ${expected.length} sentences`);
let allGood = true;
for (const e of expected) {
  if (!spokenSet.has(e)) {
    console.log(`  ❌ MISSING: "${e}"`);
    allGood = false;
  }
}
// Check no extras
for (const s of spokenSet) {
  if (!expected.includes(s)) {
    console.log(`  ❌ EXTRA: "${s}"`);
    allGood = false;
  }
}

if (allGood) {
  console.log(`✅ ALL TESTS PASSED`);
} else {
  console.log(`❌ TESTS FAILED`);
  process.exit(1);
}
