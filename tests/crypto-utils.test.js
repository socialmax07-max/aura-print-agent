/**
 * AURA PRINT PRO — AUTOMATED CRYPTO UTILS TEST SUITE
 * File: tests/crypto-utils.test.js
 * Test Runner: Node.js Native Test Runner (node:test)
 * Owner: Sabir Ansari
 * 
 * Verifies:
 * - Order ID formatting, entropy & collision resistance
 * - Agent secret token length and 256-bit randomness
 * - Constant-time equality comparison (timingSafeEqual)
 * - HMAC-SHA256 quote checksum signing & tamper detection
 * - Salted PIN hashing and verification
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateOrderId,
  generateAgentToken,
  timingSafeEqual,
  generateQuoteChecksum,
  verifyQuoteChecksum,
  hashPin,
  verifyPin
} = require('../src/shared/crypto-utils.js');

test('Cryptographic Utilities & Integrity Suite', async (t) => {

  await t.test('1. Order ID Format and Syntax', () => {
    const orderId = generateOrderId();

    assert.strictEqual(typeof orderId, 'string', 'Order ID must be a string');
    assert.ok(orderId.startsWith('ORD-'), 'Order ID must begin with "ORD-" prefix');
    assert.match(
      orderId,
      /^ORD-[A-HJ-NP-Z2-9]{6}$/,
      'Order ID must be exactly "ORD-" followed by 6 alphanumeric non-confusing characters'
    );
  });

  await t.test('2. Order ID Uniqueness & Collision Resistance (10,000 samples)', () => {
    const sampleSize = 10000;
    const generatedIds = new Set();

    for (let i = 0; i < sampleSize; i++) {
      const id = generateOrderId();
      assert.strictEqual(
        generatedIds.has(id),
        false,
        `Duplicate Order ID detected at sample ${i}: ${id}`
      );
      generatedIds.add(id);
    }

    assert.strictEqual(generatedIds.size, sampleSize);
  });

  await t.test('3. Windows Agent Token Generation Entropy', () => {
    const token1 = generateAgentToken();
    const token2 = generateAgentToken();

    assert.strictEqual(typeof token1, 'string');
    assert.strictEqual(token1.length, 64, 'Token must be a 64-character hex string (256 bits)');
    assert.match(token1, /^[0-9a-f]{64}$/, 'Token must contain only lowercase hexadecimal characters');
    assert.notStrictEqual(token1, token2, 'Consecutively generated tokens must be distinct');
  });

  await t.test('4. Constant-Time String Equality (timingSafeEqual)', () => {
    // Exact matches
    assert.strictEqual(timingSafeEqual('sabir123', 'sabir123'), true);
    assert.strictEqual(timingSafeEqual('ORD-9H4K2M', 'ORD-9H4K2M'), true);
    assert.strictEqual(timingSafeEqual('', ''), true);

    // Mismatched contents (same length)
    assert.strictEqual(timingSafeEqual('sabir123', 'sabir124'), false);
    assert.strictEqual(timingSafeEqual('aaaa', 'bbbb'), false);

    // Mismatched lengths
    assert.strictEqual(timingSafeEqual('short', 'longer_string'), false);
    assert.strictEqual(timingSafeEqual('token_a', 'token_a_extra'), false);

    // Null and undefined safety
    assert.strictEqual(timingSafeEqual(null, 'test'), false);
    assert.strictEqual(timingSafeEqual('test', undefined), false);
    assert.strictEqual(timingSafeEqual(null, null), false);
    assert.strictEqual(timingSafeEqual(1234, 1234), false); // Non-strings must return false
  });

  await t.test('5. Quote Checksum Generation & Determinism', () => {
    const quote = {
      orderId: 'ORD-9H4K2M',
      shopId: 'bagaha-cyber-hub',
      totalAmount: 18.0,
      totalPhysicalSheets: 6,
      selectedPages: 11,
      isColor: false,
      isDuplex: true
    };

    const secretKey = 'shop_secret_checksum_key_2026';

    const checksum1 = generateQuoteChecksum(quote, secretKey);
    const checksum2 = generateQuoteChecksum(quote, secretKey);

    assert.strictEqual(typeof checksum1, 'string');
    assert.strictEqual(checksum1.length, 64, 'Checksum must be a 64-character SHA-256 / HMAC-SHA256 hex string');
    assert.strictEqual(checksum1, checksum2, 'Identical quote payloads must produce identical checksums');
  });

  await t.test('6. Quote Checksum Verification & Tamper Detection', () => {
    const quote = {
      orderId: 'ORD-9H4K2M',
      shopId: 'bagaha-cyber-hub',
      totalAmount: 18.0,
      totalPhysicalSheets: 6,
      selectedPages: 11,
      isColor: false,
      isDuplex: true
    };

    const secretKey = 'shop_secret_checksum_key_2026';
    const validChecksum = generateQuoteChecksum(quote, secretKey);

    // Positive verification
    const isValid = verifyQuoteChecksum(quote, validChecksum, secretKey);
    assert.strictEqual(isValid, true, 'Original unmodified quote must verify successfully');

    // Tampering 1: Customer tampers totalAmount (e.g. ₹18 -> ₹2)
    const tamperedAmountQuote = { ...quote, totalAmount: 2.0 };
    assert.strictEqual(
      verifyQuoteChecksum(tamperedAmountQuote, validChecksum, secretKey),
      false,
      'Tampered amount must fail checksum verification'
    );

    // Tampering 2: Changing duplex flag
    const tamperedDuplexQuote = { ...quote, isDuplex: false };
    assert.strictEqual(
      verifyQuoteChecksum(tamperedDuplexQuote, validChecksum, secretKey),
      false,
      'Tampered duplex setting must fail checksum verification'
    );

    // Tampering 3: Changing target shop
    const tamperedShopQuote = { ...quote, shopId: 'different-shop' };
    assert.strictEqual(
      verifyQuoteChecksum(tamperedShopQuote, validChecksum, secretKey),
      false,
      'Tampered shopId must fail checksum verification'
    );

    // Wrong secret key verification
    assert.strictEqual(
      verifyQuoteChecksum(quote, validChecksum, 'different_secret_key'),
      false,
      'Verification with incorrect secret key must fail'
    );
  });

  await t.test('7. Operator Cash PIN Hashing & Verification', () => {
    const rawPin = '7890';
    const { hash, salt } = hashPin(rawPin);

    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(typeof salt, 'string');
    assert.strictEqual(hash.length, 64, 'Hash must be 64-char hex SHA-256 string');
    assert.ok(salt.length >= 16, 'Salt must be at least 16 hex chars');

    // Positive verification
    const match = verifyPin(rawPin, hash, salt);
    assert.strictEqual(match, true, 'Correct PIN must verify against stored hash and salt');

    // Negative verification with incorrect PIN
    const wrongMatch = verifyPin('1234', hash, salt);
    assert.strictEqual(wrongMatch, false, 'Incorrect PIN must fail verification');

    // Negative verification with empty/invalid inputs
    assert.strictEqual(verifyPin('', hash, salt), false);
    assert.strictEqual(verifyPin(null, hash, salt), false);
  });

});
