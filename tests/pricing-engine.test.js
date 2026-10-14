/**
 * AURA PRINT PRO — PRICING ENGINE AUTOMATED TEST SUITE
 * Owner: Sabir Ansari
 * 
 * Verifies all 8 mandatory business test vectors from Part 2 specification:
 * 1. 3 B&W pages, 1 copy, single-sided = ₹6
 * 2. 3 B&W pages, 1 copy, duplex = ₹6
 * 3. 3 B&W pages, 2 copies, duplex = ₹12
 * 4. 10 B&W pages, 2 copies, single-sided = ₹40
 * 5. 3 colour pages, 1 copy, single-sided = ₹30
 * 6. 3 colour pages, 1 copy, duplex = ₹32
 * 7. 3 colour pages, 2 copies, duplex = ₹64
 * 8. 5 B&W pages, 3 copies, duplex = ₹27
 */

const assert = require('assert');
const { calculatePrintQuote, verifyQuoteIntegrity, DEFAULT_RATES } = require('../src/shared/pricing-engine.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${testName}`);
  } catch (error) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${testName}`);
    console.error(`     Reason: ${error.message}`);
  }
}

console.log('====================================================');
console.log('   AURA PRINT PRO - PRICING ENGINE VALIDATION RUN   ');
console.log('====================================================\n');

console.log('--- Suite 1: Mandatory Business Spec Requirements ---');

runTest('Vector 1: 3 B&W pages, 1 copy, single-sided => ₹6 (3 pages * 1 copy * ₹2)', () => {
  const quote = calculatePrintQuote({
    selectedPages: 3,
    copies: 1,
    isColor: false,
    isDuplex: false
  });
  assert.strictEqual(quote.totalAmount, 6);
  assert.strictEqual(quote.sheetsPerCopy, 3);
  assert.strictEqual(quote.totalPhysicalSheets, 3);
  assert.strictEqual(quote.billingType, 'BW_SINGLE');
});

runTest('Vector 2: 3 B&W pages, 1 copy, duplex => ₹6 (ceil(3/2)=2 sheets * 1 copy * ₹3)', () => {
  const quote = calculatePrintQuote({
    selectedPages: 3,
    copies: 1,
    isColor: false,
    isDuplex: true
  });
  assert.strictEqual(quote.totalAmount, 6);
  assert.strictEqual(quote.sheetsPerCopy, 2);
  assert.strictEqual(quote.totalPhysicalSheets, 2);
  assert.strictEqual(quote.billingType, 'BW_DUPLEX');
});

runTest('Vector 3: 3 B&W pages, 2 copies, duplex => ₹12 (ceil(3/2)=2 sheets * 2 copies * ₹3)', () => {
  const quote = calculatePrintQuote({
    selectedPages: 3,
    copies: 2,
    isColor: false,
    isDuplex: true
  });
  assert.strictEqual(quote.totalAmount, 12);
  assert.strictEqual(quote.sheetsPerCopy, 2);
  assert.strictEqual(quote.totalPhysicalSheets, 4);
  assert.strictEqual(quote.billingType, 'BW_DUPLEX');
});

runTest('Vector 4: 10 B&W pages, 2 copies, single-sided => ₹40 (10 pages * 2 copies * ₹2)', () => {
  const quote = calculatePrintQuote({
    selectedPages: 10,
    copies: 2,
    isColor: false,
    isDuplex: false
  });
  assert.strictEqual(quote.totalAmount, 40);
  assert.strictEqual(quote.sheetsPerCopy, 10);
  assert.strictEqual(quote.totalPhysicalSheets, 20);
  assert.strictEqual(quote.billingType, 'BW_SINGLE');
});

runTest('Vector 5: 3 colour pages, 1 copy, single-sided => ₹30 (3 pages * 1 copy * ₹10)', () => {
  const quote = calculatePrintQuote({
    selectedPages: 3,
    copies: 1,
    isColor: true,
    isDuplex: false
  });
  assert.strictEqual(quote.totalAmount, 30);
  assert.strictEqual(quote.sheetsPerCopy, 3);
  assert.strictEqual(quote.totalPhysicalSheets, 3);
  assert.strictEqual(quote.billingType, 'COLOR_SINGLE');
});

runTest('Vector 6: 3 colour pages, 1 copy, duplex => ₹32 (ceil(3/2)=2 sheets * 1 copy * ₹16)', () => {
  const quote = calculatePrintQuote({
    selectedPages: 3,
    copies: 1,
    isColor: true,
    isDuplex: true
  });
  assert.strictEqual(quote.totalAmount, 32);
  assert.strictEqual(quote.sheetsPerCopy, 2);
  assert.strictEqual(quote.totalPhysicalSheets, 2);
  assert.strictEqual(quote.billingType, 'COLOR_DUPLEX');
});

runTest('Vector 7: 3 colour pages, 2 copies, duplex => ₹64 (ceil(3/2)=2 sheets * 2 copies * ₹16)', () => {
  const quote = calculatePrintQuote({
    selectedPages: 3,
    copies: 2,
    isColor: true,
    isDuplex: true
  });
  assert.strictEqual(quote.totalAmount, 64);
  assert.strictEqual(quote.sheetsPerCopy, 2);
  assert.strictEqual(quote.totalPhysicalSheets, 4);
  assert.strictEqual(quote.billingType, 'COLOR_DUPLEX');
});

runTest('Vector 8: 5 B&W pages, 3 copies, duplex => ₹27 (ceil(5/2)=3 sheets * 3 copies * ₹3)', () => {
  const quote = calculatePrintQuote({
    selectedPages: 5,
    copies: 3,
    isColor: false,
    isDuplex: true
  });
  assert.strictEqual(quote.totalAmount, 27);
  assert.strictEqual(quote.sheetsPerCopy, 3);
  assert.strictEqual(quote.totalPhysicalSheets, 9);
  assert.strictEqual(quote.billingType, 'BW_DUPLEX');
});

console.log('\n--- Suite 2: Custom Rates & Shopkeeper Overrides ---');

runTest('Custom rates applied correctly: B&W single ₹2.50, Duplex ₹4.00', () => {
  const customRates = {
    bwSingle: 2.5,
    bwDuplex: 4.0
  };
  const quoteSingle = calculatePrintQuote({
    selectedPages: 4,
    copies: 1,
    isColor: false,
    isDuplex: false,
    customRates
  });
  assert.strictEqual(quoteSingle.totalAmount, 10); // 4 * 1 * 2.5 = 10

  const quoteDuplex = calculatePrintQuote({
    selectedPages: 5,
    copies: 2,
    isColor: false,
    isDuplex: true,
    customRates
  });
  // ceil(5/2) = 3 sheets * 2 copies * 4.0 = 24
  assert.strictEqual(quoteDuplex.totalAmount, 24);
});

console.log('\n--- Suite 3: Tampering Protection & Quote Integrity Verification ---');

runTest('Quote integrity passes when untampered', () => {
  const genuineQuote = calculatePrintQuote({
    selectedPages: 7,
    copies: 2,
    isColor: true,
    isDuplex: true
  });
  // ceil(7/2)=4 * 2 * 16 = 128
  assert.strictEqual(genuineQuote.totalAmount, 128);

  const verification = verifyQuoteIntegrity(genuineQuote);
  assert.strictEqual(verification.isValid, true);
  assert.strictEqual(verification.expectedQuote.totalAmount, 128);
});

runTest('Quote integrity rejects when client fakes lower totalAmount', () => {
  const tamperedQuote = {
    selectedPages: 7,
    copies: 2,
    isColor: true,
    isDuplex: true,
    totalPhysicalSheets: 8,
    billingType: 'COLOR_DUPLEX',
    totalAmount: 10 // Attacker attempts to pay ₹10 instead of ₹128
  };

  const verification = verifyQuoteIntegrity(tamperedQuote);
  assert.strictEqual(verification.isValid, false);
  assert.strictEqual(verification.expectedQuote.totalAmount, 128);
});

runTest('Quote integrity rejects when client fakes billing type', () => {
  const tamperedQuote = {
    selectedPages: 7,
    copies: 2,
    isColor: true,
    isDuplex: true,
    totalPhysicalSheets: 8,
    billingType: 'BW_DUPLEX', // Attacker claims B&W rate for Color document
    totalAmount: 128
  };

  const verification = verifyQuoteIntegrity(tamperedQuote);
  assert.strictEqual(verification.isValid, false);
});

console.log('\n--- Suite 4: Boundary & Input Validation Protections ---');

runTest('Rejects 0 selected pages', () => {
  assert.throws(() => {
    calculatePrintQuote({ selectedPages: 0, copies: 1 });
  }, /Invalid selectedPages count/);
});

runTest('Rejects negative copies', () => {
  assert.throws(() => {
    calculatePrintQuote({ selectedPages: 5, copies: -1 });
  }, /Invalid copies count/);
});

runTest('Rejects non-numeric strings', () => {
  assert.throws(() => {
    calculatePrintQuote({ selectedPages: 'invalid', copies: 1 });
  }, /Invalid selectedPages count/);
});

runTest('Handles 1 page single duplex edge case ceil(1/2) = 1 sheet', () => {
  const quote = calculatePrintQuote({
    selectedPages: 1,
    copies: 1,
    isColor: false,
    isDuplex: true
  });
  assert.strictEqual(quote.sheetsPerCopy, 1);
  assert.strictEqual(quote.totalAmount, 3); // 1 sheet * 1 copy * ₹3
});

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
}
