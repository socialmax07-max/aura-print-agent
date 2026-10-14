/**
 * AURA PRINT PRO — DEDICATED PAYMENT VERIFICATION & RECONCILIATION API
 * File: netlify/functions/verify-payment.js
 * Owner: Sabir Ansari
 * 
 * Routes Handled:
 * - POST /api/verify-payment?action=submitUtr  -> Customer submits 12-digit Bank UTR / RRN
 * - POST /api/verify-payment?action=webhook    -> Automated payment gateway callback with HMAC check
 * - GET  /api/verify-payment?action=checkUtr   -> Validates UTR uniqueness across the tenant shop
 */

const crypto = require('crypto');
const admin = require('firebase-admin');

const { ORDER_STATES, isValidTransition } = require('../../src/shared/order-states.js');
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
    console.warn('[VerifyPayment FirebaseInit] Warning: Mock fallback database active:', err.message);
  }
}

// In-memory fallback database for local tests or non-Firebase runtimes
const memoryDb = {
  orders: new Map(),
  usedUtrs: new Set()
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-signature',
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
// 2. MAIN HANDLER
// ==============================================================================
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  initializeFirebase();

  const query = event.queryStringParameters || {};
  const action = query.action || 'submitUtr';

  try {
    // --------------------------------------------------------------------------
    // ACTION: submitUtr (Customer enters 12-digit UPI Reference / UTR Number)
    // --------------------------------------------------------------------------
    if (event.httpMethod === 'POST' && action === 'submitUtr') {
      const body = JSON.parse(event.body || '{}');
      const { shopId, orderId, utrNumber } = body;

      if (!shopId || !orderId || !utrNumber) {
        return jsonResponse(400, {
          success: false,
          message: 'shopId, orderId, and utrNumber are mandatory fields'
        });
      }

      const cleanUtr = String(utrNumber).trim();

      // NPCI Standard: Bank UTR / RRN consists of exactly 12 numeric digits
      if (!/^\d{12}$/.test(cleanUtr)) {
        return jsonResponse(400, {
          success: false,
          message: 'Invalid UTR format. Bank reference number must be exactly 12 digits (e.g., 412356789012).'
        });
      }

      // Check for duplicate UTR usage across this shop
      const isDuplicate = await isUtrAlreadyClaimed(shopId, cleanUtr, orderId);
      if (isDuplicate) {
        return jsonResponse(409, {
          success: false,
          message: 'This UPI Reference (UTR) number has already been submitted for another order.'
        });
      }

      const order = await getOrderRecord(shopId, orderId);
      if (!order) {
        return jsonResponse(404, { success: false, message: 'Order not found' });
      }

      // Order must be in AWAITING_PAYMENT or PAYMENT_REVIEW
      if (![ORDER_STATES.AWAITING_PAYMENT, ORDER_STATES.PAYMENT_REVIEW].includes(order.status)) {
        return jsonResponse(400, {
          success: false,
          message: `Cannot attach UTR to order in state: ${order.status}`
        });
      }

      // Record UTR and transition order to PAYMENT_REVIEW
      const updatedOrder = await updateOrderFields(shopId, orderId, {
        utrNumber: cleanUtr,
        status: ORDER_STATES.PAYMENT_REVIEW,
        utrSubmittedAt: Date.now(),
        updatedAt: Date.now()
      });

      return jsonResponse(200, {
        success: true,
        orderId,
        status: ORDER_STATES.PAYMENT_REVIEW,
        message: 'UPI Reference number attached successfully. Waiting for operator verification.',
        order: updatedOrder
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: webhook (Automated Payment Gateway Callback)
    // --------------------------------------------------------------------------
    if (event.httpMethod === 'POST' && action === 'webhook') {
      const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || 'aura_webhook_default_secret_2026';
      const signature = event.headers['x-webhook-signature'] || event.headers['X-Webhook-Signature'];

      if (!signature) {
        return jsonResponse(401, { success: false, message: 'Missing x-webhook-signature header' });
      }

      // Verify HMAC-SHA256 signature
      const rawBody = event.body || '';
      const computedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (!timingSafeEqual(signature, computedSignature)) {
        return jsonResponse(403, { success: false, message: 'Invalid webhook signature' });
      }

      const payload = JSON.parse(rawBody);
      const { shopId, orderId, status: paymentStatus, transactionId, amountPaid } = payload;

      if (!shopId || !orderId) {
        return jsonResponse(400, { success: false, message: 'shopId and orderId required in webhook payload' });
      }

      const order = await getOrderRecord(shopId, orderId);
      if (!order) {
        return jsonResponse(404, { success: false, message: 'Order not found' });
      }

      if (paymentStatus === 'SUCCESS' || paymentStatus === 'CHARGED') {
        // Enforce state transition checks
        if (isValidTransition(order.status, ORDER_STATES.PAYMENT_CONFIRMED)) {
          await updateOrderFields(shopId, orderId, {
            status: ORDER_STATES.PAYMENT_CONFIRMED,
            gatewayTransactionId: transactionId || null,
            gatewayAmountPaid: amountPaid || order.quoteSnapshot?.totalAmount || 0,
            paymentVerifiedAt: Date.now(),
            updatedAt: Date.now()
          });

          // Queue order for printing
          await updateOrderFields(shopId, orderId, {
            status: ORDER_STATES.PRINT_QUEUED,
            updatedAt: Date.now()
          });

          return jsonResponse(200, {
            success: true,
            orderId,
            message: 'Webhook processed: Order marked PAYMENT_CONFIRMED and PRINT_QUEUED'
          });
        }
      } else if (paymentStatus === 'FAILED') {
        if (isValidTransition(order.status, ORDER_STATES.PAYMENT_REJECTED)) {
          await updateOrderFields(shopId, orderId, {
            status: ORDER_STATES.PAYMENT_REJECTED,
            paymentRejectionReason: payload.failureReason || 'Payment gateway reported failed transaction',
            updatedAt: Date.now()
          });

          return jsonResponse(200, {
            success: true,
            orderId,
            message: 'Webhook processed: Order marked PAYMENT_REJECTED'
          });
        }
      }

      return jsonResponse(200, { success: true, message: 'Webhook event recorded without state change' });
    }

    // --------------------------------------------------------------------------
    // ACTION: checkUtr (Pre-submission syntax & duplicate check)
    // --------------------------------------------------------------------------
    if (event.httpMethod === 'GET' && action === 'checkUtr') {
      const { shopId, utrNumber, orderId } = query;
      if (!shopId || !utrNumber) {
        return jsonResponse(400, { success: false, message: 'shopId and utrNumber are required' });
      }

      const cleanUtr = String(utrNumber).trim();
      const isValidFormat = /^\d{12}$/.test(cleanUtr);
      if (!isValidFormat) {
        return jsonResponse(200, {
          success: true,
          isValid: false,
          reason: 'Must be exactly 12 numeric digits'
        });
      }

      const isClaimed = await isUtrAlreadyClaimed(shopId, cleanUtr, orderId);
      return jsonResponse(200, {
        success: true,
        isValid: !isClaimed,
        isDuplicate: isClaimed
      });
    }

    return jsonResponse(400, { success: false, message: `Unknown or unhandled action: ${action}` });

  } catch (error) {
    console.error('[VerifyPayment Error]:', error);
    return jsonResponse(500, {
      success: false,
      message: error.message || 'Internal server error processing payment verification'
    });
  }
};

// ==============================================================================
// 3. DATABASE RECONCILIATION HELPERS
// ==============================================================================

async function getOrderRecord(shopId, orderId) {
  if (firestoreDb) {
    const doc = await firestoreDb.collection('shops').doc(shopId).collection('orders').doc(orderId).get();
    return doc.exists ? doc.data() : null;
  }
  return memoryDb.orders.get(`${shopId}:${orderId}`) || null;
}

async function updateOrderFields(shopId, orderId, fields) {
  if (firestoreDb) {
    await firestoreDb.collection('shops').doc(shopId).collection('orders').doc(orderId).update(fields);
    const updated = await firestoreDb.collection('shops').doc(shopId).collection('orders').doc(orderId).get();
    return updated.data();
  }

  const order = memoryDb.orders.get(`${shopId}:${orderId}`) || {};
  Object.assign(order, fields);
  memoryDb.orders.set(`${shopId}:${orderId}`, order);

  if (fields.utrNumber) {
    memoryDb.usedUtrs.add(`${shopId}:${fields.utrNumber}`);
  }

  return order;
}

async function isUtrAlreadyClaimed(shopId, utrNumber, excludeOrderId = null) {
  if (firestoreDb) {
    const querySnapshot = await firestoreDb.collection('shops').doc(shopId).collection('orders')
      .where('utrNumber', '==', utrNumber)
      .limit(2)
      .get();

    if (querySnapshot.empty) return false;

    // Check if matching order is not the same order being edited
    for (const doc of querySnapshot.docs) {
      if (doc.id !== excludeOrderId) {
        return true;
      }
    }
    return false;
  }

  return memoryDb.usedUtrs.has(`${shopId}:${utrNumber}`);
}
