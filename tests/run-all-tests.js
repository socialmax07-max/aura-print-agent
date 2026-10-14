/**
 * AURA PRINT PRO — MASTER TEST SUITE RUNNER & CI ORCHESTRATOR
 * File: tests/run-all-tests.js
 * Platform: Node.js (v18+)
 * Owner: Sabir Ansari
 * 
 * Executes all automated test suites sequentially, captures standard output,
 * formats terminal diagnostics, and exits with code 0 on complete pass or code 1 on failure.
 */

const { spawn } = require('child_process');
const path = require('path');
const { performance } = require('perf_hooks');

// ANSI Terminal Formatting Helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

const TEST_SUITES = [
  {
    name: 'Canonical Pricing Engine',
    file: 'pricing-engine.test.js',
    description: 'Duplex ceiling arithmetic, odd-page sheet counts, B&W vs Color rates, rounding'
  },
  {
    name: 'Input & Business Validators',
    file: 'validators.test.js',
    description: 'Page range parsing (1-3,5,8), 100MB limits, MIME filters, NPCI VPA, 4-6 digit PIN'
  },
  {
    name: 'Finite State Machine (FSM)',
    file: 'order-states.test.js',
    description: 'Order lifecycle transitions, cash PIN path, spooler recovery, illegal jumps'
  },
  {
    name: 'NPCI UPI Deep-Link Generator',
    file: 'upi-generator.test.js',
    description: 'upi://pay URI schema, parameter encoding, 2-decimal rounding, INR bounds'
  },
  {
    name: 'Cryptographic Utilities & Integrity',
    file: 'crypto-utils.test.js',
    description: 'Order ID collision tests, timingSafeEqual, HMAC quote checksums, salted PINs'
  }
];

/**
 * Runs a single test file using Node's native test runner
 * @param {Object} suite 
 * @returns {Promise<{name: string, file: string, success: boolean, durationMs: number, stdout: string, stderr: string}>}
 */
function runSuite(suite) {
  return new Promise((resolve) => {
    const filePath = path.resolve(__dirname, suite.file);
    const startTime = performance.now();

    const child = spawn(process.execPath, ['--test', filePath], {
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const durationMs = Math.round(performance.now() - startTime);
      resolve({
        name: suite.name,
        file: suite.file,
        description: suite.description,
        success: code === 0,
        durationMs,
        stdout,
        stderr
      });
    });

    child.on('error', (err) => {
      const durationMs = Math.round(performance.now() - startTime);
      resolve({
        name: suite.name,
        file: suite.file,
        description: suite.description,
        success: false,
        durationMs,
        stdout,
        stderr: err.message
      });
    });
  });
}

async function main() {
  console.clear();
  console.log(`${colors.bright}${colors.cyan}================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}      AURA PRINT PRO — MASTER TEST SUITE RUNNER & AUDIT         ${colors.reset}`);
  console.log(`${colors.dim}  Author: Sabir Ansari | Target: CI / Development Regression Checks  ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================${colors.reset}\n`);

  console.log(`${colors.dim}Executing ${TEST_SUITES.length} test suites with Node.js ${process.version}...\n${colors.reset}`);

  const overallStartTime = performance.now();
  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (let i = 0; i < TEST_SUITES.length; i++) {
    const suite = TEST_SUITES[i];
    const indexTag = `[${i + 1}/${TEST_SUITES.length}]`;

    process.stdout.write(`${colors.dim}${indexTag}${colors.reset} Running ${colors.bright}${suite.name}${colors.reset} (${suite.file})... `);

    const result = await runSuite(suite);
    results.push(result);

    if (result.success) {
      totalPassed++;
      console.log(`${colors.green}✔ PASSED${colors.reset} ${colors.dim}(${result.durationMs}ms)${colors.reset}`);
    } else {
      totalFailed++;
      console.log(`${colors.red}✖ FAILED${colors.reset} ${colors.dim}(${result.durationMs}ms)${colors.reset}`);
    }
  }

  const overallDurationMs = Math.round(performance.now() - overallStartTime);

  // Print Detailed Diagnostics for Failed Suites
  if (totalFailed > 0) {
    console.log(`\n${colors.bright}${colors.red}----------------------------------------------------------------${colors.reset}`);
    console.log(`${colors.bright}${colors.red}                  FAILURE DIAGNOSTIC LOGS                       ${colors.reset}`);
    console.log(`${colors.bright}${colors.red}----------------------------------------------------------------${colors.reset}`);

    results.filter(r => !r.success).forEach(r => {
      console.log(`\n${colors.bright}${colors.red}Suite Failed: ${r.name} (${r.file})${colors.reset}`);
      if (r.stderr) {
        console.log(`${colors.red}${r.stderr.trim()}${colors.reset}`);
      }
      if (r.stdout) {
        console.log(`${colors.dim}${r.stdout.trim()}${colors.reset}`);
      }
    });
  }

  // Print Summary Table
  console.log(`\n${colors.bright}================================================================${colors.reset}`);
  console.log(`${colors.bright}                     TEST EXECUTION SUMMARY                     ${colors.reset}`);
  console.log(`${colors.bright}================================================================${colors.reset}`);

  results.forEach(r => {
    const statusMark = r.success ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    const timeStr = `${r.durationMs}ms`.padStart(8);
    const suiteTitle = r.name.padEnd(38);
    console.log(`  [${statusMark}]  ${suiteTitle} ${colors.dim}${timeStr}${colors.reset}`);
  });

  console.log(`${colors.dim}----------------------------------------------------------------${colors.reset}`);
  console.log(`  Total Suites:   ${colors.bright}${TEST_SUITES.length}${colors.reset}`);
  console.log(`  Passed:         ${colors.green}${colors.bright}${totalPassed}${colors.reset}`);
  console.log(`  Failed:         ${totalFailed > 0 ? colors.red : colors.dim}${colors.bright}${totalFailed}${colors.reset}`);
  console.log(`  Total Time:     ${colors.bright}${overallDurationMs}ms${colors.reset}`);
  console.log(`${colors.bright}================================================================${colors.reset}\n`);

  if (totalFailed > 0) {
    console.log(`${colors.red}✖ Regression detected! ${totalFailed} suite(s) failed. Fix issues before deployment.${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.green}✔ All test suites passed cleanly with 100% assertion integrity!${colors.reset}`);
    console.log(`${colors.dim}Platform logic is ready for staging and Netlify production deployment.${colors.reset}\n`);
    process.exit(0);
  }
}

// Execute Runner
main().catch((err) => {
  console.error('\nFatal test runner crash:', err);
  process.exit(1);
});
