/**
 * Google Flow Prompt Automator - Build Script
 * Bundles TypeScript and static extension assets into /dist
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const distDir = path.resolve(__dirname, 'dist');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function copyStaticAssets() {
  console.log('Copying static assets...');
  copyFile(path.join(__dirname, 'src', 'manifest.json'), path.join(distDir, 'manifest.json'));
  copyFile(path.join(__dirname, 'src', 'popup', 'index.html'), path.join(distDir, 'popup', 'index.html'));
  copyFile(path.join(__dirname, 'src', 'popup', 'popup.css'), path.join(distDir, 'popup', 'popup.css'));
  copyFile(path.join(__dirname, 'src', 'options', 'index.html'), path.join(distDir, 'options', 'index.html'));
  copyFile(path.join(__dirname, 'src', 'options', 'options.css'), path.join(distDir, 'options', 'options.css'));
  copyDir(path.join(__dirname, 'src', 'icons'), path.join(distDir, 'icons'));
}

async function build() {
  const startTime = Date.now();
  console.log('Building Google Flow Prompt Automator extension...');

  ensureDir(distDir);
  copyStaticAssets();

  const configs = [
    // 1. Service Worker (ESM format)
    {
      entryPoints: [path.join(__dirname, 'src', 'background', 'service-worker.ts')],
      outfile: path.join(distDir, 'background', 'service-worker.js'),
      bundle: true,
      format: 'esm',
      target: 'es2022',
      platform: 'browser',
      sourcemap: true,
      logLevel: 'info',
    },
    // 2. Content Script (IIFE format so it runs in isolated world without module errors)
    {
      entryPoints: [path.join(__dirname, 'src', 'content', 'flow-automation.ts')],
      outfile: path.join(distDir, 'content', 'flow-automation.js'),
      bundle: true,
      format: 'iife',
      target: 'es2022',
      platform: 'browser',
      sourcemap: true,
      logLevel: 'info',
    },
    // 3. Popup Script (ESM format)
    {
      entryPoints: [path.join(__dirname, 'src', 'popup', 'popup.ts')],
      outfile: path.join(distDir, 'popup', 'popup.js'),
      bundle: true,
      format: 'esm',
      target: 'es2022',
      platform: 'browser',
      sourcemap: true,
      logLevel: 'info',
    },
    // 4. Options Script (ESM format)
    {
      entryPoints: [path.join(__dirname, 'src', 'options', 'options.ts')],
      outfile: path.join(distDir, 'options', 'options.js'),
      bundle: true,
      format: 'esm',
      target: 'es2022',
      platform: 'browser',
      sourcemap: true,
      logLevel: 'info',
    },
  ];

  if (isWatch) {
    console.log('Starting build in watch mode...');
    for (const cfg of configs) {
      const ctx = await esbuild.context(cfg);
      await ctx.watch();
    }
  } else {
    for (const cfg of configs) {
      await esbuild.build(cfg);
    }
    const elapsed = Date.now() - startTime;
    console.log(`✓ Extension build completed successfully in ${elapsed}ms!`);
    console.log(`Target directory ready for "Load unpacked": ${distDir}`);
  }
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
