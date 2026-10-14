/**
 * AURA PRINT PRO — MASTER CUSTOMER KIOSK APPLICATION CONTROLLER
 * Owner: Sabir Ansari
 * 
 * Orchestrates:
 * 1. Shop profile resolution from URL parameters (?shop=...)
 * 2. Step 1: KioskUploadHandler integration & document parsing
 * 3. Step 2: KioskPreviewManager & KioskSettingsManager synchronization
 * 4. Step 3: KioskPaymentManager, dynamic order ID assignment, and backend submission
 * 5. Visual stepper progress bar transitions & back-navigation state management
 */

import { KioskUploadHandler } from './kiosk-upload.js';
import { KioskPreviewManager } from './kiosk-preview.js';
import { KioskSettingsManager } from './kiosk-settings.js';
import { KioskPaymentManager } from './kiosk-payment.js';
import { generateOrderId } from '/src/shared/crypto-utils.js';
import { formatBytes } from '/src/shared/formatters.js';

class KioskApplication {
  constructor() {
    this.shopId = this.extractShopIdFromUrl();
    this.shopData = null;
    this.currentStep = 1;

    // Active order payload components
    this.activeDocumentModel = null;
    this.activeQuoteSnapshot = null;
    this.activeTransformSnapshot = null;
    this.activeOrderId = null;

    // Component instances
    this.uploadHandler = null;
    this.previewManager = null;
    this.settingsManager = null;
    this.paymentManager = null;

    this.init();
  }

  /**
   * Reads and sanitizes shop identifier from query string or pathname.
   * e.g., /kiosk.html?shop=delhi-cyber-hub OR /k/delhi-cyber-hub
   */
  extractShopIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    let shop = urlParams.get('shop');

    if (!shop) {
      // Check path segment for clean route: /k/:shopId
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2 && pathParts[0] === 'k') {
        shop = pathParts[1];
      }
    }

    return (shop || 'demo').trim().toLowerCase();
  }

  async init() {
    this.bindGlobalNavigation();
    await this.loadShopProfile();
    this.initializeSubmodules();
  }

  /**
   * Fetches registered shop profile, rates, and UPI VPA from backend Netlify Function.
   */
  async loadShopProfile() {
    const shopNameElem = document.getElementById('shopNameDisplay');
    const shopCodeElem = document.getElementById('shopCodeDisplay');

    try {
      const response = await fetch(`/api/create-order?action=getShop&shopId=${encodeURIComponent(this.shopId)}`);
      
      if (response.ok) {
        const data = await response.json();
        this.shopData = data.shop;
      } else {
        // Fallback demo shop profile if backend is initializing or in local offline mode
        this.shopData = {
          shopId: this.shopId,
          shopName: this.shopId === 'demo' ? 'AURA Demo CSC Centre' : `Shop ${this.shopId.toUpperCase()}`,
          upiId: 'sabirprint@okaxis',
          isActive: true,
          rates: {
            bwSingle: 2,
            bwDuplex: 3,
            colorSingle: 10,
            colorDuplex: 16
          }
        };
      }
    } catch {
      // Offline / Network fallback
      this.shopData = {
        shopId: this.shopId,
        shopName: 'AURA Print Pro Kiosk',
        upiId: 'sabirprint@okaxis',
        isActive: true,
        rates: {
          bwSingle: 2,
          bwDuplex: 3,
          colorSingle: 10,
          colorDuplex: 16
        }
      };
    }

    if (shopNameElem) shopNameElem.textContent = this.shopData.shopName;
    if (shopCodeElem) shopCodeElem.textContent = this.shopData.shopId;
  }

  /**
   * Initializes all modular controllers and wires their inter-communication callbacks.
   */
  initializeSubmodules() {
    // 1. Upload Controller
    this.uploadHandler = new KioskUploadHandler({
      dropZoneElement: document.getElementById('uploadDropZone'),
      fileInputElement: document.getElementById('kioskFileInput'),
      processingElement: document.getElementById('uploadProcessingState'),
      processingMsgElement: document.getElementById('uploadProcessingMsg'),
      onFileValidated: (docModel) => this.handleFileSuccessfullyValidated(docModel),
      onError: (errorMsg) => this.showGlobalAlert(errorMsg)
    });

    // 2. Preview Canvas Controller
    this.previewManager = new KioskPreviewManager({
      canvasElement: document.getElementById('docCanvas'),
      viewportElement: document.getElementById('previewViewport'),
      pageCounterElement: document.getElementById('pageCounterText'),
      btnPrev: document.getElementById('btnPrevPage'),
      btnNext: document.getElementById('btnNextPage'),
      btnZoomIn: document.getElementById('btnZoomIn'),
      btnZoomOut: document.getElementById('btnZoomOut'),
      btnZoomFit: document.getElementById('btnZoomFit'),
      imageControlsOverlay: document.getElementById('imageTransformControls'),
      btnImgRotate: document.getElementById('btnImgRotate'),
      btnImgReset: document.getElementById('btnImgReset'),
      onTransformChange: (transform) => {
        this.activeTransformSnapshot = transform;
      }
    });

    // 3. Settings & Quote Engine Controller
    this.settingsManager = new KioskSettingsManager({
      formElement: document.getElementById('printSettingsForm'),
      domElements: {
        customRangeBox: document.getElementById('customPageRangeBox'),
        pageRangeInput: document.getElementById('pageRangeInput'),
        pageRangeError: document.getElementById('pageRangeError'),
        btnMinusCopy: document.getElementById('btnMinusCopy'),
        btnPlusCopy: document.getElementById('btnPlusCopy'),
        copyCountInput: document.getElementById('copyCountInput'),
        paperSizeSelect: document.getElementById('paperSizeSelect'),
        bwRateLabel: document.getElementById('bwRateLabel'),
        colorRateLabel: document.getElementById('colorRateLabel'),
        quoteSelectedPages: document.getElementById('quoteSelectedPages'),
        quoteTotalSheets: document.getElementById('quoteTotalSheets'),
        quoteCopies: document.getElementById('quoteCopies'),
        quoteUnitRate: document.getElementById('quoteUnitRate'),
        quoteGrandTotal: document.getElementById('quoteGrandTotal')
      },
      onQuoteUpdated: (quoteSnapshot) => {
        this.activeQuoteSnapshot = quoteSnapshot;
      },
      onPageSelectionChanged: (selectedPagesList) => {
        // If viewing a page that is not in the custom selection, auto-navigate to the first selected page
        if (selectedPagesList.length > 0 && !selectedPagesList.includes(this.previewManager.currentPage)) {
          this.previewManager.goToPage(selectedPagesList[0]);
        }
      }
    });

    // Feed shop rates into settings manager
    if (this.shopData?.rates) {
      this.settingsManager.setShopRates(this.shopData.rates);
    }

    // 4. Payment Controller
    this.paymentManager = new KioskPaymentManager({
      domElements: {
        displayOrderId: document.getElementById('displayOrderId'),
        displayPaymentAmount: document.getElementById('displayPaymentAmount'),
        tabUpiBtn: document.getElementById('tabUpiBtn'),
        tabCashBtn: document.getElementById('tabCashBtn'),
        paymentViewUpi: document.getElementById('paymentViewUpi'),
        paymentViewCash: document.getElementById('paymentViewCash'),
        upiAmountHighlight: document.getElementById('upiAmountHighlight'),
        qrLoadingSpinner: document.getElementById('qrLoadingSpinner'),
        upiQrImage: document.getElementById('upiQrImage'),
        displayShopUpiId: document.getElementById('displayShopUpiId'),
        btnCopyUpi: document.getElementById('btnCopyUpi'),
        upiIntentAnchor: document.getElementById('upiIntentAnchor'),
        btnConfirmUpiPaid: document.getElementById('btnConfirmUpiPaid'),
        cashOrderIdDisplay: document.getElementById('cashOrderIdDisplay'),
        cashAmountDisplay: document.getElementById('cashAmountDisplay'),
        btnSelectCashOrder: document.getElementById('btnSelectCashOrder'),
        orderStatusTracker: document.getElementById('orderStatusTracker'),
        orderStatusBadge: document.getElementById('orderStatusBadge'),
        trackerStatusIcon: document.getElementById('trackerStatusIcon'),
        trackerStatusTitle: document.getElementById('trackerStatusTitle'),
        trackerStatusDesc: document.getElementById('trackerStatusDesc')
      },
      onRequestOrderSubmission: async (paymentDetails) => {
        return await this.submitOrderToBackend(paymentDetails);
      },
      onStatusChange: (status) => {
        console.log(`[KioskApp] Order state updated to: ${status}`);
      }
    });
  }

  bindGlobalNavigation() {
    // Back button in Step 2: returns to Step 1 (Upload)
    const btnBack = document.getElementById('btnBackToUpload');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        this.goToStep(1);
      });
    }

    // Proceed to Payment button in Step 2
    const btnProceed = document.getElementById('btnProceedToPayment');
    if (btnProceed) {
      btnProceed.addEventListener('click', () => {
        this.proceedToPaymentStep();
      });
    }
  }

  /**
   * Invoked when upload handler verifies file integrity and page counts.
   * Advances wizard to Step 2.
   * @param {Object} docModel 
   */
  async handleFileSuccessfullyValidated(docModel) {
    this.clearGlobalAlert();
    this.activeDocumentModel = docModel;

    // Update File Summary Bar in Step 2
    const fileNameEl = document.getElementById('previewFileName');
    const fileSizeEl = document.getElementById('previewFileSize');
    const pageBadgeEl = document.getElementById('previewPageCountBadge');

    if (fileNameEl) fileNameEl.textContent = docModel.fileName;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(docModel.fileSize);
    if (pageBadgeEl) {
      pageBadgeEl.textContent = `${docModel.totalPages} ${docModel.totalPages === 1 ? 'कुल पेज' : 'कुल पेज'}`;
    }

    // Load into preview canvas and configure settings
    await this.previewManager.loadDocument(docModel);
    this.settingsManager.setDocument(docModel);

    // Advance to Step 2
    this.goToStep(2);
  }

  /**
   * Transitions from Step 2 to Step 3 after validating quote snapshot.
   */
  proceedToPaymentStep() {
    this.clearGlobalAlert();

    // Enforce recalculation verification
    const isValidQuote = this.settingsManager.recalculate();
    if (!isValidQuote || !this.activeQuoteSnapshot) {
      this.showGlobalAlert('कृपया प्रिंट सेटिंग्स की जांच करें। कुछ फ़ील्ड्स में त्रुटि है।');
      return;
    }

    if (this.activeQuoteSnapshot.totalAmount <= 0) {
      this.showGlobalAlert('अमान्य राशि (Invalid total amount). कृपया पेज और प्रतियां चेक करें।');
      return;
    }

    // Generate unique order ID for counter and bank matching
    this.activeOrderId = generateOrderId();

    // Capture final transform snapshot
    this.activeTransformSnapshot = this.previewManager.getTransformSnapshot();

    // Handover to payment manager
    this.paymentManager.initializePayment({
      shop: this.shopData,
      quote: this.activeQuoteSnapshot,
      orderId: this.activeOrderId
    });

    this.goToStep(3);
  }

  /**
   * Manages DOM visibility and progress bar state between Step 1, 2, and 3.
   * @param {1 | 2 | 3} stepNumber 
   */
  goToStep(stepNumber) {
    this.currentStep = stepNumber;

    const v1 = document.getElementById('viewStep1');
    const v2 = document.getElementById('viewStep2');
    const v3 = document.getElementById('viewStep3');

    const ind1 = document.getElementById('stepIndicator1');
    const ind2 = document.getElementById('stepIndicator2');
    const ind3 = document.getElementById('stepIndicator3');

    const progress = document.getElementById('stepperProgressBar');

    // Hide all views
    [v1, v2, v3].forEach(view => {
      if (view) view.classList.add('hidden');
    });

    // Reset indicator classes
    [ind1, ind2, ind3].forEach(ind => {
      if (ind) {
        ind.classList.remove('active');
        ind.classList.remove('completed');
      }
    });

    if (stepNumber === 1) {
      if (v1) v1.classList.remove('hidden');
      if (ind1) ind1.classList.add('active');
      if (progress) progress.style.width = '0%';
    } else if (stepNumber === 2) {
      if (v2) v2.classList.remove('hidden');
      if (ind1) ind1.classList.add('completed');
      if (ind2) ind2.classList.add('active');
      if (progress) progress.style.width = '50%';
      // Resize fit on preview canvas
      setTimeout(() => this.previewManager.zoomFit(), 50);
    } else if (stepNumber === 3) {
      if (v3) v3.classList.remove('hidden');
      if (ind1) ind1.classList.add('completed');
      if (ind2) ind2.classList.add('completed');
      if (ind3) ind3.classList.add('active');
      if (progress) progress.style.width = '100%';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Submits the complete verified order package to Netlify serverless backend (/api/create-order).
   * 
   * @param {Object} paymentDetails
   * @param {'UPI' | 'CASH'} paymentDetails.paymentMethod
   * @param {string} paymentDetails.reportedStatus
   */
  async submitOrderToBackend({ paymentMethod, reportedStatus }) {
    if (!this.activeDocumentModel || !this.activeQuoteSnapshot || !this.activeOrderId) {
      throw new Error('Order package incomplete. Cannot submit.');
    }

    const formData = new FormData();
    formData.append('documentFile', this.activeDocumentModel.file);
    formData.append('shopId', this.shopData.shopId);
    formData.append('orderId', this.activeOrderId);
    formData.append('paymentMethod', paymentMethod);
    formData.append('reportedStatus', reportedStatus);
    formData.append('quoteSnapshot', JSON.stringify(this.activeQuoteSnapshot));
    formData.append('transformSnapshot', JSON.stringify(this.activeTransformSnapshot || {}));

    const response = await fetch('/api/create-order', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `Server responded with status ${response.status}`);
    }

    return await response.json();
  }

  showGlobalAlert(msg) {
    const alertBox = document.getElementById('kioskGlobalAlert');
    const alertText = document.getElementById('kioskGlobalAlertText');
    if (!alertBox || !alertText) return;

    if (!msg) {
      this.clearGlobalAlert();
      return;
    }

    alertText.textContent = msg;
    alertBox.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  clearGlobalAlert() {
    const alertBox = document.getElementById('kioskGlobalAlert');
    if (alertBox) alertBox.classList.add('hidden');
  }
}

// Bootstrap once DOM content is ready
document.addEventListener('DOMContentLoaded', () => {
  window.AuraKioskApp = new KioskApplication();
});
