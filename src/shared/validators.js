/**
 * AURA PRINT PRO — INPUT & DOCUMENT VALIDATORS
 * Owner: Sabir Ansari
 * 
 * Provides parsing and validation for:
 * - Document page ranges (e.g., "1-3, 5, 8-10")
 * - File constraints (MIME types, 100MB limit)
 * - UPI Virtual Payment Address (VPA) syntax
 * - Shop and order identifier formatting
 */

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 Megabytes

export const ALLOWED_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png'
]);

export const ALLOWED_EXTENSIONS = Object.freeze([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png'
]);

/**
 * Validates whether a file matches allowed MIME types, extension, and file size.
 * 
 * @param {Object} file - File metadata or browser File object
 * @param {string} file.name - Original file name
 * @param {number} file.size - Size in bytes
 * @param {string} [file.type] - MIME type
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateUploadFile(file) {
  if (!file || typeof file !== 'object') {
    return { isValid: false, error: 'No file provided or invalid file descriptor.' };
  }

  if (typeof file.size !== 'number' || file.size <= 0) {
    return { isValid: false, error: 'File is empty or corrupted (0 bytes).' };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      error: `File size (${sizeInMb} MB) exceeds maximum allowed limit of 100 MB.`
    };
  }

  const fileName = (file.name || '').toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));

  if (!hasValidExt) {
    return {
      isValid: false,
      error: 'Unsupported file format. Only PDF, JPG, JPEG, and PNG files are accepted.'
    };
  }

  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return {
      isValid: false,
      error: `Disallowed MIME type: ${file.type}. Please upload a standard PDF or Image.`
    };
  }

  return { isValid: true };
}

/**
 * Parses and validates arbitrary page range expressions against a total document page count.
 * 
 * Examples:
 *  - "all" or "" -> returns array [1, 2, ..., totalPages]
 *  - "1-3, 5, 8-9" -> returns [1, 2, 3, 5, 8, 9] (deduplicated and strictly sorted)
 * 
 * @param {string} rangeStr - User input page range string
 * @param {number} totalPages - Total physical pages detected in the uploaded PDF
 * @returns {{ isValid: boolean, pages: number[], error?: string }}
 */
export function parseAndValidatePageRange(rangeStr, totalPages) {
  const total = parseInt(totalPages, 10);
  if (isNaN(total) || total <= 0) {
    return { isValid: false, pages: [], error: 'Document total page count must be greater than 0.' };
  }

  // Blank or "all" selects every page
  const trimmed = (rangeStr || '').trim().toLowerCase();
  if (!trimmed || trimmed === 'all') {
    const allPages = Array.from({ length: total }, (_, i) => i + 1);
    return { isValid: true, pages: allPages };
  }

  // Disallow characters other than numbers, commas, dashes, and whitespace
  const sanitizedPattern = /^[0-9,\s-]+$/;
  if (!sanitizedPattern.test(trimmed)) {
    return {
      isValid: false,
      pages: [],
      error: 'Invalid characters in page range. Use only numbers, hyphens (-), and commas (,).'
    };
  }

  const tokens = trimmed.split(',').map(t => t.trim()).filter(Boolean);
  if (tokens.length === 0) {
    return { isValid: false, pages: [], error: 'Page range cannot be empty.' };
  }

  const selectedSet = new Set();

  for (const token of tokens) {
    if (token.includes('-')) {
      const parts = token.split('-').map(p => p.trim());
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return { isValid: false, pages: [], error: `Invalid range format: "${token}".` };
      }

      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);

      if (isNaN(start) || isNaN(end)) {
        return { isValid: false, pages: [], error: `Non-numeric values in range: "${token}".` };
      }

      if (start > end) {
        return {
          isValid: false,
          pages: [],
          error: `Start page (${start}) cannot be greater than end page (${end}) in range "${token}".`
        };
      }

      if (start < 1) {
        return { isValid: false, pages: [], error: `Page numbers must start at 1. Found: ${start}.` };
      }

      if (end > total) {
        return {
          isValid: false,
          pages: [],
          error: `Page ${end} exceeds total document pages (${total}).`
        };
      }

      for (let p = start; p <= end; p++) {
        selectedSet.add(p);
      }
    } else {
      const singlePage = parseInt(token, 10);
      if (isNaN(singlePage)) {
        return { isValid: false, pages: [], error: `Invalid page number: "${token}".` };
      }

      if (singlePage < 1) {
        return { isValid: false, pages: [], error: `Page numbers must start at 1. Found: ${singlePage}.` };
      }

      if (singlePage > total) {
        return {
          isValid: false,
          pages: [],
          error: `Page ${singlePage} exceeds total document pages (${total}).`
        };
      }

      selectedSet.add(singlePage);
    }
  }

  const sortedPages = Array.from(selectedSet).sort((a, b) => a - b);

  if (sortedPages.length === 0) {
    return { isValid: false, pages: [], error: 'No valid pages selected.' };
  }

  return { isValid: true, pages: sortedPages };
}

/**
 * Validates Indian UPI Virtual Payment Address (VPA).
 * Must follow the standard syntax: username@bankname or mobile@psp
 * 
 * @param {string} upiId
 * @returns {boolean}
 */
export function isValidUpiId(upiId) {
  if (!upiId || typeof upiId !== 'string') return false;
  const trimmed = upiId.trim();
  // Standard NPCI UPI identifier regex
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  return upiRegex.test(trimmed);
}

/**
 * Validates Shop Slug/ID format (alphanumeric, lowercase, hyphens, 3-32 chars)
 * @param {string} shopId
 * @returns {boolean}
 */
export function isValidShopId(shopId) {
  if (!shopId || typeof shopId !== 'string') return false;
  const regex = /^[a-z0-9-]{3,32}$/;
  return regex.test(shopId.trim());
}

/**
 * Validates operator cash verification 4 to 6-digit PIN format
 * @param {string} pin
 * @returns {boolean}
 */
export function isValidCashPin(pin) {
  if (!pin || typeof pin !== 'string') return false;
  return /^[0-9]{4,6}$/.test(pin.trim());
}

// CommonJS support for Netlify functions and Jest runner
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAX_FILE_SIZE_BYTES,
    ALLOWED_MIME_TYPES,
    ALLOWED_EXTENSIONS,
    validateUploadFile,
    parseAndValidatePageRange,
    isValidUpiId,
    isValidShopId,
    isValidCashPin
  };
}
