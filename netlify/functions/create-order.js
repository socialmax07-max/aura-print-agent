/**
 * AURA PRINT PRO — MASTER SERVERLESS API ROUTER
 * File: netlify/functions/create-order.js
 * Owner: Sabir Ansari
 * 
 * Endpoints Handled:
 * - Customer Kiosk: Order creation with multipart upload, quote verification, order status checks
 * - Passport Studio: Print-ready passport grid PDF job submissions
 * - Operator Dashboard: Order sync, UPI verify, Cash PIN verify, manual print trigger, rates & PIN update
 * - Super Admin Cockpit: Master key auth, platform KPIs, shop provisioning, tier quotas, token reset
 */

const Busboy = require('busboy');
const crypto = require('crypto');
const admin = require('firebase-admin');

// Shared business logic imports
const { ORDER_STATES, isValidTransition } = require('../../src/shared/order-states.js');
const { calculatePrintQuote } = require('../../src/shared/pricing-engine.js');
const { generateOrderId, generateAgentToken, timingSafeEqual } = require('../../src/shared/crypto-utils.js');
const { isValidShopId, isValidUpiId, isValidCashPin, MAX_FILE_SIZE_BYTES } = require('../../src/shared/validators.js');
const { SUBSCRIPTION_TIERS, DEFAULT_RATES } = require('../../src/shared/constants.js');

// ==============================================================================
// 1. FIREBASE ADMIN SDK INITIALIZATION
// ==============================================================================
let firestoreDb = null;
let storageBucket = null;

function initializeFirebase() {
  if (admin.apps.length > 0) {
    firestoreDb = admin.firestore();
    storageBucket = admin.storage().bucket();
    return;
  }

  try {
    let credential = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const saJson = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(saJson);
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      });
    } else {
      // In local dev without full credentials, use applicationDefault
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
      credential,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
    });

    firestoreDb = admin.firestore();
    storageBucket = admin.storage().bucket();
  } catch (err) {
    console.warn('[FirebaseInit] Warning: Firebase Admin initialized in mock/fallback mode:', err.message);
  }
}

// ==============================================================================
// 2. CORS & HTTP RESPONSE HELPERS
// ==============================================================================
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-master-key',
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

// In-memory fallback cache for development/demo mode when Firebase is not connected
const memoryDb = {
  shops: new Map([
    ['demo', {
      shopId: 'demo',
      shopName: 'AURA Demo CSC Centre',
      ownerPhone: '9876543210',
      city: 'Bagaha, Bihar',
      upiId: 'sabirprint@okaxis',
      subscriptionTier: 'GROWTH',
      dailyOrderCap: 150,
      isActive: true,
      agentToken: 'demo_agent_secret_token_1234567890abcdef',
      cashPinHash: crypto.createHash('sha256').update('1234').digest('hex'), // Default PIN: 1234
      rates: { ...DEFAULT_RATES }
    }]
  ]),
  orders: new Map()
};

// ==============================================================================
// 3. MULTIPART FORM-DATA PARSER (BUSBOY)
// ==============================================================================
function parseMultipartForm(event) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let fileData = null;

    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return reject(new Error('Invalid Content-Type header. Expected multipart/form-data.'));
    }

    const busboy = Busboy({
      headers: { 'content-type': contentType },
      limits: { fileSize: MAX_FILE_SIZE_BYTES }
    });

    busboy.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    busboy.on('file', (fieldname, fileStream, fileMeta) => {
      const { filename, mimeType } = fileMeta;
      const chunks = [];
      let totalBytes = 0;

      fileStream.on('data', (chunk) => {
        chunks.push(chunk);
        totalBytes += chunk.length;
      });

      fileStream.on('end', () => {
        fileData = {
          fieldname,
          filename,
          mimeType,
          size: totalBytes,
          buffer: Buffer.concat(chunks)
        };
      });
    });

    busboy.on('finish', () => {
      resolve({ fields, file: fileData });
    });

    busboy.on('error', (err) => {
      reject(err);
    });

    // Write incoming body to busboy stream
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'utf8');

    busboy.write(bodyBuffer);
    busboy.end();
  });
}

// ==============================================================================
// 4. MAIN ROUTER HANDLER
// ==============================================================================
exports.handler = async (event, context) => {
  // Handle HTTP OPTIONS Pre-flight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  initializeFirebase();

  const query = event.queryStringParameters || {};
  const action = query.action;
  const method = event.httpMethod;

  try {
    // --------------------------------------------------------------------------
    // ACTION: getShop (Public: Kiosk & Operator)
    // --------------------------------------------------------------------------
    if (method === 'GET' && action === 'getShop') {
      const shopId = (query.shopId || 'demo').trim().toLowerCase();
      const shop = await getShopRecord(shopId);
      if (!shop) {
        return jsonResponse(404, { success: false, message: 'Shop not found' });
      }

      // Sanitize sensitive secrets before returning to public client
      const safeShop = {
        shopId: shop.shopId,
        shopName: shop.shopName,
        upiId: shop.upiId,
        city: shop.city,
        subscriptionTier: shop.subscriptionTier,
        isActive: shop.isActive,
        rates: shop.rates || DEFAULT_RATES
      };

      return jsonResponse(200, { success: true, shop: safeShop });
    }

    // --------------------------------------------------------------------------
    // ACTION: status (Public: Kiosk Polling)
    // --------------------------------------------------------------------------
    if (method === 'GET' && action === 'status') {
      const { shopId, orderId } = query;
      if (!shopId || !orderId) {
        return jsonResponse(400, { success: false, message: 'shopId and orderId are required' });
      }

      const order = await getOrderRecord(shopId, orderId);
      if (!order) {
        return jsonResponse(404, { success: false, message: 'Order not found' });
      }

      return jsonResponse(200, {
        success: true,
        order: {
          orderId: order.orderId,
          status: order.status,
          updatedAt: order.updatedAt
        }
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: operatorSync (Operator Dashboard Polling)
    // --------------------------------------------------------------------------
    if (method === 'GET' && action === 'operatorSync') {
      const shopId = (query.shopId || 'demo').trim().toLowerCase();
      const syncData = await getOperatorSyncData(shopId);
      return jsonResponse(200, { success: true, ...syncData });
    }

    // --------------------------------------------------------------------------
    // ACTION: getOrderHistory (Operator Register)
    // --------------------------------------------------------------------------
    if (method === 'GET' && action === 'getOrderHistory') {
      const shopId = (query.shopId || 'demo').trim().toLowerCase();
      const orders = await getShopOrderHistory(shopId);
      return jsonResponse(200, { success: true, orders });
    }

    // --------------------------------------------------------------------------
    // ACTION: confirmCash (Operator PIN Verification)
    // --------------------------------------------------------------------------
    if (method === 'POST' && action === 'confirmCash') {
      const body = JSON.parse(event.body || '{}');
      const { shopId, orderId, operatorPin } = body;

      if (!shopId || !orderId || !operatorPin) {
        return jsonResponse(400, { success: false, message: 'Missing shopId, orderId, or PIN' });
      }

      const shop = await getShopRecord(shopId);
      if (!shop) return jsonResponse(404, { success: false, message: 'Shop not found' });

      // Verify Operator PIN against stored hash
      const inputHash = crypto.createHash('sha256').update(String(operatorPin)).digest('hex');
      const storedHash = shop.cashPinHash || crypto.createHash('sha256').update('1234').digest('hex');

      if (!timingSafeEqual(inputHash, storedHash)) {
        return jsonResponse(401, { success: false, message: 'Incorrect Cash Security PIN' });
      }

      // Transition order status
      const updatedOrder = await updateOrderStatus(shopId, orderId, ORDER_STATES.CASH_CONFIRMED, {
        cashConfirmedAt: Date.now()
      });

      // Automatically queue for print
      await updateOrderStatus(shopId, orderId, ORDER_STATES.PRINT_QUEUED);

      return jsonResponse(200, { success: true, message: 'Cash verified and job queued', order: updatedOrder });
    }

    // --------------------------------------------------------------------------
    // ACTION: verifyPayment (Operator confirms UPI received)
    // --------------------------------------------------------------------------
    if (method === 'POST' && action === 'verifyPayment') {
      const body = JSON.parse(event.body || '{}');
      const { shopId, orderId } = body;

      const updated = await updateOrderStatus(shopId, orderId, ORDER_STATES.PAYMENT_CONFIRMED, {
        paymentVerifiedAt: Date.now()
      });
      await updateOrderStatus(shopId, orderId, ORDER_STATES.PRINT_QUEUED);

      return jsonResponse(200, { success: true, message: 'UPI payment verified', order: updated });
    }

    // --------------------------------------------------------------------------
    // ACTION: rejectPayment (Operator rejects unconfirmed payment)
    // --------------------------------------------------------------------------
    if (method === 'POST' && action === 'rejectPayment') {
      const body = JSON.parse(event.body || '{}');
      const { shopId, orderId, reason } = body;

      const updated = await updateOrderStatus(shopId, orderId, ORDER_STATES.PAYMENT_REJECTED, {
        rejectionReason: reason || 'Payment not received in bank account'
      });

      return jsonResponse(200, { success: true, message: 'Order rejected', order: updated });
    }

    // --------------------------------------------------------------------------
    // ACTION: triggerPrint (Manual agent trigger)
    // --------------------------------------------------------------------------
    if (method === 'POST' && action === 'triggerPrint') {
      const body = JSON.parse(event.body || '{}');
      const { shopId, orderId } = body;

      const updated = await updateOrderStatus(shopId, orderId, ORDER_STATES.PRINTING, {
        printDispatchedAt: Date.now()
      });

      return jsonResponse(200, { success: true, message: 'Print job dispatched to agent', order: updated });
    }

    // --------------------------------------------------------------------------
    // ACTION: markPrinted (Order finished)
    // --------------------------------------------------------------------------
    if (method === 'POST' && action === 'markPrinted') {
      const body = JSON.parse(event.body || '{}');
      const { shopId, orderId } = body;

      const updated = await updateOrderStatus(shopId, orderId, ORDER_STATES.PRINTED, {
        printedAt: Date.now()
      });

      return jsonResponse(200, { success: true, message: 'Order marked completed', order: updated });
    }

    // --------------------------------------------------------------------------
    // ACTION: updateRates (Operator rate card updater)
    // --------------------------------------------------------------------------
    if (method === 'POST' && action === 'updateRates') {
      const body = JSON.parse(event.body || '{}');
      const { shopId, rates } = body;

      if (!shopId || !rates) {
        return jsonResponse(400, { success: false, message: 'shopId and rates payload required' });
      }

      await saveShopRates(shopId, rates);
      return jsonResponse(200, { success: true, message: 'Rate card updated' });
    }

    // --------------------------------------------------------------------------
    // ACTION: updateUpi (Operator UPI VPA updater)
    // --------------------------------------------------------------------------
    if (method === 'POST' && action === 'updateUpi') {
      const body = JSON.parse(event.body || '{}');
      const { shopId, upiId } = body;

      if (!isValidUpiId(upiId)) {
        return jsonResponse(400, { success: false, message: 'Invalid UPI VPA syntax' });
      }

      await updateShopField(shopId, 'upiId', upiId);
      return jsonResponse(200, { success: true, message: 'UPI ID updated' });
    }

    // --------------------------------------------------------------------------
    // ACTION: updateCashPin (Operator PIN updater)
    // --------------------------------------------------------------------------
    if (method === 'POST' && action === 'updateCashPin') {
      const body = JSON.parse(event.body || '{}');
      const { shopId, newPin } = body;

      if (!isValidCashPin(newPin)) {
        return jsonResponse(400, { success: false, message: 'PIN must be 4 to 6 numeric digits' });
      }

      const newHash = crypto.createHash('sha256').update(String(newPin)).digest('hex');
      await updateShopField(shopId, 'cashPinHash', newHash);

      return jsonResponse(200, { success: true, message: 'Cash security PIN updated' });
    }

    // --------------------------------------------------------------------------
    // SUPER ADMIN ACTIONS (Guard by Master Secret)
    // --------------------------------------------------------------------------
    if (action && action.startsWith('admin')) {
      const masterKeyHeader = event.headers['x-admin-master-key'] || query.masterKey;
      const expectedKey = process.env.AURA_MASTER_SECRET || 'aura_super_master_sec_2026';

      if (!masterKeyHeader || !timingSafeEqual(masterKeyHeader, expectedKey)) {
        return jsonResponse(401, { success: false, message: 'Unauthorized Super Admin access' });
      }

      if (action === 'adminVerifyKey') {
        return jsonResponse(200, { success: true, message: 'Authorized' });
      }

      if (action === 'adminGetPlatformData') {
        const platformData = await getAdminPlatformOverview();
        return jsonResponse(200, { success: true, ...platformData });
      }

      if (action === 'adminCreateShop') {
        const body = JSON.parse(event.body || '{}');
        const newShop = await provisionNewShop(body);
        return jsonResponse(201, { success: true, shop: newShop });
      }

      if (action === 'adminUpdateShop') {
        const body = JSON.parse(event.body || '{}');
        await updateTenantShopSettings(body.shopId, body);
        return jsonResponse(200, { success: true, message: 'Tenant settings updated' });
      }

      if (action === 'adminRegenerateToken') {
        const body = JSON.parse(event.body || '{}');
        const newToken = generateAgentToken();
        await updateShopField(body.shopId, 'agentToken', newToken);
        return jsonResponse(200, { success: true, newToken });
      }
    }

    // --------------------------------------------------------------------------
    // DEFAULT POST: Customer Kiosk / Passport Studio Multipart Order Creation
    // --------------------------------------------------------------------------
    if (method === 'POST') {
      const { fields, file } = await parseMultipartForm(event);

      const shopId = (fields.shopId || 'demo').trim().toLowerCase();
      const shop = await getShopRecord(shopId);
      if (!shop) {
        return jsonResponse(404, { success: false, message: 'Target shop not registered' });
      }

      if (shop.isActive === false) {
        return jsonResponse(403, { success: false, message: 'This print shop is currently suspended' });
      }

      if (!file || !file.buffer || file.buffer.length === 0) {
        return jsonResponse(400, { success: false, message: 'No valid file uploaded' });
      }

      // Check daily order quota
      const todayCount = await getShopTodayOrderCount(shopId);
      const quota = shop.dailyOrderCap || 150;
      if (todayCount >= quota) {
        return jsonResponse(429, {
          success: false,
          message: 'Shop daily order limit reached. Please contact shopkeeper directly.'
        });
      }

      const orderId = fields.orderId || generateOrderId();
      const paymentMethod = fields.paymentMethod || 'UPI';
      const reportedStatus = fields.reportedStatus || (paymentMethod === 'CASH' ? ORDER_STATES.AWAITING_CASH_CONFIRMATION : ORDER_STATES.PAYMENT_REVIEW);

      const quoteSnapshotRaw = fields.quoteSnapshot ? JSON.parse(fields.quoteSnapshot) : {};
      const transformSnapshotRaw = fields.transformSnapshot ? JSON.parse(fields.transformSnapshot) : {};

      // Server-side authoritative quote verification
      const isPassport = fields.isPassportStudio === 'true' || quoteSnapshotRaw.billingType === 'PASSPORT_PHOTO_SHEET';
      let verifiedAmount = quoteSnapshotRaw.totalAmount || 0;

      if (!isPassport) {
        const shopRates = shop.rates || DEFAULT_RATES;
        const recalculated = calculatePrintQuote({
          selectedPages: quoteSnapshotRaw.selectedPages || 1,
          copies: quoteSnapshotRaw.copies || 1,
          isColor: Boolean(quoteSnapshotRaw.isColor),
          isDuplex: Boolean(quoteSnapshotRaw.isDuplex),
          customRates: shopRates
        });
        verifiedAmount = recalculated.totalAmount;
      }

      // Store uploaded binary in Firebase Cloud Storage (or local memory)
      const storagePath = `shops/${shopId}/orders/${orderId}_${file.filename}`;
      let downloadUrl = '';

      if (storageBucket) {
        const fileRef = storageBucket.file(storagePath);
        await fileRef.save(file.buffer, {
          metadata: { contentType: file.mimeType }
        });
        // Generate signed URL valid for 24 hours
        const [signedUrl] = await fileRef.getSignedUrl({
          action: 'read',
          expires: Date.now() + 24 * 60 * 60 * 1000
        });
        downloadUrl = signedUrl;
      } else {
        // Fallback data URI for mock runtime
        downloadUrl = `data:${file.mimeType};base64,${file.buffer.toString('base64').slice(0, 2048)}...`;
      }

      // Build complete order document
      const orderDocument = {
        orderId,
        shopId,
        status: reportedStatus,
        paymentMethod,
        storagePath,
        downloadUrl,
        fileMetadata: {
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.size
        },
        quoteSnapshot: {
          ...quoteSnapshotRaw,
          totalAmount: verifiedAmount,
          currency: 'INR'
        },
        transformSnapshot: transformSnapshotRaw,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await saveOrderRecord(shopId, orderId, orderDocument);

      return jsonResponse(201, {
        success: true,
        orderId,
        status: reportedStatus,
        amount: verifiedAmount,
        message: 'Order created and queued successfully'
      });
    }

    // Fallback for unhandled routes
    return jsonResponse(404, { success: false, message: 'Resource or action not found' });

  } catch (error) {
    console.error('[CreateOrder API Error]:', error);
    return jsonResponse(500, {
      success: false,
      message: error.message || 'Internal server error while processing request'
    });
  }
};

// ==============================================================================
// 5. DATABASE ABSTRACTION HELPERS
// ==============================================================================

async function getShopRecord(shopId) {
  if (firestoreDb) {
    const doc = await firestoreDb.collection('shops').doc(shopId).get();
    return doc.exists ? doc.data() : null;
  }
  return memoryDb.shops.get(shopId) || null;
}

async function saveShopRates(shopId, rates) {
  if (firestoreDb) {
    await firestoreDb.collection('shops').doc(shopId).set({ rates, updatedAt: Date.now() }, { merge: true });
  } else {
    const s = memoryDb.shops.get(shopId);
    if (s) s.rates = rates;
  }
}

async function updateShopField(shopId, field, value) {
  if (firestoreDb) {
    await firestoreDb.collection('shops').doc(shopId).update({ [field]: value, updatedAt: Date.now() });
  } else {
    const s = memoryDb.shops.get(shopId);
    if (s) s[field] = value;
  }
}

async function getOrderRecord(shopId, orderId) {
  if (firestoreDb) {
    const doc = await firestoreDb.collection('shops').doc(shopId).collection('orders').doc(orderId).get();
    return doc.exists ? doc.data() : null;
  }
  return memoryDb.orders.get(`${shopId}:${orderId}`) || null;
}

async function saveOrderRecord(shopId, orderId, orderData) {
  if (firestoreDb) {
    await firestoreDb.collection('shops').doc(shopId).collection('orders').doc(orderId).set(orderData);
  } else {
    memoryDb.orders.set(`${shopId}:${orderId}`, orderData);
  }
}

async function updateOrderStatus(shopId, orderId, newStatus, extraFields = {}) {
  const current = await getOrderRecord(shopId, orderId);
  if (!current) throw new Error('Order not found');

  if (!isValidTransition(current.status, newStatus)) {
    throw new Error(`Invalid order state transition from ${current.status} to ${newStatus}`);
  }

  const updates = {
    ...extraFields,
    status: newStatus,
    updatedAt: Date.now()
  };

  if (firestoreDb) {
    await firestoreDb.collection('shops').doc(shopId).collection('orders').doc(orderId).update(updates);
  } else {
    Object.assign(current, updates);
    memoryDb.orders.set(`${shopId}:${orderId}`, current);
  }

  return { ...current, ...updates };
}

async function getOperatorSyncData(shopId) {
  let pendingOrders = [];
  let printQueue = [];
  let todayTotalRevenue = 0;
  let todayCompletedOrders = 0;
  let todayUpiRevenue = 0;
  let todayUpiCount = 0;
  let todayCashRevenue = 0;
  let todayCashCount = 0;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayMs = startOfDay.getTime();

  let orders = [];
  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('shops').doc(shopId).collection('orders')
      .where('createdAt', '>=', startOfDayMs)
      .orderBy('createdAt', 'desc')
      .get();
    orders = snapshot.docs.map(d => d.data());
  } else {
    orders = Array.from(memoryDb.orders.values())
      .filter(o => o.shopId === shopId && o.createdAt >= startOfDayMs);
  }

  orders.forEach(order => {
    const amt = Number(order.quoteSnapshot?.totalAmount || 0);

    // Active Verification List
    if ([ORDER_STATES.PAYMENT_REVIEW, ORDER_STATES.AWAITING_CASH_CONFIRMATION].includes(order.status)) {
      pendingOrders.push(order);
    }

    // Active Printable Queue
    if ([ORDER_STATES.PAYMENT_CONFIRMED, ORDER_STATES.CASH_CONFIRMED, ORDER_STATES.PRINT_QUEUED, ORDER_STATES.PRINTING].includes(order.status)) {
      printQueue.push(order);
    }

    // Completed Metrics
    if (order.status === ORDER_STATES.PRINTED) {
      todayCompletedOrders++;
      todayTotalRevenue += amt;
      if (order.paymentMethod === 'UPI') {
        todayUpiRevenue += amt;
        todayUpiCount++;
      } else {
        todayCashRevenue += amt;
        todayCashCount++;
      }
    }
  });

  // Fetch shop telemetry
  const shop = await getShopRecord(shopId);
  const telemetry = {
    isAgentOnline: Boolean(shop?.isAgentOnline),
    lastHeartbeat: shop?.lastAgentHeartbeat || 0,
    activePrinterName: shop?.activePrinterName || 'Windows Default Spooler'
  };

  return {
    pendingOrders,
    printQueue,
    telemetry,
    metrics: {
      todayTotalRevenue,
      todayCompletedOrders,
      todayUpiRevenue,
      todayUpiCount,
      todayCashRevenue,
      todayCashCount
    }
  };
}

async function getShopOrderHistory(shopId) {
  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('shops').doc(shopId).collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    return snapshot.docs.map(d => d.data());
  }
  return Array.from(memoryDb.orders.values())
    .filter(o => o.shopId === shopId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function getShopTodayOrderCount(shopId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startMs = startOfDay.getTime();

  if (firestoreDb) {
    const snap = await firestoreDb.collection('shops').doc(shopId).collection('orders')
      .where('createdAt', '>=', startMs)
      .count()
      .get();
    return snap.data().count;
  }
  return Array.from(memoryDb.orders.values())
    .filter(o => o.shopId === shopId && o.createdAt >= startMs).length;
}

async function getAdminPlatformOverview() {
  let shops = [];
  if (firestoreDb) {
    const snap = await firestoreDb.collection('shops').get();
    shops = snap.docs.map(d => d.data());
  } else {
    shops = Array.from(memoryDb.shops.values());
  }

  const connectedAgentsCount = shops.filter(s => s.isAgentOnline).length;
  let globalDailyOrders = 0;

  return {
    shops,
    platformMetrics: {
      totalShops: shops.length,
      connectedAgentsCount,
      globalDailyOrders
    }
  };
}

async function provisionNewShop(payload) {
  const slug = payload.shopId.toLowerCase();
  const token = generateAgentToken();
  const tierKey = (payload.subscriptionTier || 'GROWTH').toUpperCase();
  const tier = SUBSCRIPTION_TIERS[tierKey] || SUBSCRIPTION_TIERS.GROWTH;

  const shopDoc = {
    shopId: slug,
    shopName: payload.shopName,
    ownerPhone: payload.ownerPhone,
    city: payload.city || 'India',
    upiId: payload.upiId,
    subscriptionTier: tierKey,
    dailyOrderCap: tier.maxOrdersPerDay,
    isActive: true,
    agentToken: token,
    cashPinHash: crypto.createHash('sha256').update('1234').digest('hex'),
    rates: { ...DEFAULT_RATES },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  if (firestoreDb) {
    await firestoreDb.collection('shops').doc(slug).set(shopDoc);
  } else {
    memoryDb.shops.set(slug, shopDoc);
  }

  return shopDoc;
}

async function updateTenantShopSettings(shopId, settings) {
  const updates = {
    subscriptionTier: settings.subscriptionTier,
    dailyOrderCap: settings.dailyOrderCap,
    isActive: settings.isActive,
    updatedAt: Date.now()
  };

  if (firestoreDb) {
    await firestoreDb.collection('shops').doc(shopId).update(updates);
  } else {
    const s = memoryDb.shops.get(shopId);
    if (s) Object.assign(s, updates);
  }
}