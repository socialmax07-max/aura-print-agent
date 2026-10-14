/**
 * AURA PRINT PRO — UPI DEEP LINK & QR STRING GENERATOR
 * Owner: Sabir Ansari
 * 
 * NPCI UPI Unified Payment Interface Specification Standard:
 * Format: upi://pay?pa={VPA}&pn={NAME}&am={AMOUNT}&cu=INR&tn={NOTE}&tr={TXN_REF}
 * 
 * Rules:
 * 1. pa (Payee Address / UPI ID) is mandatory and must match NPCI VPA syntax.
 * 2. pn (Payee Name) must be URL-encoded, representing the shopkeeper name.
 * 3. am (Transaction Amount) must be strictly positive and formatted to 2 decimal places.
 * 4. cu (Currency) is fixed to "INR".
 * 5. tn (Transaction Note) carries the order identifier for easy matching in shop bank statements.
 * 6. tr (Transaction Reference) uniquely anchors the order ID.
 */

// If running in CommonJS, require isValidUpiId; in browser, it will be imported via ES modules
let isValidUpiIdFunc;
if (typeof require !== 'undefined') {
  const validators = require('./validators.js');
  isValidUpiIdFunc = validators.isValidUpiId;
} else if (typeof window !== 'undefined' && window.AuraValidators) {
  isValidUpiIdFunc = window.AuraValidators.isValidUpiId;
} else {
  isValidUpiIdFunc = (upiId) => /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test((upiId || '').trim());
}

/**
 * Builds a standardized NPCI UPI payment deep link string.
 * 
 * @param {Object} options
 * @param {string} options.payeeUpiId - Shopkeeper UPI VPA (e.g. "sabirprint@okaxis")
 * @param {string} options.payeeName - Registered shop name (e.g. "Aura Cyber Cafe")
 * @param {number} options.amount - Verified exact order total in INR (e.g. 12.00)
 * @param {string} options.orderId - Unique order code (e.g. "ORD-94821")
 * @param {string} [options.shopId] - Unique shop slug
 * @returns {string} Fully formed upi:// URI
 */
export function generateUpiUri({
  payeeUpiId,
  payeeName,
  amount,
  orderId,
  shopId = ''
}) {
  if (!payeeUpiId || !isValidUpiIdFunc(payeeUpiId)) {
    throw new Error(`Invalid payee UPI ID format: "${payeeUpiId}". Must be user@bank.`);
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error(`Invalid transaction amount: ${amount}. Amount must be greater than ₹0.`);
  }

  // NPCI requires standard 2 decimal places (e.g., 6.00, 12.50)
  const formattedAmount = numAmount.toFixed(2);

  // Clean payee name (alphanumeric, spaces, max 50 chars)
  const cleanName = (payeeName || 'AURA PRINT PRO')
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .substring(0, 50);

  // Clean order identifier
  const cleanOrderId = (orderId || '').trim();
  if (!cleanOrderId) {
    throw new Error('Order ID is required to generate a payment request.');
  }

  // Transaction note format: e.g., "Print Order ORD-94821"
  const note = `Print ${cleanOrderId}`.substring(0, 80);

  const queryParams = new URLSearchParams({
    pa: payeeUpiId.trim(),
    pn: cleanName,
    am: formattedAmount,
    cu: 'INR',
    tn: note,
    tr: cleanOrderId
  });

  return `upi://pay?${queryParams.toString()}`;
}

/**
 * Generates an SVG/Canvas compatible QR render payload.
 * Also provides an encoded image fallback URL if offline client QR generator is initializing.
 * 
 * @param {Object} options Same parameters as generateUpiUri
 * @returns {{ uri: string, formattedAmount: string, cleanOrderId: string, fallbackQrUrl: string }}
 */
export function generateUpiPayload(options) {
  const uri = generateUpiUri(options);
  const numAmount = parseFloat(options.amount).toFixed(2);
  const cleanOrderId = (options.orderId || '').trim();

  // Encoded URL for instant preview rendering via high-resolution dynamic QR endpoint
  const encodedUri = encodeURIComponent(uri);
  const fallbackQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedUri}&margin=10`;

  return Object.freeze({
    uri,
    formattedAmount: numAmount,
    cleanOrderId,
    fallbackQrUrl,
    payeeUpiId: options.payeeUpiId.trim(),
    payeeName: options.payeeName.trim()
  });
}

/**
 * Parses and verifies an incoming UPI URI string.
 * @param {string} upiUri 
 * @returns {Object|null}
 */
export function parseUpiUri(upiUri) {
  if (!upiUri || !upiUri.startsWith('upi://pay?')) {
    return null;
  }

  try {
    const rawQuery = upiUri.replace('upi://pay?', '');
    const params = new URLSearchParams(rawQuery);

    return {
      payeeUpiId: params.get('pa'),
      payeeName: params.get('pn'),
      amount: params.get('am') ? parseFloat(params.get('am')) : null,
      currency: params.get('cu'),
      note: params.get('tn'),
      referenceId: params.get('tr')
    };
  } catch {
    return null;
  }
}

// CommonJS support for Netlify functions and Jest runner
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateUpiUri,
    generateUpiPayload,
    parseUpiUri
  };
}
