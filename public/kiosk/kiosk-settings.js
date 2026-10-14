/**
 * AURA PRINT PRO — CUSTOMER KIOSK PRINT SETTINGS & QUOTE CONTROLLER
 * Owner: Sabir Ansari
 * 
 * Features:
 * - Real-time state management for customer print options
 * - Dynamic page range parsing & boundary validation
 * - Instant price recalculation via canonical pricing-engine.js
 * - Rate label synchronization based on shop custom rates
 * - Generates immutable quote snapshot payload for server authorization
 */

import { calculatePrintQuote } from '/src/shared/pricing-engine.js';
import { parseAndValidatePageRange } from '/src/shared/validators.js';
import { formatINR } from '/src/shared/formatters.js';

export class KioskSettingsManager {
  /**
   * @param {Object} options
   * @param {HTMLFormElement} options.formElement
   * @param {Object} options.domElements - References to interactive controls & displays
   * @param {Function} options.onQuoteUpdated - Callback invoked whenever quote recalculates
   * @param {Function} options.onPageSelectionChanged - Callback when selected pages change
   */
  constructor({
    formElement,
    domElements,
    onQuoteUpdated = () => {},
    onPageSelectionChanged = () => {}
  }) {
    this.form = formElement;
    this.dom = domElements;
    this.onQuoteUpdated = onQuoteUpdated;
    this.onPageSelectionChanged = onPageSelectionChanged;

    // Document state
    this.documentModel = null;
    this.totalPages = 1;

    // Active Shop Rates (defaults with optional shop overrides)
    this.shopRates = {
      bwSingle: 2,
      bwDuplex: 3,
      colorSingle: 10,
      colorDuplex: 16
    };

    // Current print configuration state
    this.state = {
      pageMode: 'ALL', // 'ALL' or 'CUSTOM'
      pageRangeInput: '',
      selectedPagesList: [1],
      selectedPagesCount: 1,
      isColor: false,
      isDuplex: false,
      copies: 1,
      paperSize: 'A4'
    };

    // Current quote output snapshot
    this.currentQuote = null;

    this.bindEvents();
  }

  /**
   * Attaches event listeners to form controls
   */
  bindEvents() {
    // Page Selection Mode Radios
    const pageModeRadios = this.form.querySelectorAll('input[name="pageSelectionMode"]');
    pageModeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.state.pageMode = e.target.value;
        if (this.state.pageMode === 'CUSTOM') {
          this.dom.customRangeBox.classList.remove('hidden');
          this.dom.pageRangeInput.focus();
        } else {
          this.dom.customRangeBox.classList.add('hidden');
          this.dom.pageRangeError.classList.add('hidden');
        }
        this.recalculate();
      });
    });

    // Custom Page Range Input (debounced text input)
    let rangeDebounceTimer = null;
    this.dom.pageRangeInput.addEventListener('input', (e) => {
      clearTimeout(rangeDebounceTimer);
      rangeDebounceTimer = setTimeout(() => {
        this.state.pageRangeInput = e.target.value;
        this.recalculate();
      }, 300);
    });

    // Print Color Radios (B&W vs Colour)
    const colorRadios = this.form.querySelectorAll('input[name="printColor"]');
    colorRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.state.isColor = e.target.value === 'COLOR';
        this.recalculate();
      });
    });

    // Duplex Radios (Single vs Duplex)
    const duplexRadios = this.form.querySelectorAll('input[name="printDuplex"]');
    duplexRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.state.isDuplex = e.target.value === 'DUPLEX';
        this.recalculate();
      });
    });

    // Copies Counter Stepper
    this.dom.btnMinusCopy.addEventListener('click', () => {
      if (this.state.copies > 1) {
        this.state.copies--;
        this.dom.copyCountInput.value = this.state.copies;
        this.recalculate();
      }
    });

    this.dom.btnPlusCopy.addEventListener('click', () => {
      if (this.state.copies < 100) {
        this.state.copies++;
        this.dom.copyCountInput.value = this.state.copies;
        this.recalculate();
      }
    });

    // Paper Size Select
    this.dom.paperSizeSelect.addEventListener('change', (e) => {
      this.state.paperSize = e.target.value;
      this.recalculate();
    });
  }

  /**
   * Sets shop custom rates and updates rate labels in UI
   * @param {Object} rates 
   */
  setShopRates(rates) {
    if (!rates) return;
    this.shopRates = {
      bwSingle: Number(rates.bwSingle ?? this.shopRates.bwSingle),
      bwDuplex: Number(rates.bwDuplex ?? this.shopRates.bwDuplex),
      colorSingle: Number(rates.colorSingle ?? this.shopRates.colorSingle),
      colorDuplex: Number(rates.colorDuplex ?? this.shopRates.colorDuplex)
    };

    if (this.dom.bwRateLabel) {
      this.dom.bwRateLabel.textContent = `₹${this.shopRates.bwSingle} (1 तरफ) / ₹${this.shopRates.bwDuplex} (2 तरफ)`;
    }
    if (this.dom.colorRateLabel) {
      this.dom.colorRateLabel.textContent = `₹${this.shopRates.colorSingle} (1 तरफ) / ₹${this.shopRates.colorDuplex} (2 तरफ)`;
    }

    if (this.documentModel) {
      this.recalculate();
    }
  }

  /**
   * Initializes settings when a new document is uploaded
   * @param {Object} docModel 
   */
  setDocument(docModel) {
    this.documentModel = docModel;
    this.totalPages = docModel.totalPages || 1;

    // Reset default selections
    this.state.copies = 1;
    this.dom.copyCountInput.value = '1';
    this.state.pageMode = 'ALL';
    this.state.pageRangeInput = '';
    this.dom.pageRangeInput.value = '';
    this.dom.customRangeBox.classList.add('hidden');
    this.dom.pageRangeError.classList.add('hidden');

    const firstModeRadio = this.form.querySelector('input[name="pageSelectionMode"][value="ALL"]');
    if (firstModeRadio) firstModeRadio.checked = true;

    // If document is image, disable custom page range and duplex
    const isImage = docModel.fileType === 'IMAGE';
    const customModeRadio = this.form.querySelector('input[name="pageSelectionMode"][value="CUSTOM"]');
    if (customModeRadio) {
      customModeRadio.disabled = isImage;
    }

    const duplexRadio = this.form.querySelector('input[name="printDuplex"][value="DUPLEX"]');
    if (duplexRadio) {
      duplexRadio.disabled = isImage;
      if (isImage) {
        const singleRadio = this.form.querySelector('input[name="printDuplex"][value="SINGLE"]');
        if (singleRadio) singleRadio.checked = true;
        this.state.isDuplex = false;
      }
    }

    this.recalculate();
  }

  /**
   * Validates inputs, calculates quote using pricing engine, and updates UI
   * @returns {boolean} Whether calculation succeeded without errors
   */
  recalculate() {
    if (!this.documentModel) return false;

    // 1. Resolve selected pages
    let selectedPagesArray = [];
    if (this.state.pageMode === 'ALL') {
      selectedPagesArray = Array.from({ length: this.totalPages }, (_, i) => i + 1);
      this.dom.pageRangeError.classList.add('hidden');
    } else {
      const rangeValidation = parseAndValidatePageRange(this.state.pageRangeInput, this.totalPages);
      if (!rangeValidation.isValid) {
        this.dom.pageRangeError.textContent = rangeValidation.error;
        this.dom.pageRangeError.classList.remove('hidden');
        return false;
      }
      this.dom.pageRangeError.classList.add('hidden');
      selectedPagesArray = rangeValidation.pages;
    }

    this.state.selectedPagesList = selectedPagesArray;
    this.state.selectedPagesCount = selectedPagesArray.length;

    // 2. Authoritative quote calculation
    try {
      this.currentQuote = calculatePrintQuote({
        selectedPages: this.state.selectedPagesCount,
        copies: this.state.copies,
        isColor: this.state.isColor,
        isDuplex: this.state.isDuplex,
        customRates: this.shopRates
      });
    } catch (err) {
      console.error('[KioskSettings] Pricing error:', err);
      return false;
    }

    // 3. Update UI breakdown displays
    if (this.dom.quoteSelectedPages) {
      this.dom.quoteSelectedPages.textContent = `${this.state.selectedPagesCount} पृष्ठ`;
    }

    if (this.dom.quoteTotalSheets) {
      this.dom.quoteTotalSheets.textContent = `${this.currentQuote.totalPhysicalSheets} शीट`;
    }

    if (this.dom.quoteCopies) {
      this.dom.quoteCopies.textContent = `${this.state.copies}`;
    }

    if (this.dom.quoteUnitRate) {
      const rateSuffix = this.state.isDuplex ? '/शीट (Duplex)' : '/पेज';
      this.dom.quoteUnitRate.textContent = `${formatINR(this.currentQuote.unitRate)} ${rateSuffix}`;
    }

    if (this.dom.quoteGrandTotal) {
      this.dom.quoteGrandTotal.textContent = formatINR(this.currentQuote.totalAmount);
    }

    // Callbacks
    this.onQuoteUpdated(this.getQuoteSnapshot());
    this.onPageSelectionChanged(this.state.selectedPagesList);

    return true;
  }

  /**
   * Generates a frozen quote snapshot object ready for server submission
   * @returns {Object}
   */
  getQuoteSnapshot() {
    if (!this.currentQuote || !this.documentModel) return null;

    return Object.freeze({
      documentName: this.documentModel.fileName,
      documentSize: this.documentModel.fileSize,
      fileType: this.documentModel.fileType,
      totalPagesInFile: this.totalPages,
      selectedPages: this.state.selectedPagesCount,
      selectedPagesList: [...this.state.selectedPagesList],
      copies: this.state.copies,
      isColor: this.state.isColor,
      isDuplex: this.state.isDuplex,
      paperSize: this.state.paperSize,
      billingType: this.currentQuote.billingType,
      unitRate: this.currentQuote.unitRate,
      sheetsPerCopy: this.currentQuote.sheetsPerCopy,
      totalPhysicalSheets: this.currentQuote.totalPhysicalSheets,
      totalAmount: this.currentQuote.totalAmount,
      currency: 'INR',
      timestamp: Date.now()
    });
  }
}
