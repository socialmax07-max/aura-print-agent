/**
 * AURA PRINT PRO — CUSTOMER KIOSK PAYMENT & ORDER TRACKER
 * Owner: Sabir Ansari
 * 
 * Features:
 * - Dynamic NPCI UPI QR code generation via generateUpiPayload
 * - Direct UPI intent link for Android/iOS UPI apps
 * - Copy UPI ID action with clipboard feedback
 * - Cash-at-counter order submission workflow
 * - Real-time order state polling & live visual status tracker
 * - Strict adherence to ORDER_STATES & STATE_METADATA
 */

import { generateUpiPayload } from '/src/shared/upi-generator.js';
import { formatINR } from '/src/shared/formatters.js';
import { ORDER_STATES, STATE_METADATA } from '/src/shared/order-states.js';

export class KioskPaymentManager {
  /**
   * @param {Object} options
   * @param {Object} options.domElements - References to payment UI containers & controls
   * @param {Function} options.onRequestOrderSubmission - Callback to create order in backend
   * @param {Function} options.onStatusChange - Callback on order state transition
   */
  constructor({
    domElements,
    onRequestOrderSubmission = async () => {},
    onStatusChange = () => {}
  }) {
    this.dom = domElements;
    this.onRequestOrderSubmission = onRequestOrderSubmission;
    this.onStatusChange = onStatusChange;

    // Active state
    this.activeShop = null;
    this.activeQuote = null;
    this.activeOrderId = null;
    this.currentMode = 'UPI'; // 'UPI' or 'CASH'
    this.currentState = ORDER_STATES.AWAITING_PAYMENT;
    this.pollInterval = null;
    this.isSubmitted = false;

    this.bindEvents();
  }

  bindEvents() {
    // Mode switcher buttons
    if (this.dom.tabUpiBtn) {
      this.dom.tabUpiBtn.addEventListener('click', () => this.switchMode('UPI'));
    }
    if (this.dom.tabCashBtn) {
      this.dom.tabCashBtn.addEventListener('click', () => this.switchMode('CASH'));
    }

    // Customer "I Have Paid" UPI button
    if (this.dom.btnConfirmUpiPaid) {
      this.dom.btnConfirmUpiPaid.addEventListener('click', () => this.handleCustomerReportedUpiPayment());
    }

    // Customer "Submit Cash Order" button
    if (this.dom.btnSelectCashOrder) {
      this.dom.btnSelectCashOrder.addEventListener('click', () => this.handleCustomerCashSubmission());
    }

    // Copy UPI ID button
    if (this.dom.btnCopyUpi) {
      this.dom.btnCopyUpi.addEventListener('click', () => this.copyShopUpiId());
    }
  }

  /**
   * Initializes the payment screen with confirmed shop data, quote snapshot, and generated order ID.
   * 
   * @param {Object} params
   * @param {Object} params.shop - Shopkeeper profile (shopId, shopName, upiId)
   * @param {Object} params.quote - Immutable quote snapshot from KioskSettingsManager
   * @param {string} params.orderId - Unique order code (e.g. "ORD-9H4K2M")
   */
  initializePayment({ shop, quote, orderId }) {
    this.activeShop = shop;
    this.activeQuote = quote;
    this.activeOrderId = orderId;
    this.isSubmitted = false;
    this.currentState = ORDER_STATES.AWAITING_PAYMENT;

    this.stopPolling();

    // 1. Update general banners
    if (this.dom.displayOrderId) {
      this.dom.displayOrderId.textContent = orderId;
    }
    if (this.dom.displayPaymentAmount) {
      this.dom.displayPaymentAmount.textContent = formatINR(quote.totalAmount);
    }
    if (this.dom.upiAmountHighlight) {
      this.dom.upiAmountHighlight.textContent = formatINR(quote.totalAmount);
    }
    if (this.dom.cashOrderIdDisplay) {
      this.dom.cashOrderIdDisplay.textContent = orderId;
    }
    if (this.dom.cashAmountDisplay) {
      this.dom.cashAmountDisplay.textContent = formatINR(quote.totalAmount);
    }

    // 2. Configure UPI payment details
    const shopUpi = shop.upiId || 'payment@auraprintpro';
    if (this.dom.displayShopUpiId) {
      this.dom.displayShopUpiId.textContent = shopUpi;
    }

    this.renderUpiQr(shopUpi, shop.shopName || 'AURA PRINT PRO', quote.totalAmount, orderId);

    // 3. Reset views
    this.switchMode('UPI');
    if (this.dom.orderStatusTracker) {
      this.dom.orderStatusTracker.classList.add('hidden');
    }
    if (this.dom.paymentViewUpi) {
      this.dom.paymentViewUpi.classList.remove('hidden');
    }
    if (this.dom.paymentViewCash) {
      this.dom.paymentViewCash.classList.add('hidden');
    }
  }

  /**
   * Generates NPCI QR and updates image source and mobile intent deep link.
   */
  renderUpiQr(upiId, shopName, amount, orderId) {
    if (!this.dom.upiQrImage) return;

    if (this.dom.qrLoadingSpinner) {
      this.dom.qrLoadingSpinner.classList.remove('hidden');
    }
    this.dom.upiQrImage.classList.add('hidden');

    try {
      const payload = generateUpiPayload({
        payeeUpiId: upiId,
        payeeName: shopName,
        amount,
        orderId
      });

      // Update mobile deep-link intent anchor
      if (this.dom.upiIntentAnchor) {
        this.dom.upiIntentAnchor.href = payload.uri;
      }

      // Load dynamic QR image
      this.dom.upiQrImage.onload = () => {
        if (this.dom.qrLoadingSpinner) {
          this.dom.qrLoadingSpinner.classList.add('hidden');
        }
        this.dom.upiQrImage.classList.remove('hidden');
      };

      this.dom.upiQrImage.onerror = () => {
        if (this.dom.qrLoadingSpinner) {
          this.dom.qrLoadingSpinner.classList.add('hidden');
        }
        // Fallback placeholder message
        console.warn('[KioskPayment] QR generation endpoint unreachable. Showing intent link.');
      };

      this.dom.upiQrImage.src = payload.fallbackQrUrl;
    } catch (err) {
      console.error('[KioskPayment] Failed to generate UPI payload:', err);
      if (this.dom.qrLoadingSpinner) {
        this.dom.qrLoadingSpinner.classList.add('hidden');
      }
    }
  }

  /**
   * Switches active payment mode tab between UPI and Cash.
   * @param {'UPI' | 'CASH'} mode 
   */
  switchMode(mode) {
    this.currentMode = mode;

    if (mode === 'UPI') {
      this.dom.tabUpiBtn.classList.add('active');
      this.dom.tabCashBtn.classList.remove('active');
      this.dom.paymentViewUpi.classList.remove('hidden');
      this.dom.paymentViewCash.classList.add('hidden');
    } else {
      this.dom.tabCashBtn.classList.add('active');
      this.dom.tabUpiBtn.classList.remove('active');
      this.dom.paymentViewCash.classList.remove('hidden');
      this.dom.paymentViewUpi.classList.add('hidden');
    }
  }

  /**
   * Copies shop UPI ID to clipboard with visual confirmation.
   */
  async copyShopUpiId() {
    const upiId = this.activeShop?.upiId;
    if (!upiId) return;

    try {
      await navigator.clipboard.writeText(upiId);
      const originalText = this.dom.btnCopyUpi.textContent;
      this.dom.btnCopyUpi.textContent = 'कॉपी हो गया! ✔';
      this.dom.btnCopyUpi.classList.remove('btn-secondary');
      this.dom.btnCopyUpi.classList.add('btn-success');

      setTimeout(() => {
        this.dom.btnCopyUpi.textContent = originalText;
        this.dom.btnCopyUpi.classList.remove('btn-success');
        this.dom.btnCopyUpi.classList.add('btn-secondary');
      }, 2000);
    } catch {
      // Fallback for older browsers
      const tempInput = document.createElement('input');
      tempInput.value = upiId;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }
  }

  /**
   * Customer clicks "I Have Paid" (UPI).
   * Submits the order to backend with state = PAYMENT_REVIEW and starts status polling.
   */
  async handleCustomerReportedUpiPayment() {
    if (this.isSubmitted) return;

    this.setButtonLoading(this.dom.btnConfirmUpiPaid, true, 'ऑर्डर दर्ज हो रहा है...');

    try {
      await this.onRequestOrderSubmission({
        paymentMethod: 'UPI',
        reportedStatus: ORDER_STATES.PAYMENT_REVIEW
      });

      this.isSubmitted = true;
      this.showStatusTracker(ORDER_STATES.PAYMENT_REVIEW);
      this.startPolling();
    } catch (err) {
      console.error('[KioskPayment] UPI submission error:', err);
      alert(`ऑर्डर सबमिट करने में समस्या: ${err.message || 'कृपया पुनः प्रयास करें।'}`);
    } finally {
      this.setButtonLoading(this.dom.btnConfirmUpiPaid, false, '✔ मैंने पेमेंट कर दिया (I Have Paid)');
    }
  }

  /**
   * Customer clicks "Submit Cash Order".
   * Submits order to backend with state = AWAITING_CASH_CONFIRMATION.
   */
  async handleCustomerCashSubmission() {
    if (this.isSubmitted) return;

    this.setButtonLoading(this.dom.btnSelectCashOrder, true, 'दर्ज हो रहा है...');

    try {
      await this.onRequestOrderSubmission({
        paymentMethod: 'CASH',
        reportedStatus: ORDER_STATES.AWAITING_CASH_CONFIRMATION
      });

      this.isSubmitted = true;
      this.showStatusTracker(ORDER_STATES.AWAITING_CASH_CONFIRMATION);
      this.startPolling();
    } catch (err) {
      console.error('[KioskPayment] Cash submission error:', err);
      alert(`ऑर्डर सबमिट करने में समस्या: ${err.message || 'कृपया पुनः प्रयास करें।'}`);
    } finally {
      this.setButtonLoading(this.dom.btnSelectCashOrder, false, 'नकद ऑर्डर सबमिट करें (Submit Cash Order)');
    }
  }

  /**
   * Displays the real-time order tracking card and updates status badge and message.
   * @param {string} state - Key from ORDER_STATES
   */
  showStatusTracker(state) {
    this.currentState = state;
    const meta = STATE_METADATA[state] || STATE_METADATA[ORDER_STATES.AWAITING_PAYMENT];

    // Hide payment method selectors once submitted
    if (this.dom.paymentViewUpi) this.dom.paymentViewUpi.classList.add('hidden');
    if (this.dom.paymentViewCash) this.dom.paymentViewCash.classList.add('hidden');
    if (this.dom.tabUpiBtn) this.dom.tabUpiBtn.parentElement.classList.add('hidden');

    if (this.dom.orderStatusTracker) {
      this.dom.orderStatusTracker.classList.remove('hidden');
    }

    if (this.dom.orderStatusBadge) {
      this.dom.orderStatusBadge.className = `badge badge-${meta.theme}`;
      this.dom.orderStatusBadge.textContent = meta.label;
    }

    if (this.dom.trackerStatusTitle) {
      this.dom.trackerStatusTitle.textContent = meta.labelHi;
    }

    if (this.dom.trackerStatusDesc) {
      switch (state) {
        case ORDER_STATES.PAYMENT_REVIEW:
          this.dom.trackerStatusDesc.textContent = 'दुकानदार आपके UPI भुगतान की पुष्टि (Bank Verification) कर रहे हैं।';
          if (this.dom.trackerStatusIcon) this.dom.trackerStatusIcon.textContent = '🔍';
          break;
        case ORDER_STATES.AWAITING_CASH_CONFIRMATION:
          this.dom.trackerStatusDesc.textContent = 'कृपया काउंटर पर नकद जमा करें। दुकानदार द्वारा पुष्टि होते ही प्रिंट शुरू होगा।';
          if (this.dom.trackerStatusIcon) this.dom.trackerStatusIcon.textContent = '💵';
          break;
        case ORDER_STATES.PAYMENT_CONFIRMED:
        case ORDER_STATES.CASH_CONFIRMED:
        case ORDER_STATES.PRINT_QUEUED:
          this.dom.trackerStatusDesc.textContent = 'भुगतान सफल! आपका दस्तावेज़ प्रिंटर कतार (Print Queue) में भेज दिया गया है।';
          if (this.dom.trackerStatusIcon) this.dom.trackerStatusIcon.textContent = '🖨️';
          break;
        case ORDER_STATES.PRINTING:
          this.dom.trackerStatusDesc.textContent = 'प्रिंटर पर प्रिंटिंग जारी है... कृपया काउंटर से अपना प्रिंट प्राप्त करें।';
          if (this.dom.trackerStatusIcon) this.dom.trackerStatusIcon.textContent = '⚡';
          break;
        case ORDER_STATES.PRINTED:
          this.dom.trackerStatusDesc.textContent = 'प्रिंट तैयार है! कृपया काउंटर से अपने कागजात प्राप्त करें। धन्यवाद!';
          if (this.dom.trackerStatusIcon) this.dom.trackerStatusIcon.textContent = '🎉';
          this.stopPolling();
          break;
        case ORDER_STATES.PAYMENT_REJECTED:
          this.dom.trackerStatusDesc.textContent = 'दुकानदार द्वारा भुगतान की पुष्टि नहीं हो सकी। कृपया काउंटर पर संपर्क करें।';
          if (this.dom.trackerStatusIcon) this.dom.trackerStatusIcon.textContent = '❌';
          this.stopPolling();
          break;
        case ORDER_STATES.CANCELLED:
          this.dom.trackerStatusDesc.textContent = 'यह ऑर्डर रद्द कर दिया गया है।';
          if (this.dom.trackerStatusIcon) this.dom.trackerStatusIcon.textContent = '🚫';
          this.stopPolling();
          break;
        default:
          this.dom.trackerStatusDesc.textContent = 'प्रक्रिया जारी है...';
      }
    }

    this.onStatusChange(state);
  }

  /**
   * Starts periodic polling to check for order state updates from the backend.
   */
  startPolling() {
    this.stopPolling();
    // Poll every 3 seconds
    this.pollInterval = setInterval(async () => {
      await this.checkOrderStatus();
    }, 3000);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Queries order state from backend Netlify Function.
   */
  async checkOrderStatus() {
    if (!this.activeOrderId || !this.activeShop?.shopId) return;

    try {
      const res = await fetch(`/api/create-order?action=status&shopId=${encodeURIComponent(this.activeShop.shopId)}&orderId=${encodeURIComponent(this.activeOrderId)}`);
      if (!res.ok) return;

      const data = await res.json();
      if (data && data.order && data.order.status && data.order.status !== this.currentState) {
        this.showStatusTracker(data.order.status);
      }
    } catch {
      // Network hiccup; keep polling
    }
  }

  setButtonLoading(btn, isLoading, text) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = text;
  }
}
