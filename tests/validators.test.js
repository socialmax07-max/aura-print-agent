/**
 * AURA PRINT PRO — VALIDATORS AUTOMATED TEST SUITE
 * Owner: Sabir Ansari
 * 
 * Verifies:
 * 1. File size limits (0 bytes, <= 100 MB, > 100 MB)
 * 2. Allowed file types and extensions (.pdf, .jpg, .jpeg, .png)
 * 3. Document page range parsing and boundary enforcement
 * 4. NPCI UPI Virtual Payment Address (VPA) syntax
 * 5. Multi-tenant shop slug validation
 * 6. Operator cash PIN format verification
 */

const assert = require('assert');
const {
  MAX_FILE_SIZE_BYTES,
  validateUploadFile,
  parseAndValidatePageRange,
  isValidUpiId,
  isValidShopId,
  isValidCashPin
} = require('../src/shared/validators.js');

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
console.log('     AURA PRINT PRO - VALIDATORS TEST SUITE         ');
console.log('====================================================\n');

console.log('--- Suite 1: File Upload & Extension Validation ---');

runTest('Accepts valid PDF document within 100 MB limit', () => {
  const file = {
    name: 'aadhaar_card.pdf',
    size: 5 * 1024 * 1024, // 5 MB
    type: 'application/pdf'
  };
  const res = validateUploadFile(file);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.error, undefined);
});

runTest('Accepts valid JPG image', () => {
  const file = {
    name: 'passport_photo.jpg',
    size: 2 * 1024 * 1024,
    type: 'image/jpeg'
  };
  const res = validateUploadFile(file);
  assert.strictEqual(res.isValid, true);
});

runTest('Accepts valid PNG document', () => {
  const file = {
    name: 'pan_card_scan.png',
    size: 1.5 * 1024 * 1024,
    type: 'image/png'
  };
  const res = validateUploadFile(file);
  assert.strictEqual(res.isValid, true);
});

runTest('Rejects file exceeding 100 MB limit', () => {
  const file = {
    name: 'huge_book.pdf',
    size: MAX_FILE_SIZE_BYTES + 1024, // 100 MB + 1 KB
    type: 'application/pdf'
  };
  const res = validateUploadFile(file);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error, /exceeds maximum allowed limit of 100 MB/);
});

runTest('Rejects 0-byte corrupt or empty file', () => {
  const file = {
    name: 'empty.pdf',
    size: 0,
    type: 'application/pdf'
  };
  const res = validateUploadFile(file);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error, /empty or corrupted/);
});

runTest('Rejects disallowed executable and archive extensions', () => {
  const disallowed = ['script.exe', 'archive.zip', 'document.docx', 'malware.sh'];
  disallowed.forEach(fileName => {
    const res = validateUploadFile({ name: fileName, size: 5000 });
    assert.strictEqual(res.isValid, false, `Failed to reject ${fileName}`);
    assert.match(res.error, /Unsupported file format/);
  });
});

runTest('Rejects null or invalid file object', () => {
  const res = validateUploadFile(null);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error, /No file provided/);
});

console.log('\n--- Suite 2: Document Page Range Parsing & Bounds ---');

runTest('Empty string or "all" selects all pages (e.g. 5 total pages)', () => {
  const resEmpty = parseAndValidatePageRange('', 5);
  assert.strictEqual(resEmpty.isValid, true);
  assert.deepStrictEqual(resEmpty.pages, [1, 2, 3, 4, 5]);

  const resAll = parseAndValidatePageRange('all', 3);
  assert.strictEqual(resAll.isValid, true);
  assert.deepStrictEqual(resAll.pages, [1, 2, 3]);
});

runTest('Parses valid discrete pages "1, 3, 5" in a 10-page document', () => {
  const res = parseAndValidatePageRange('1, 3, 5', 10);
  assert.strictEqual(res.isValid, true);
  assert.deepStrictEqual(res.pages, [1, 3, 5]);
});

runTest('Parses complex ranges with overlapping and mixed spacing "1-3, 5, 2-4"', () => {
  const res = parseAndValidatePageRange('1-3, 5, 2-4', 10);
  assert.strictEqual(res.isValid, true);
  // Deduplicated and strictly sorted: 1, 2, 3, 4, 5
  assert.deepStrictEqual(res.pages, [1, 2, 3, 4, 5]);
});

runTest('Rejects inverted range where start > end (e.g., "5-2")', () => {
  const res = parseAndValidatePageRange('5-2', 10);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error, /cannot be greater than end page/);
});

runTest('Rejects page numbers exceeding document total pages', () => {
  const res = parseAndValidatePageRange('1-3, 15', 10); // Document only has 10 pages
  assert.strictEqual(res.isValid, false);
  assert.match(res.error, /exceeds total document pages/);
});

runTest('Rejects page 0 and negative pages', () => {
  const resZero = parseAndValidatePageRange('0-3', 10);
  assert.strictEqual(resZero.isValid, false);
  assert.match(resZero.error, /must start at 1/);
});

runTest('Rejects invalid non-range characters (letters, punctuation)', () => {
  const res = parseAndValidatePageRange('1-3; 5 & 7', 10);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error, /Invalid characters in page range/);
});

runTest('Rejects zero total pages document', () => {
  const res = parseAndValidatePageRange('1-2', 0);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error, /must be greater than 0/);
});

console.log('\n--- Suite 3: NPCI UPI Virtual Payment Address (VPA) Syntax ---');

runTest('Validates standard NPCI UPI IDs', () => {
  const validVpas = [
    'sabirprint@okaxis',
    'csc.kendra@sbi',
    'cybercafe-77@paytm',
    'shop_name@icici',
    '9876543210@ybl'
  ];
  validVpas.forEach(vpa => {
    assert.strictEqual(isValidUpiId(vpa), true, `Failed on valid VPA: ${vpa}`);
  });
});

runTest('Rejects malformed UPI IDs', () => {
  const invalidVpas = [
    'notaupi',
    '@bank',
    'user@',
    'user@@bank',
    'user name@bank',
    'user@bank@extra',
    '',
    null,
    undefined
  ];
  invalidVpas.forEach(vpa => {
    assert.strictEqual(isValidUpiId(vpa), false, `Should reject invalid VPA: ${vpa}`);
  });
});

console.log('\n--- Suite 4: Multi-Tenant Shop ID & PIN Format ---');

runTest('Validates clean shop slugs (alphanumeric, lowercase, hyphen, 3-32 chars)', () => {
  assert.strictEqual(isValidShopId('delhi-cyber-hub'), true);
  assert.strictEqual(isValidShopId('csc-kendra-99'), true);
  assert.strictEqual(isValidShopId('shop123'), true);

  // Invalid slugs
  assert.strictEqual(isValidShopId('ab'), false); // Too short
  assert.strictEqual(isValidShopId('Delhi_Hub'), false); // Uppercase & underscore
  assert.strictEqual(isValidShopId('shop with spaces'), false);
  assert.strictEqual(isValidShopId('shop!@#'), false);
});

runTest('Validates 4 to 6-digit operator cash PINs', () => {
  assert.strictEqual(isValidCashPin('1234'), true);
  assert.strictEqual(isValidCashPin('998877'), true);
  assert.strictEqual(isValidCashPin('0000'), true);

  // Invalid PINs
  assert.strictEqual(isValidCashPin('123'), false); // Too short
  assert.strictEqual(isValidCashPin('1234567'), false); // Too long
  assert.strictEqual(isValidCashPin('abcd'), false); // Non-digit
  assert.strictEqual(isValidCashPin(''), false);
  assert.strictEqual(isValidCashPin(null), false);
});

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
}
