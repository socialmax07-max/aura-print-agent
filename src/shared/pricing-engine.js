/**
 * AURA PRINT PRO — CANONICAL PRICING ENGINE
 * Owner: Sabir Ansari
 * 
 * Rules:
 *  - B&W Single-Sided: ratePerLogicalPage (Default ₹2)
 *  - B&W Duplex: ratePerPhysicalSheet (Default ₹3)
 *  - Colour Single-Sided: ratePerLogicalPage (Default ₹10)
 *  - Colour Duplex: ratePerPhysicalSheet (Default ₹16)
 * 
 * Formulas:
 *  - Single-sided total = selectedPages * copies * singleSidedRate
 *  - Duplex sheets per copy = Math.ceil(selectedPages / 2)
 *  - Duplex total = sheetsPerCopy * copies * duplexRate
 */

export const DEFAULT_RATES = Object.freeze({
  bwSingle: 2,
  bwDuplex: 3,
  colorSingle: 10,
  colorDuplex: 16,
  passportSheetA4: 50,
  passportSheet4x6: 30
});

/**
 * Calculates print quote with strict integer sheet calculations and rounding protection.
 * 
 * @param {Object} params
 * @param {number} params.selectedPages - Count of selected logical pages (e.g. 3)
 * @param {number} params.copies - Number of identical copies (e.g. 1)
 * @param {boolean} params.isColor - true for Colour, false for B&W
 * @param {boolean} params.isDuplex - true for Double-sided, false for Single-sided
 * @param {Object} [params.customRates] - Optional shopkeeper rate overrides
 * @returns {Object} Quote breakdown
 */
export function calculatePrintQuote({
  selectedPages = 1,
  copies = 1,
  isColor = false,
  isDuplex = false,
  customRates = {}
}) {
  const pages = parseInt(selectedPages, 10);
  const copyCount = parseInt(copies, 10);

  if (isNaN(pages) || pages <= 0) {
    throw new Error('Invalid selectedPages count: must be an integer greater than 0');
  }

  if (isNaN(copyCount) || copyCount <= 0) {
    throw new Error('Invalid copies count: must be an integer greater than 0');
  }

  const rates = {
    bwSingle: Number(customRates.bwSingle ?? DEFAULT_RATES.bwSingle),
    bwDuplex: Number(customRates.bwDuplex ?? DEFAULT_RATES.bwDuplex),
    colorSingle: Number(customRates.colorSingle ?? DEFAULT_RATES.colorSingle),
    colorDuplex: Number(customRates.colorDuplex ?? DEFAULT_RATES.colorDuplex)
  };

  let physicalSheetsPerCopy = 0;
  let unitRate = 0;
  let totalAmount = 0;
  let billingType = '';

  if (isDuplex) {
    // Duplex sheets = ceil(selectedPages / 2)
    physicalSheetsPerCopy = Math.ceil(pages / 2);
    unitRate = isColor ? rates.colorDuplex : rates.bwDuplex;
    billingType = isColor ? 'COLOR_DUPLEX' : 'BW_DUPLEX';
    totalAmount = physicalSheetsPerCopy * copyCount * unitRate;
  } else {
    // Single-sided: 1 logical page = 1 physical sheet
    physicalSheetsPerCopy = pages;
    unitRate = isColor ? rates.colorSingle : rates.bwSingle;
    billingType = isColor ? 'COLOR_SINGLE' : 'BW_SINGLE';
    totalAmount = pages * copyCount * unitRate;
  }

  const totalPhysicalSheets = physicalSheetsPerCopy * copyCount;

  return Object.freeze({
    selectedPages: pages,
    copies: copyCount,
    isColor: Boolean(isColor),
    isDuplex: Boolean(isDuplex),
    billingType,
    unitRate,
    sheetsPerCopy: physicalSheetsPerCopy,
    totalPhysicalSheets,
    totalAmount: Math.round(totalAmount * 100) / 100, // Safe 2-decimal representation
    currency: 'INR'
  });
}

/**
 * Validates whether an incoming quote matches server calculation.
 * Prevents client-side price tampering.
 */
export function verifyQuoteIntegrity(clientQuote, customRates = {}) {
  const calculated = calculatePrintQuote({
    selectedPages: clientQuote.selectedPages,
    copies: clientQuote.copies,
    isColor: clientQuote.isColor,
    isDuplex: clientQuote.isDuplex,
    customRates
  });

  const matches = (
    calculated.totalAmount === Number(clientQuote.totalAmount) &&
    calculated.totalPhysicalSheets === Number(clientQuote.totalPhysicalSheets) &&
    calculated.billingType === clientQuote.billingType
  );

  return {
    isValid: matches,
    expectedQuote: calculated
  };
}

// CommonJS support for Netlify functions and Jest runner
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_RATES,
    calculatePrintQuote,
    verifyQuoteIntegrity
  };
}
