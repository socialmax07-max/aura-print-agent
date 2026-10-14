/**
 * AURA PRINT PRO — DATABASE PROVISIONING & DEMO DATA SEED SCRIPT
 * File: scripts/seed-demo-data.js
 * Platform: Node.js (Run via: npm run seed or node scripts/seed-demo-data.js)
 * Owner: Sabir Ansari
 * 
 * Provisions:
 * - 3 Tenant Shop Profiles with rate cards, UPI IDs, and auth secrets
 * - Salted SHA-256 Operator Cash PINs and passwords
 * - Mock active orders spanning multiple lifecycle states for verification
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');

const { ORDER_STATES } = require('../src/shared/order-states.js');
const { DEFAULT_RATES, SUBSCRIPTION_TIERS } = require('../src/shared/constants.js');
const { hashPin, generateAgentToken } = require('../src/shared/crypto-utils.js');

// ==============================================================================
// 1. FIREBASE INITIALIZATION OR LOCAL FALLBACK
// ==============================================================================
let firestoreDb = null;
let isFirestoreAvailable = false;

function setupDatabase() {
  if (admin.apps.length > 0) {
    firestoreDb = admin.firestore();
    isFirestoreAvailable = true;
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
    }

    if (credential) {
      admin.initializeApp({ credential });
      firestoreDb = admin.firestore();
      isFirestoreAvailable = true;
      console.log('✔ Connected to Google Cloud Firestore (Production / Staging mode)');
    } else {
      console.log('ℹ No Firebase credentials detected in environment.');
      console.log('ℹ Seeding will output to local file: data/mock-db-seed.json');
    }
  } catch (err) {
    console.warn('⚠️ Firebase Admin initialization failed:', err.message);
    console.log('ℹ Falling back to local JSON fixture generation.');
  }
}

// ==============================================================================
// 2. SEED DATA DEFINITIONS
// ==============================================================================

const defaultPinHash = hashPin('1234');
const defaultPasswordHash = crypto.createHash('sha256').update('aura1234').digest('hex');

const SHOPS_TO_SEED = [
  {
    shopId: 'demo',
    shopName: 'AURA Demo CSC Centre',
    ownerPhone: '9876543210',
    city: 'Bagaha, Bihar',
    upiId: 'sabirprint@okaxis',
    subscriptionTier: 'GROWTH',
    dailyOrderCap: SUBSCRIPTION_TIERS.GROWTH.maxOrdersPerDay,
    isActive: true,
    agentToken: 'demo_agent_secret_token_1234567890abcdef',
    passwordHash: defaultPasswordHash,
    cashPinHash: defaultPinHash.hash,
    cashPinSalt: defaultPinHash.salt,
    activePrinterName: 'HP LaserJet Pro M126nw (Counter Laser)',
    isAgentOnline: true,
    lastAgentHeartbeat: Date.now(),
    rates: {
      bwSingle: 2.0,
      bwDuplex: 3.0,
      colorSingle: 10.0,
      colorDuplex: 16.0,
      passportSheet4x6: 30.0,
      passportSheetA4: 50.0
    },
    createdAt: Date.now() - (7 * 24 * 60 * 60 * 1000),
    updatedAt: Date.now()
  },
  {
    shopId: 'delhi-cyber-hub',
    shopName: 'Delhi Print Point & CSC',
    ownerPhone: '9811223344',
    city: 'Laxmi Nagar, Delhi',
    upiId: 'delhiprint@icici',
    subscriptionTier: 'PROFESSIONAL',
    dailyOrderCap: SUBSCRIPTION_TIERS.PROFESSIONAL.maxOrdersPerDay,
    isActive: true,
    agentToken: generateAgentToken(),
    passwordHash: defaultPasswordHash,
    cashPinHash: defaultPinHash.hash,
    cashPinSalt: defaultPinHash.salt,
    activePrinterName: 'Canon imageRUNNER 2206 / Epson L805',
    isAgentOnline: true,
    lastAgentHeartbeat: Date.now() - 4000,
    rates: {
      bwSingle: 2.0,
      bwDuplex: 3.0,
      colorSingle: 8.0,
      colorDuplex: 14.0,
      passportSheet4x6: 35.0,
      passportSheetA4: 60.0
    },
    createdAt: Date.now() - (14 * 24 * 60 * 60 * 1000),
    updatedAt: Date.now()
  },
  {
    shopId: 'patna-digital-hub',
    shopName: 'Patna High-Speed Xerox & Online',
    ownerPhone: '9431001122',
    city: 'Boring Road, Patna, Bihar',
    upiId: 'patnadigital@sbi',
    subscriptionTier: 'BUSINESS',
    dailyOrderCap: SUBSCRIPTION_TIERS.BUSINESS.maxOrdersPerDay,
    isActive: true,
    agentToken: generateAgentToken(),
    passwordHash: defaultPasswordHash,
    cashPinHash: defaultPinHash.hash,
    cashPinSalt: defaultPinHash.salt,
    activePrinterName: 'HP Neverstop Laser 1200w',
    isAgentOnline: false,
    lastAgentHeartbeat: Date.now() - 3600000,
    rates: {
      bwSingle: 1.5,
      bwDuplex: 2.5,
      colorSingle: 10.0,
      colorDuplex: 15.0,
      passportSheet4x6: 30.0,
      passportSheetA4: 50.0
    },
    createdAt: Date.now() - (30 * 24 * 60 * 60 * 1000),
    updatedAt: Date.now()
  }
];

const now = Date.now();

const SAMPLE_ORDERS = [
  // 1. Pending UPI Verification Order
  {
    orderId: 'ORD-9H4K2M',
    shopId: 'demo',
    status: ORDER_STATES.PAYMENT_REVIEW,
    paymentMethod: 'UPI',
    utrNumber: '428901234567',
    utrSubmittedAt: now - 120000,
    downloadUrl: 'https://cdn.auraprintpro.example/mock/sample_aadhar.pdf',
    storagePath: 'shops/demo/orders/ORD-9H4K2M_aadhar_card.pdf',
    fileMetadata: {
      filename: 'aadhar_card.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 412580
    },
    quoteSnapshot: {
      documentName: 'aadhar_card.pdf',
      documentSize: 412580,
      fileType: 'PDF',
      totalPagesInFile: 1,
      selectedPages: 1,
      selectedPagesList: [1],
      copies: 2,
      isColor: true,
      isDuplex: false,
      paperSize: 'A4',
      sheetsPerCopy: 1,
      totalPhysicalSheets: 2,
      unitRate: 10.0,
      totalAmount: 20.0,
      currency: 'INR'
    },
    createdAt: now - 180000,
    updatedAt: now - 120000
  },

  // 2. Pending Cash at Counter Order
  {
    orderId: 'ORD-7X2P9L',
    shopId: 'demo',
    status: ORDER_STATES.AWAITING_CASH_CONFIRMATION,
    paymentMethod: 'CASH',
    downloadUrl: 'https://cdn.auraprintpro.example/mock/syllabus_exam.pdf',
    storagePath: 'shops/demo/orders/ORD-7X2P9L_syllabus_exam.pdf',
    fileMetadata: {
      filename: 'syllabus_exam.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1845900
    },
    quoteSnapshot: {
      documentName: 'syllabus_exam.pdf',
      documentSize: 1845900,
      fileType: 'PDF',
      totalPagesInFile: 11,
      selectedPages: 11,
      selectedPagesList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      copies: 1,
      isColor: false,
      isDuplex: true,
      paperSize: 'A4',
      sheetsPerCopy: 6,
      totalPhysicalSheets: 6,
      unitRate: 3.0,
      totalAmount: 18.0,
      currency: 'INR'
    },
    createdAt: now - 300000,
    updatedAt: now - 300000
  },

  // 3. Ready to Print (PRINT_QUEUED)
  {
    orderId: 'ORD-3M8V1Q',
    shopId: 'demo',
    status: ORDER_STATES.PRINT_QUEUED,
    paymentMethod: 'UPI',
    utrNumber: '428909876543',
    downloadUrl: 'https://cdn.auraprintpro.example/mock/resume_sabir.pdf',
    storagePath: 'shops/demo/orders/ORD-3M8V1Q_resume_sabir.pdf',
    fileMetadata: {
      filename: 'resume_sabir.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 256800
    },
    quoteSnapshot: {
      documentName: 'resume_sabir.pdf',
      documentSize: 256800,
      fileType: 'PDF',
      totalPagesInFile: 2,
      selectedPages: 2,
      selectedPagesList: [1, 2],
      copies: 3,
      isColor: false,
      isDuplex: true,
      paperSize: 'A4',
      sheetsPerCopy: 1,
      totalPhysicalSheets: 3,
      unitRate: 3.0,
      totalAmount: 9.0,
      currency: 'INR'
    },
    createdAt: now - 900000,
    updatedAt: now - 450000
  },

  // 4. Passport Photo Studio Job
  {
    orderId: 'ORD-5B6C8D',
    shopId: 'demo',
    status: ORDER_STATES.PRINT_QUEUED,
    paymentMethod: 'CASH',
    cashConfirmedAt: now - 180000,
    downloadUrl: 'https://cdn.auraprintpro.example/mock/passport_grid_8.pdf',
    storagePath: 'shops/demo/orders/ORD-5B6C8D_passport_sheet.pdf',
    fileMetadata: {
      filename: 'passport_sheet.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 890400
    },
    quoteSnapshot: {
      documentName: 'passport_sheet.pdf',
      billingType: 'PASSPORT_PHOTO_SHEET',
      sheetFormat: 'PHOTO_4X6',
      photoCount: 8,
      preset: 'Indian Passport (35x45mm)',
      totalPhysicalSheets: 1,
      totalAmount: 30.0,
      currency: 'INR'
    },
    createdAt: now - 360000,
    updatedAt: now - 180000
  },

  // 5. Completed & Printed Order (Registers in Today's Sales Metrics)
  {
    orderId: 'ORD-1A2B3C',
    shopId: 'demo',
    status: ORDER_STATES.PRINTED,
    paymentMethod: 'UPI',
    utrNumber: '428900112233',
    printedAt: now - 1800000,
    downloadUrl: 'https://cdn.auraprintpro.example/mock/land_record_bihar.pdf',
    storagePath: 'shops/demo/orders/ORD-1A2B3C_land_record_bihar.pdf',
    fileMetadata: {
      filename: 'land_record_bihar.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1250300
    },
    quoteSnapshot: {
      documentName: 'land_record_bihar.pdf',
      documentSize: 1250300,
      fileType: 'PDF',
      totalPagesInFile: 5,
      selectedPages: 5,
      selectedPagesList: [1, 2, 3, 4, 5],
      copies: 2,
      isColor: false,
      isDuplex: false,
      paperSize: 'A4',
      sheetsPerCopy: 5,
      totalPhysicalSheets: 10,
      unitRate: 2.0,
      totalAmount: 20.0,
      currency: 'INR'
    },
    createdAt: now - 2400000,
    updatedAt: now - 1800000
  }
];

// ==============================================================================
// 3. EXECUTION LOGIC
// ==============================================================================

async function seedData() {
  console.log('================================================================');
  console.log('      AURA PRINT PRO — INITIAL DATABASE PROVISIONING            ');
  console.log('================================================================');

  setupDatabase();

  if (isFirestoreAvailable && firestoreDb) {
    console.log('\n[1/2] Seeding Tenant Shops into Firestore...');
    const batch = firestoreDb.batch();

    for (const shop of SHOPS_TO_SEED) {
      const docRef = firestoreDb.collection('shops').doc(shop.shopId);
      batch.set(docRef, shop, { merge: true });
      console.log(`  + Provisioned Shop: ${shop.shopId} (${shop.shopName})`);
    }

    console.log('\n[2/2] Seeding Sample Orders into Firestore...');
    for (const order of SAMPLE_ORDERS) {
      const orderRef = firestoreDb
        .collection('shops')
        .doc(order.shopId)
        .collection('orders')
        .doc(order.orderId);
      batch.set(orderRef, order, { merge: true });
      console.log(`  + Provisioned Order: ${order.orderId} [${order.status}] (${order.paymentMethod})`);
    }

    await batch.commit();
    console.log('\n✔ All documents committed to Firestore successfully.');

  } else {
    // Generate local fixture seed file
    const targetDir = path.resolve(__dirname, '../data');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFile = path.join(targetDir, 'mock-db-seed.json');
    const dump = {
      timestamp: new Date().toISOString(),
      shops: SHOPS_TO_SEED,
      orders: SAMPLE_ORDERS
    };

    fs.writeFileSync(targetFile, JSON.stringify(dump, null, 2), 'utf8');
    console.log(`\n✔ Local fixture file successfully generated at:\n  -> ${targetFile}`);
  }

  console.log('\n================================================================');
  console.log('Default Operator Credentials:');
  console.log('  Shop ID:          demo');
  console.log('  Operator Password: aura1234');
  console.log('  Cash PIN:         1234');
  console.log('  Agent Token:      demo_agent_secret_token_1234567890abcdef');
  console.log('================================================================\n');
}

seedData().catch(err => {
  console.error('\n✖ Seeding aborted due to error:', err);
  process.exit(1);
});
