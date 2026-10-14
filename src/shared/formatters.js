/**
 * AURA PRINT PRO — LOCALIZATION & DATA FORMATTERS
 * Owner: Sabir Ansari
 * 
 * Implements:
 * - Indian Rupee (INR) currency formatting with '₹' symbol
 * - Indian Standard Time (IST, UTC+5:30) timestamp and relative time formatting
 * - Human-readable binary byte size formatting (KB, MB)
 * - Print job parameter human-readable descriptions
 */

/**
 * Formats a numeric value into standard Indian Rupee notation (e.g. ₹1,250.00 or ₹6.00).
 * 
 * @param {number|string} amount - Monetary amount in INR
 * @param {boolean} [includeSymbol=true] - Whether to prepend the ₹ symbol
 * @returns {string} Formatted currency string
 */
export function formatINR(amount, includeSymbol = true) {
  const numericValue = Number(amount);
  if (isNaN(numericValue)) {
    return includeSymbol ? '₹0.00' : '0.00';
  }

  // Uses en-IN locale for Indian numbering system (Lakhs and Crores grouping)
  const formattedNumber = numericValue.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return includeSymbol ? `₹${formattedNumber}` : formattedNumber;
}

/**
 * Formats file size in bytes into human-readable metric strings (B, KB, MB, GB).
 * 
 * @param {number} bytes - Size in bytes
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {string} e.g. "4.25 MB"
 */
export function formatBytes(bytes, decimals = 2) {
  const numBytes = Number(bytes);
  if (isNaN(numBytes) || numBytes <= 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  const normalizedIndex = Math.min(i, sizes.length - 1);
  const value = parseFloat((numBytes / Math.pow(k, normalizedIndex)).toFixed(dm));

  return `${value} ${sizes[normalizedIndex]}`;
}

/**
 * Formats a Date or UTC timestamp into Indian Standard Time (IST).
 * Returns e.g. "13 Oct 2026, 05:30 PM IST".
 * 
 * @param {Date|string|number} dateInput - Timestamp, Date object or ISO string
 * @param {Object} [options]
 * @param {boolean} [options.includeTime=true]
 * @param {boolean} [options.includeSeconds=false]
 * @returns {string}
 */
export function formatIST(dateInput, options = {}) {
  if (!dateInput) return '—';

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Invalid Date';

  const includeTime = options.includeTime !== false;
  const includeSeconds = Boolean(options.includeSeconds);

  const formatterOptions = {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  };

  if (includeTime) {
    formatterOptions.hour = '2-digit';
    formatterOptions.minute = '2-digit';
    formatterOptions.hour12 = true;
    if (includeSeconds) {
      formatterOptions.second = '2-digit';
    }
  }

  return new Intl.DateTimeFormat('en-IN', formatterOptions).format(date);
}

/**
 * Generates relative elapsed time string (e.g. "Just now", "2 min ago", "1 hr ago").
 * Ideal for real-time operator incoming queues.
 * 
 * @param {Date|string|number} dateInput
 * @returns {string}
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return '—';

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';

  const elapsedSeconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (elapsedSeconds < 30) return 'Just now';
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

/**
 * Builds a clean summary badge text describing a print order configuration.
 * e.g., "5 Pages • 2 Copies • B&W Duplex (6 Sheets)"
 * 
 * @param {Object} order - Order print options
 * @returns {string}
 */
export function formatOrderSummary(order) {
  if (!order) return '';

  const pages = order.selectedPages || 1;
  const copies = order.copies || 1;
  const colorType = order.isColor ? 'Colour' : 'B&W';
  const duplexType = order.isDuplex ? 'Duplex' : 'Single-sided';
  const sheets = order.totalPhysicalSheets || pages;

  return `${pages} Page${pages > 1 ? 's' : ''} • ${copies} Cop${copies > 1 ? 'ies' : 'y'} • ${colorType} ${duplexType} (${sheets} Sheet${sheets > 1 ? 's' : ''})`;
}

/**
 * Masks a UPI VPA for customer receipt privacy while keeping bank visible.
 * e.g., "sabirprint@okaxis" -> "sa***t@okaxis"
 * 
 * @param {string} upiId 
 * @returns {string}
 */
export function maskUpiId(upiId) {
  if (!upiId || !upiId.includes('@')) return upiId || '';
  const [handle, psp] = upiId.split('@');
  if (handle.length <= 3) {
    return `${handle[0]}*@${psp}`;
  }
  const prefix = handle.substring(0, 2);
  const suffix = handle.slice(-1);
  return `${prefix}${'*'.repeat(handle.length - 3)}${suffix}@${psp}`;
}

// CommonJS support for Netlify functions and Jest runner
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatINR,
    formatBytes,
    formatIST,
    formatRelativeTime,
    formatOrderSummary,
    maskUpiId
  };
}
