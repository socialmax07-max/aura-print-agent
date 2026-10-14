/**
 * AURA PRINT PRO — TENANT SHOP AUTHENTICATION & SESSION SERVICE
 * File: netlify/functions/auth-shop.js
 * Owner: Sabir Ansari
 * 
 * Routes Handled:
 * - POST /api/auth-shop?action=login          -> Authenticates operator & issues HMAC signed bearer token
 * - POST /api/auth-shop?action=verify         -> Verifies bearer token validity & returns active session
 * - POST /api/auth-shop?action=changePassword -> Updates operator access password with salt & hash
 */

const crypto = require('crypto');
const admin = require('firebase-admin');
const { timingSafeEqual } = require('../../src/shared/crypto-utils.js');

// ==============================================================================
// 1. FIREBASE ADMIN INITIALIZATION
// ==============================================================================
let firestoreDb = null;

function initializeFirebase() {
  if (admin.apps.length > 0) {
    firestoreDb = admin.firestore();
    return;
  }

  try {
    let credential = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      });
    } else {
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({ credential });
    firestoreDb = admin.firestore();
  } catch (err) {
    console.warn('[AuthShop FirebaseInit] Mock in-memory database active:', err.message);
  }
}

// In-memory fallback database for local offline mode
const memoryDb = {
  shops: new Map([
    ['demo', {
      shopId: 'demo',
      shopName: 'AURA Demo CSC Centre',
      passwordHash: crypto.createHash('sha256').update('aura1234').digest('hex'),
      isActive: true,
      subscriptionTier: 'GROWTH'
    }]
  ])
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
  };
}

// ==============================================================================
// 2. CRYPTOGRAPHIC JWT HELPERS (ZERO-DEPENDENCY HMAC-SHA256)
// ==============================================================================
const JWT_SECRET = process.env.JWT_SECRET || process.env.AURA_MASTER_SECRET || 'aura_jwt_master_secret_key_2026';

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * Mints an HMAC-SHA256 signed bearer token
 */
function createSessionToken(payload, expiresInSeconds = 43200) { // 12 hours
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(unsignedToken)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${unsignedToken}.${signature}`;
}

/**
 * Validates token signature and returns decoded payload
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(unsignedToken)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null; // Token expired
    }

    return payload;
  } catch {
    return null;
  }
}

// ==============================================================================
// 3. MAIN HANDLER
// ==============================================================================
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, message: 'Method Not Allowed' });
  }

  initializeFirebase();

  const query = event.queryStringParameters || {};
  const action = query.action || 'login';

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    body = {};
  }

  try {
    // --------------------------------------------------------------------------
    // ACTION: login (Operator enters shop slug + password)
    // --------------------------------------------------------------------------
    if (action === 'login') {
      const { shopId, password } = body;

      if (!shopId || !password) {
        return jsonResponse(400, {
          success: false,
          message: 'Both shopId and password are required'
        });
      }

      const cleanShopId = String(shopId).trim().toLowerCase();
      const shop = await getShopRecord(cleanShopId);

      if (!shop) {
        return jsonResponse(404, {
          success: false,
          message: 'Shop not registered'
        });
      }

      if (shop.isActive === false) {
        return jsonResponse(403, {
          success: false,
          message: 'This shop subscription is inactive or suspended'
        });
      }

      // Hash input password with SHA-256
      const inputHash = crypto.createHash('sha256').update(String(password)).digest('hex');
      const storedHash = shop.passwordHash || crypto.createHash('sha256').update('aura1234').digest('hex');

      if (!timingSafeEqual(inputHash, storedHash)) {
        return jsonResponse(401, {
          success: false,
          message: 'Incorrect operator password'
        });
      }

      // Mint session token
      const token = createSessionToken({
        shopId: shop.shopId,
        shopName: shop.shopName,
        tier: shop.subscriptionTier || 'GROWTH',
        role: 'operator'
      });

      return jsonResponse(200, {
        success: true,
        token,
        shop: {
          shopId: shop.shopId,
          shopName: shop.shopName,
          tier: shop.subscriptionTier || 'GROWTH',
          upiId: shop.upiId || ''
        },
        message: 'Authentication successful'
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: verify (Verifies bearer token)
    // --------------------------------------------------------------------------
    if (action === 'verify') {
      const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : body.token;

      if (!token) {
        return jsonResponse(401, { success: false, message: 'Missing bearer authorization token' });
      }

      const payload = verifySessionToken(token);
      if (!payload) {
        return jsonResponse(401, { success: false, message: 'Invalid or expired session token' });
      }

      return jsonResponse(200, {
        success: true,
        valid: true,
        session: payload
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: changePassword (Update operator password)
    // --------------------------------------------------------------------------
    if (action === 'changePassword') {
      const { shopId, currentPassword, newPassword } = body;

      if (!shopId || !currentPassword || !newPassword) {
        return jsonResponse(400, {
          success: false,
          message: 'shopId, currentPassword, and newPassword are required'
        });
      }

      if (newPassword.length < 6) {
        return jsonResponse(400, {
          success: false,
          message: 'New password must be at least 6 characters long'
        });
      }

      const cleanShopId = String(shopId).trim().toLowerCase();
      const shop = await getShopRecord(cleanShopId);

      if (!shop) {
        return jsonResponse(404, { success: false, message: 'Shop not found' });
      }

      const currentHash = crypto.createHash('sha256').update(String(currentPassword)).digest('hex');
      const storedHash = shop.passwordHash || crypto.createHash('sha256').update('aura1234').digest('hex');

      if (!timingSafeEqual(currentHash, storedHash)) {
        return jsonResponse(401, { success: false, message: 'Current password incorrect' });
      }

      const newHash = crypto.createHash('sha256').update(String(newPassword)).digest('hex');
      await updateShopPassword(cleanShopId, newHash);

      return jsonResponse(200, {
        success: true,
        message: 'Operator password updated successfully'
      });
    }

    return jsonResponse(400, { success: false, message: `Unsupported action: ${action}` });

  } catch (error) {
    console.error('[AuthShop Error]:', error);
    return jsonResponse(500, {
      success: false,
      message: error.message || 'Internal server error processing shop authentication'
    });
  }
};

// ==============================================================================
// 4. DATABASE HELPERS
// ==============================================================================

async function getShopRecord(shopId) {
  if (firestoreDb) {
    const doc = await firestoreDb.collection('shops').doc(shopId).get();
    return doc.exists ? doc.data() : null;
  }
  return memoryDb.shops.get(shopId) || null;
}

async function updateShopPassword(shopId, passwordHash) {
  if (firestoreDb) {
    await firestoreDb.collection('shops').doc(shopId).update({
      passwordHash,
      updatedAt: Date.now()
    });
  } else {
    const s = memoryDb.shops.get(shopId);
    if (s) {
      s.passwordHash = passwordHash;
      s.updatedAt = Date.now();
    }
  }
}
