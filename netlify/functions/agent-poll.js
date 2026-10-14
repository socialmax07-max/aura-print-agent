/**
 * AURA PRINT PRO — WINDOWS PRINT AGENT POLLING & DISPATCH ENDPOINT
 * File: netlify/functions/agent-poll.js
 * Owner: Sabir Ansari
 * 
 * Routes Handled:
 * - POST /api/agent-poll?action=poll      -> Heartbeat + claims oldest PRINT_QUEUED job
 * - POST /api/agent-poll?action=ack       -> Acknowledges spooler print success/failure
 * - POST /api/agent-poll?action=heartbeat -> Lightweight telemetry pulse (status, printer name)
 */

const admin = require('firebase-admin');
const { ORDER_STATES, isValidTransition } = require('../../src/shared/order-states.js');
const { timingSafeEqual } = require('../../src/shared/crypto-utils.js');

// ==============================================================================
// 1. FIREBASE ADMIN INITIALIZATION
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

    admin.initializeApp({
      credential,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
    });

    firestoreDb = admin.firestore();
    storageBucket = admin.storage().bucket();
  } catch (err) {
    console.warn('[AgentPoll FirebaseInit] Warning: Firebase Admin initialized in mock/fallback mode:', err.message);
  }
}

// In-memory fallback database for development and sandbox modes
const memoryDb = {
  shops: new Map([
    ['demo', {
      shopId: 'demo',
      agentToken: 'demo_agent_secret_token_1234567890abcdef',
      isAgentOnline: true,
      lastAgentHeartbeat: Date.now(),
      activePrinterName: 'HP LaserJet Pro MFP M126nw'
    }]
  ]),
  orders: new Map()
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-agent-token, x-shop-id',
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

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, message: 'Method Not Allowed. Expected POST.' });
  }

  initializeFirebase();

  const query = event.queryStringParameters || {};
  const action = query.action || 'poll';

  // 1. Authenticate Request
  const shopId = (event.headers['x-shop-id'] || query.shopId || '').trim().toLowerCase();
  const agentToken = (event.headers['x-agent-token'] || query.agentToken || '').trim();

  if (!shopId || !agentToken) {
    return jsonResponse(401, {
      success: false,
      message: 'Unauthorized: Missing x-shop-id or x-agent-token header'
    });
  }

  const shop = await getShopRecord(shopId);
  if (!shop) {
    return jsonResponse(404, { success: false, message: 'Tenant shop not registered' });
  }

  // Verify token using constant-time comparison
  const expectedToken = shop.agentToken || '';
  if (!timingSafeEqual(agentToken, expectedToken)) {
    return jsonResponse(403, { success: false, message: 'Forbidden: Invalid Windows Agent secret token' });
  }

  if (shop.isActive === false) {
    return jsonResponse(403, { success: false, message: 'Tenant shop is suspended' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    body = {};
  }

  // ----------------------------------------------------------------------------
  // ACTION: heartbeat (Ping only)
  // ----------------------------------------------------------------------------
  if (action === 'heartbeat') {
    await updateShopTelemetry(shopId, {
      isAgentOnline: true,
      lastAgentHeartbeat: Date.now(),
      activePrinterName: body.printerName || shop.activePrinterName || 'Windows Spooler',
      agentVersion: body.agentVersion || '1.0.0',
      osPlatform: body.osPlatform || 'win32'
    });

    return jsonResponse(200, {
      success: true,
      acknowledgedAt: Date.now(),
      status: 'HEARTBEAT_RECORDED'
    });
  }

  // ----------------------------------------------------------------------------
  // ACTION: ack (Agent reports print execution result)
  // ----------------------------------------------------------------------------
  if (action === 'ack') {
    const { orderId, success, errorReason, printedPages } = body;

    if (!orderId) {
      return jsonResponse(400, { success: false, message: 'orderId is required for ack' });
    }

    const order = await getOrderRecord(shopId, orderId);
    if (!order) {
      return jsonResponse(404, { success: false, message: 'Order not found' });
    }

    if (success) {
      await updateOrderStatus(shopId, orderId, ORDER_STATES.PRINTED, {
        printedAt: Date.now(),
        printedPagesCount: printedPages || order.quoteSnapshot?.selectedPages || 1,
        agentExecutionNotes: 'Completed successfully by Windows Spooler'
      });

      return jsonResponse(200, {
        success: true,
        orderId,
        newStatus: ORDER_STATES.PRINTED,
        message: 'Order marked completed'
      });
    } else {
      // Print failure report (Paper jam, out of ink, user cancelled)
      await updateOrderStatus(shopId, orderId, ORDER_STATES.PRINT_FAILED, {
        printFailedAt: Date.now(),
        failureReason: errorReason || 'Windows print spooler rejected document'
      });

      return jsonResponse(200, {
        success: true,
        orderId,
        newStatus: ORDER_STATES.PRINT_FAILED,
        message: 'Order failure recorded'
      });
    }
  }

  // ----------------------------------------------------------------------------
  // ACTION: poll (Default: Heartbeat + Atomic Job Claim)
  // ----------------------------------------------------------------------------
  if (action === 'poll') {
    // 1. Record Heartbeat
    await updateShopTelemetry(shopId, {
      isAgentOnline: true,
      lastAgentHeartbeat: Date.now(),
      activePrinterName: body.printerName || shop.activePrinterName || 'Windows Spooler',
      agentVersion: body.agentVersion || '1.0.0',
      osPlatform: body.osPlatform || 'win32',
      spoolerStatus: body.spoolerStatus || 'IDLE'
    });

    // 2. Query for next available PRINT_QUEUED order
    const claimableJob = await claimNextPrintJob(shopId);

    if (!claimableJob) {
      return jsonResponse(200, {
        success: true,
        hasJob: false,
        pollIntervalMs: 3000,
        message: 'No print jobs waiting in queue'
      });
    }

    // 3. Generate Fresh Signed URL for Windows Agent Downloader
    let secureDownloadUrl = claimableJob.downloadUrl;
    if (storageBucket && claimableJob.storagePath) {
      try {
        const fileRef = storageBucket.file(claimableJob.storagePath);
        const [signedUrl] = await fileRef.getSignedUrl({
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000 // Valid for 15 minutes
        });
        secureDownloadUrl = signedUrl;
      } catch (err) {
        console.warn('[AgentPoll] Signed URL generation failed, falling back:', err.message);
      }
    }

    const quote = claimableJob.quoteSnapshot || {};
    const transform = claimableJob.transformSnapshot || {};

    // 4. Return Normalized Print Command Payload
    const printJobPayload = {
      orderId: claimableJob.orderId,
      shopId: claimableJob.shopId,
      documentName: quote.documentName || claimableJob.fileMetadata?.filename || 'document.pdf',
      downloadUrl: secureDownloadUrl,
      fileType: quote.fileType || 'PDF',
      fileSizeBytes: claimableJob.fileMetadata?.sizeBytes || quote.documentSize || 0,
      
      // Spooler Hardware Directives
      printDirectives: {
        copies: quote.copies || 1,
        isColor: Boolean(quote.isColor),
        isDuplex: Boolean(quote.isDuplex),
        paperSize: quote.paperSize || 'A4',
        pageRanges: quote.selectedPagesList && quote.selectedPagesList.length > 0
          ? quote.selectedPagesList.join(',')
          : 'ALL',
        totalPagesInDoc: quote.totalPagesInFile || 1,
        selectedPagesCount: quote.selectedPages || 1,
        
        // Image transformations
        rotationDegrees: transform.rotationDeg || 0,
        scaleMode: 'FIT_PAGE'
      },
      claimedAt: Date.now()
    };

    return jsonResponse(200, {
      success: true,
      hasJob: true,
      job: printJobPayload
    });
  }

  return jsonResponse(400, { success: false, message: `Unsupported action: ${action}` });
};

// ==============================================================================
// 3. DATABASE ACCESS HELPERS
// ==============================================================================

async function getShopRecord(shopId) {
  if (firestoreDb) {
    const doc = await firestoreDb.collection('shops').doc(shopId).get();
    return doc.exists ? doc.data() : null;
  }
  return memoryDb.shops.get(shopId) || null;
}

async function updateShopTelemetry(shopId, telemetry) {
  if (firestoreDb) {
    await firestoreDb.collection('shops').doc(shopId).set(telemetry, { merge: true });
  } else {
    const s = memoryDb.shops.get(shopId);
    if (s) Object.assign(s, telemetry);
  }
}

async function getOrderRecord(shopId, orderId) {
  if (firestoreDb) {
    const doc = await firestoreDb.collection('shops').doc(shopId).collection('orders').doc(orderId).get();
    return doc.exists ? doc.data() : null;
  }
  return memoryDb.orders.get(`${shopId}:${orderId}`) || null;
}

async function updateOrderStatus(shopId, orderId, newStatus, extraFields = {}) {
  const current = await getOrderRecord(shopId, orderId);
  if (!current) throw new Error('Order not found');

  if (!isValidTransition(current.status, newStatus)) {
    throw new Error(`Invalid transition from ${current.status} to ${newStatus}`);
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

/**
 * Atomically queries and claims the oldest available PRINT_QUEUED order.
 * Transitions claimed order to PRINTING immediately to avoid race conditions.
 */
async function claimNextPrintJob(shopId) {
  if (firestoreDb) {
    const ordersRef = firestoreDb.collection('shops').doc(shopId).collection('orders');
    
    // Use transaction for atomic claim
    return await firestoreDb.runTransaction(async (transaction) => {
      const querySnapshot = await transaction.get(
        ordersRef
          .where('status', '==', ORDER_STATES.PRINT_QUEUED)
          .orderBy('createdAt', 'asc')
          .limit(1)
      );

      if (querySnapshot.empty) {
        return null;
      }

      const doc = querySnapshot.docs[0];
      const jobData = doc.data();

      // Atomically mark status = PRINTING
      transaction.update(doc.ref, {
        status: ORDER_STATES.PRINTING,
        claimedAt: Date.now(),
        updatedAt: Date.now()
      });

      return { ...jobData, status: ORDER_STATES.PRINTING };
    });
  }

  // Memory Fallback
  for (const [key, order] of memoryDb.orders.entries()) {
    if (order.shopId === shopId && order.status === ORDER_STATES.PRINT_QUEUED) {
      order.status = ORDER_STATES.PRINTING;
      order.claimedAt = Date.now();
      order.updatedAt = Date.now();
      memoryDb.orders.set(key, order);
      return order;
    }
  }

  return null;
}
