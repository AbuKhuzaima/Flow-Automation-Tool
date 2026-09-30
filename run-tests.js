/**
 * Google Flow Prompt Automator - Test Runner
 * Compiles test TypeScript files and executes via node:test
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testDir = path.resolve(__dirname, 'tests');
const distTestDir = path.resolve(__dirname, 'dist-test');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function run() {
  console.log('Compiling test suites with esbuild...');
  ensureDir(distTestDir);

  const testFiles = fs
    .readdirSync(testDir)
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => path.join(testDir, f));

  for (const file of testFiles) {
    const basename = path.basename(file, '.ts') + '.js';
    await esbuild.build({
      entryPoints: [file],
      outfile: path.join(distTestDir, basename),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node20',
      sourcemap: true,
    });
  }

  console.log('Running test suites via node:test...\n');

  const compiledTests = fs
    .readdirSync(distTestDir)
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.join(distTestDir, f));

  const result = spawnSync(process.execPath, ['--test', ...compiledTests], {
    stdio: 'inherit',
    cwd: __dirname,
  });

  if (result.status !== 0) {
    console.error('\n❌ Test execution failed.');
    process.exit(result.status || 1);
  } else {
    console.log('\n✓ All test suites passed successfully!');
  }
}

run().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
