/**
 * AURA PRINT PRO — SYSTEM CONSTANTS & CONFIGURATION REGISTRY
 * Owner: Sabir Ansari
 * 
 * Defines:
 * - 5 Owner-configurable SaaS subscription tiers
 * - Standard paper dimensions (A4, Legal, Letter, 4x6)
 * - Passport Photo Studio size presets (35x45mm, 2x2in, Stamp)
 * - System operational limits and token lifetimes
 */

/**
 * Owner-configurable SaaS Subscription Tiers for Sabir Ansari
 * Distinguishes SaaS rental licenses from shopkeeper printing revenue.
 */
export const SUBSCRIPTION_TIERS = Object.freeze({
  STARTER: {
    id: 'starter',
    name: 'Starter',
    tagline: 'Ideal for small rural CSC centres & village kiosks',
    monthlyPrice: 299,
    annualPrice: 2999,
    maxDailyOrders: 50,
    maxConnectedPrinters: 1,
    maxStorageMb: 500,
    retentionDays: 7,
    features: [
      'Single Windows Print Agent',
      'Standard Document Printing (PDF/Img)',
      'UPI QR & Cash Counter Mode',
      'Daily Sales Register',
      '7-day document auto-purge'
    ]
  },
  GROWTH: {
    id: 'growth',
    name: 'Growth',
    tagline: 'Built for active cyber cafes and photocopy shops',
    monthlyPrice: 599,
    annualPrice: 5999,
    maxDailyOrders: 150,
    maxConnectedPrinters: 2,
    maxStorageMb: 2048,
    retentionDays: 15,
    features: [
      'Up to 2 Print Agent terminals',
      'Passport Photo Studio module',
      'Custom Rate Card configuration',
      'Audio order chimes & alert banner',
      '15-day document auto-purge'
    ]
  },
  PROFESSIONAL: {
    id: 'professional',
    name: 'Professional',
    tagline: 'For high-volume college-adjacent Xerox & print centres',
    monthlyPrice: 999,
    annualPrice: 9999,
    maxDailyOrders: 500,
    maxConnectedPrinters: 4,
    maxStorageMb: 8192,
    retentionDays: 30,
    features: [
      'Up to 4 High-Speed Print Agents',
      'Full Passport Studio (Custom grids)',
      'Operator PIN authorization for Cash',
      'Exportable CSV GST/Accounting registers',
      'Print-ready Shop Standee Generator',
      '30-day document auto-purge'
    ]
  },
  BUSINESS: {
    id: 'business',
    name: 'Business',
    tagline: 'For busy stationery hubs with multi-counter staff',
    monthlyPrice: 1499,
    annualPrice: 14999,
    maxDailyOrders: 1500,
    maxConnectedPrinters: 8,
    maxStorageMb: 20480,
    retentionDays: 60,
    features: [
      'Up to 8 Connected Printers / Counters',
      'Multi-operator shift logs',
      'Priority print-queue routing',
      'Custom branding on customer kiosk',
      '60-day document auto-purge'
    ]
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Multi-branch printing franchises and institutional shops',
    monthlyPrice: 2499,
    annualPrice: 24999,
    maxDailyOrders: -1, // Unlimited
    maxConnectedPrinters: -1, // Unlimited
    maxStorageMb: 102400,
    retentionDays: 180,
    features: [
      'Unlimited daily orders & print agents',
      'Multi-branch master analytics',
      'Dedicated Sabir Ansari VIP support',
      'Custom API webhooks for billing',
      '180-day document retention'
    ]
  }
});

/**
 * Standard paper dimensions in millimeters and points (72 DPI standard PDF points)
 */
export const PAPER_SIZES = Object.freeze({
  A4: {
    name: 'A4',
    widthMm: 210,
    heightMm: 297,
    widthPoints: 595.28,
    heightPoints: 841.89,
    description: 'Standard document paper (210 x 297 mm)'
  },
  LEGAL: {
    name: 'Legal',
    widthMm: 216,
    heightMm: 356,
    widthPoints: 612.0,
    heightPoints: 1008.0,
    description: 'Affidavit & stamp paper (8.5 x 14 in)'
  },
  LETTER: {
    name: 'Letter',
    widthMm: 216,
    heightMm: 279,
    widthPoints: 612.0,
    heightPoints: 792.0,
    description: 'Letter size (8.5 x 11 in)'
  },
  PHOTO_4X6: {
    name: '4x6 Inch Photo',
    widthMm: 101.6,
    heightMm: 152.4,
    widthPoints: 288.0,
    heightPoints: 432.0,
    description: 'Glossy photo paper (4 x 6 in)'
  }
});

/**
 * Passport Photo Studio Presets
 */
export const PASSPORT_PRESETS = Object.freeze({
  INDIAN_STANDARD: {
    id: 'in-std',
    name: 'Indian Passport / Visa / PAN',
    widthMm: 35,
    heightMm: 45,
    aspectRatio: 35 / 45,
    description: '35 x 45 mm (Standard government photo size)'
  },
  US_VISA: {
    id: 'us-visa',
    name: 'US Visa / Foreign Passport (2x2")',
    widthMm: 50.8,
    heightMm: 50.8,
    aspectRatio: 1,
    description: '2 x 2 inches (51 x 51 mm square)'
  },
  STAMP_SIZE: {
    id: 'stamp',
    name: 'Stamp Size / Driving License',
    widthMm: 25,
    heightMm: 30,
    aspectRatio: 25 / 30,
    description: '25 x 30 mm (School / College / DL)'
  },
  CUSTOM: {
    id: 'custom',
    name: 'Custom Dimensions',
    widthMm: 35,
    heightMm: 45,
    aspectRatio: 35 / 45,
    description: 'Shopkeeper adjustable custom dimensions'
  }
});

/**
 * System limits and token configurations
 */
export const SYSTEM_LIMITS = Object.freeze({
  MAX_UPLOAD_SIZE_BYTES: 100 * 1024 * 1024, // 100 MB
  DEFAULT_SESSION_TIMEOUT_MINUTES: 30,
  SIGNED_DOWNLOAD_URL_TTL_SECONDS: 300, // 5 minutes validity for print agent download tokens
  MAX_PRINT_RETRIES: 3,
  AGENT_POLL_INTERVAL_MS: 3000, // 3 seconds heartbeat / polling
  MAX_CASH_PIN_ATTEMPTS: 5,
  CASH_PIN_LOCKOUT_MINUTES: 15
});

/**
 * Owner details and platform metadata
 */
export const PLATFORM_INFO = Object.freeze({
  NAME: 'AURA Print Pro',
  VERSION: '1.0.0',
  OWNER: 'Sabir Ansari',
  SUPPORT_EMAIL: 'support@auraprintpro.in',
  DEFAULT_CURRENCY: 'INR',
  DEFAULT_TIMEZONE: 'Asia/Kolkata'
});

// CommonJS support for Netlify functions and Jest runner
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUBSCRIPTION_TIERS,
    PAPER_SIZES,
    PASSPORT_PRESETS,
    SYSTEM_LIMITS,
    PLATFORM_INFO
  };
}
