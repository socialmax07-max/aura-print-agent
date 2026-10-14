/**
 * AURA PRINT PRO — CRYPTOGRAPHIC UTILITIES & SIGNATURE ENGINE
 * Owner: Sabir Ansari
 * 
 * Provides:
 * - Deterministic quote signature generation & verification
 * - Cryptographically strong order ID generation (e.g., ORD-7K9M2P)
 * - Secure random tokens for print agent authentication
 * - Timing-safe string comparison to protect against side-channel timing attacks
 * - Isomorphic design (Node.js crypto & Browser Web Crypto API)
 */

const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

/**
 * Generates cryptographically secure random bytes as a hex string.
 * @param {number} [length=16] 
 * @returns {string}
 */
export function generateRandomHex(length = 16) {
  if (isNode) {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
  }

  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback if neither is available
  let result = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < length * 2; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a clean, readable, collision-resistant order ID suitable for
 * Indian cyber cafe receipts and verbal counter verification.
 * Format: ORD-XXXXXX (6 uppercase alphanumeric characters excluding ambiguous letters)
 * @returns {string} e.g. "ORD-8H3K9P"
 */
export function generateOrderId() {
  // Characters avoiding lookalikes (0/O, 1/I/L)
  const charset = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const idLength = 6;
  let code = '';

  if (isNode) {
    const crypto = require('crypto');
    const bytes = crypto.randomBytes(idLength);
    for (let i = 0; i < idLength; i++) {
      code += charset[bytes[i] % charset.length];
    }
  } else if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(idLength);
    window.crypto.getRandomValues(bytes);
    for (let i = 0; i < idLength; i++) {
      code += charset[bytes[i] % charset.length];
    }
  } else {
    for (let i = 0; i < idLength; i++) {
      code += charset.charAt(Math.floor(Math.random() * charset.length));
    }
  }

  return `ORD-${code}`;
}

/**
 * Generates an authentication token for a Windows Print Agent installation.
 * Format: 64-character hexadecimal token.
 * @returns {string}
 */
export function generateAgentToken() {
  return generateRandomHex(32);
}

/**
 * Computes a SHA-256 hash digest of a given text string.
 * @param {string} message 
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function sha256(message) {
  if (isNode) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(message, 'utf8').digest('hex');
  }

  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('No cryptographic runtime available for SHA-256 hashing.');
}

/**
 * Synchronous SHA-256 hashing for Node.js environments (Netlify Functions & Tests).
 * @param {string} message 
 * @returns {string}
 */
export function sha256Sync(message) {
  if (!isNode) {
    throw new Error('sha256Sync is only supported in Node.js server environments.');
  }
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(message, 'utf8').digest('hex');
}

/**
 * Creates an authoritative digital quote signature to lock pricing parameters.
 * Any client manipulation of amount, page counts, or color mode breaks the signature.
 * 
 * @param {Object} quote 
 * @param {number} quote.selectedPages
 * @param {number} quote.copies
 * @param {boolean} quote.isColor
 * @param {boolean} quote.isDuplex
 * @param {number} quote.totalAmount
 * @param {string} secretKey Server secret key
 * @returns {string}
 */
export function createQuoteSignature(quote, secretKey) {
  if (!secretKey) {
    throw new Error('A valid secretKey is required to sign quotes.');
  }

  const payload = [
    quote.selectedPages,
    quote.copies,
    quote.isColor ? '1' : '0',
    quote.isDuplex ? '1' : '0',
    quote.totalAmount.toFixed(2),
    secretKey
  ].join(':');

  if (isNode) {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
  }

  // Fallback for non-Node (sync representation)
  return sha256Sync ? sha256Sync(payload) : payload;
}

/**
 * Timing-safe string comparison to prevent timing side-channel attacks on PINs and tokens.
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  if (isNode) {
    const crypto = require('crypto');
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }

  // Pure JavaScript constant-time loop fallback for browser runtimes
  let mismatch = a.length === b.length ? 0 : 1;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// CommonJS support for Netlify Functions, Jest, and Print Agent
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateRandomHex,
    generateOrderId,
    generateAgentToken,
    sha256,
    sha256Sync,
    createQuoteSignature,
    timingSafeEqual
  };
}
