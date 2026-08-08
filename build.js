// LiveDub — Build Script
// Uses esbuild to bundle the ES module content script into a single file
// that Manifest V3 can load. Also copies static assets.

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Ensure dist subdirectories exist
for (const sub of ['src/content', 'src/content/ui', 'src/options', 'icons']) {
  const dir = path.join(distDir, sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Build options for each entry point */
const builds = [
  {
    entry: 'src/content/index.js',
    out: 'dist/src/content/index.js',
    label: 'content-script',
  },
  {
    entry: 'src/options/index.js',
    out: 'dist/src/options/index.js',
    label: 'options-page',
  },
];

async function buildAll() {
  console.log('[LiveDub] Building...');
  const start = Date.now();

  for (const build of builds) {
    try {
      await esbuild.build({
        entryPoints: [build.entry],
        outfile: build.out,
        bundle: true,
        format: 'esm',       // ES modules for service worker; iife for content
        platform: 'browser',
        target: ['chrome100', 'edge100'],
        minify: false,       // Keep readable for debugging
        sourcemap: false,
        logLevel: 'info',
        // For content scripts, we want IIFE format (not ESM)
        ...(build.label === 'content-script' ? { format: 'iife', globalName: '__livedub_entry__' } : {}),
      });
      console.log(`  ✅ ${build.label} → ${build.out}`);
    } catch (e) {
      console.error(`  ❌ ${build.label} failed:`, e.message);
    }
  }

  // Copy static files
  const copies = [
    ['manifest.json', 'dist/manifest.json'],
    ['src/content/ui/bubble.css', 'dist/src/content/ui/bubble.css'],
    ['src/options/index.html', 'dist/src/options/index.html'],
    ['src/options/index.css', 'dist/src/options/index.css'],
    ['icons/icon-16.png', 'dist/icons/icon-16.png'],
    ['icons/icon-48.png', 'dist/icons/icon-48.png'],
    ['icons/icon-128.png', 'dist/icons/icon-128.png'],
  ];

  for (const [src, dest] of copies) {
    const srcPath = path.join(__dirname, src);
    const destPath = path.join(__dirname, dest);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  📋 ${src} → ${dest}`);
    } else {
      console.warn(`  ⚠️  ${src} not found, skipping`);
    }
  }

  console.log(`[LiveDub] Build complete in ${Date.now() - start}ms`);
}

if (watch) {
  console.log('[LiveDub] Watching for changes...');
  // Simple polling watch
  const Watcher = require('fs').watch;
  // Rebuild on any source change
  let timer;
  fs.watch(path.join(__dirname, 'src'), { recursive: true }, (event, filename) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(buildAll, 300);
  });
  fs.watch(path.join(__dirname, 'manifest.json'), (event, filename) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(buildAll, 300);
  });
  buildAll();
} else {
  buildAll().catch((e) => {
    console.error('Build failed:', e);
    process.exit(1);
  });
}
