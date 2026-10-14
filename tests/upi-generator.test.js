/**
 * AURA PRINT PRO — AUTOMATED UPI GENERATOR TEST SUITE
 * File: tests/upi-generator.test.js
 * Test Runner: Node.js Native Test Runner (node:test)
 * Owner: Sabir Ansari
 * 
 * Verifies:
 * - NPCI standard URI schema ('upi://pay')
 * - Query parameter compliance ('pa', 'pn', 'am', 'cu', 'tn', 'tr')
 * - Safe numeric rounding to 2-decimal places
 * - Proper URL encoding for notes with Indian characters & punctuation
 * - Zero and negative value guard rails
 * - Invalid VPA input rejections
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateUpiLink,
  generateUpiQrPayload,
  parseUpiUri
} = require('../src/shared/upi-generator.js');

test('NPCI UPI Deep-Link Generator', async (t) => {

  await t.test('1. Standard Compliant UPI Deep-Link Generation', () => {
    const payload = {
      upiId: 'sabirprint@okaxis',
      payeeName: 'Ansari Xerox Point',
      amount: 15.5,
      orderId: 'ORD-9H4K2M',
      transactionNote: 'Print Job ORD-9H4K2M'
    };

    const link = generateUpiLink(payload);

    // Schema validation
    assert.ok(link.startsWith('upi://pay?'), 'URI must begin with "upi://pay?"');

    // Parse query params from the custom URI
    const queryStr = link.replace('upi://pay?', '');
    const params = new URLSearchParams(queryStr);

    assert.strictEqual(params.get('pa'), 'sabirprint@okaxis', 'Param "pa" must match UPI VPA');
    assert.strictEqual(params.get('pn'), 'Ansari Xerox Point', 'Param "pn" must contain payee display name');
    assert.strictEqual(params.get('am'), '15.50', 'Param "am" must be formatted to exactly 2 decimal places');
    assert.strictEqual(params.get('cu'), 'INR', 'Param "cu" must strictly be "INR"');
    assert.strictEqual(params.get('tr'), 'ORD-9H4K2M', 'Param "tr" must carry the unique Order ID');
    assert.strictEqual(params.get('tn'), 'Print Job ORD-9H4K2M', 'Param "tn" must carry transaction note');
  });

  await t.test('2. Two-Decimal Precision Formatting on Whole and Fraction Amounts', () => {
    const testCases = [
      { input: 2, expected: '2.00' },
      { input: 10, expected: '10.00' },
      { input: 16.5, expected: '16.50' },
      { input: 24.75, expected: '24.75' },
      { input: 49.999, expected: '50.00' },
      { input: 0.5, expected: '0.50' }
    ];

    testCases.forEach(({ input, expected }) => {
      const link = generateUpiLink({
        upiId: 'test@upi',
        payeeName: 'Shop',
        amount: input,
        orderId: 'ORD-101'
      });
      const params = new URLSearchParams(link.replace('upi://pay?', ''));
      assert.strictEqual(params.get('am'), expected, `Amount ${input} must format as ${expected}`);
    });
  });

  await t.test('3. URL Encoding of Special Characters & Spaces', () => {
    const link = generateUpiLink({
      upiId: 'counter@icici',
      payeeName: 'AURA & Bros (Bagaha)',
      amount: 30.00,
      orderId: 'ORD-SPEC-1',
      transactionNote: 'Print: A4 / Duplex & Photo'
    });

    // In raw URI string, special chars must be properly encoded or valid for URLSearchParams
    const queryStr = link.replace('upi://pay?', '');
    const params = new URLSearchParams(queryStr);

    assert.strictEqual(params.get('pn'), 'AURA & Bros (Bagaha)', 'Ampersand and parentheses in payee name must decode correctly');
    assert.strictEqual(params.get('tn'), 'Print: A4 / Duplex & Photo', 'Colons, slashes, and ampersands in note must decode correctly');
  });

  await t.test('4. URL Encoding with Indic / Hindi Characters in Transaction Notes', () => {
    const link = generateUpiLink({
      upiId: 'sabir@ybl',
      payeeName: 'साकिब प्रिंट सेंटर',
      amount: 45.00,
      orderId: 'ORD-HINDI-1',
      transactionNote: 'प्रिंट ऑर्डर ORD-HINDI-1'
    });

    const queryStr = link.replace('upi://pay?', '');
    const params = new URLSearchParams(queryStr);

    assert.strictEqual(params.get('pn'), 'साकिब प्रिंट सेंटर', 'Devanagari payee name must decode preserved');
    assert.strictEqual(params.get('tn'), 'प्रिंट ऑर्डर ORD-HINDI-1', 'Devanagari transaction note must decode preserved');
  });

  await t.test('5. Rejection of Zero, Negative, or NaN Amounts', () => {
    const invalidAmounts = [0, -5, -0.01, NaN, null, undefined, 'abc'];

    invalidAmounts.forEach(amt => {
      assert.throws(
        () => {
          generateUpiLink({
            upiId: 'shop@upi',
            payeeName: 'Shop',
            amount: amt,
            orderId: 'ORD-ERR'
          });
        },
        /Invalid amount/i,
        `Amount ${amt} must throw an invalid amount error`
      );
    });
  });

  await t.test('6. Rejection of Invalid VPA / UPI ID Syntax', () => {
    const invalidVpas = [
      '',
      'invalid-no-at-sign',
      '@bank',
      'shop@',
      'user name@bank',
      'shop@@axis',
      null,
      undefined
    ];

    invalidVpas.forEach(vpa => {
      assert.throws(
        () => {
          generateUpiLink({
            upiId: vpa,
            payeeName: 'Shop',
            amount: 10,
            orderId: 'ORD-ERR-VPA'
          });
        },
        /Invalid UPI ID/i,
        `VPA "${vpa}" must throw an invalid UPI ID error`
      );
    });
  });

  await t.test('7. Default Note Fallback When Transaction Note is Omitted', () => {
    const link = generateUpiLink({
      upiId: 'shop@oksbi',
      payeeName: 'CSC Center',
      amount: 5,
      orderId: 'ORD-DEFAULT-NOTE'
    });

    const queryStr = link.replace('upi://pay?', '');
    const params = new URLSearchParams(queryStr);

    assert.ok(params.has('tn'), 'Transaction note param "tn" must always be populated');
    assert.ok(
      params.get('tn').includes('ORD-DEFAULT-NOTE'),
      'Default transaction note should mention the Order ID'
    );
  });

  await t.test('8. URI Parser (`parseUpiUri`) Utility Verification', () => {
    const rawUri = 'upi://pay?pa=testvpa%40okhdfcbank&pn=Demo+Store&am=12.00&cu=INR&tn=Doc+Print&tr=ORD-XYZ987';
    const parsed = parseUpiUri(rawUri);

    assert.strictEqual(parsed.upiId, 'testvpa@okhdfcbank');
    assert.strictEqual(parsed.payeeName, 'Demo Store');
    assert.strictEqual(parsed.amount, 12.00);
    assert.strictEqual(parsed.currency, 'INR');
    assert.strictEqual(parsed.transactionNote, 'Doc Print');
    assert.strictEqual(parsed.orderId, 'ORD-XYZ987');
  });

  await t.test('9. UPI QR Payload Generator (`generateUpiQrPayload`)', () => {
    const qrPayload = generateUpiQrPayload({
      upiId: 'sabir@paytm',
      payeeName: 'Aura Print Hub',
      amount: 8.0,
      orderId: 'ORD-QR-TEST'
    });

    assert.strictEqual(typeof qrPayload, 'string');
    assert.ok(qrPayload.startsWith('upi://pay?'));
    assert.ok(qrPayload.includes('am=8.00'));
  });

});
