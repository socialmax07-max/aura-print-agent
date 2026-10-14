/**
 * AURA PRINT PRO — OPERATOR QUEUE & DISPATCH CONTROLLER
 * Owner: Sabir Ansari
 * 
 * Features:
 * - Renders dynamic verification cards for pending UPI and Cash orders
 * - Manages active print queue cards and status progression
 * - Operator PIN validation modal for counter cash receipt verification
 * - UPI payment acceptance & rejection workflows
 * - Integrated PDF.js / Image inspection modal with page flipping and metadata
 * - Manual Windows Agent print job dispatch trigger
 */

import { formatINR, formatIST, formatBytes } from '/src/shared/formatters.js';
import { ORDER_STATES, STATE_METADATA } from '/src/shared/order-states.js';

export class OperatorQueueManager {
  /**
   * @param {Object} options
   * @param {string} options.shopId
   * @param {Function} options.onOrderStateChanged
   */
  constructor({ shopId, onOrderStateChanged = () => {} }) {
    this.shopId = shopId;
    this.onOrderStateChanged = onOrderStateChanged;

    // Active modal context
    this.activeCashOrder = null;
    this.activePreviewOrder = null;
    this.previewPdfDoc = null;
    this.previewCurrentPage = 1;
    this.previewTotalPages = 1;

    this.cacheDom();
    this.bindGlobalModalEvents();
  }

  cacheDom() {
    this.dom = {
      pendingContainer: document.getElementById('pendingVerificationList'),
      printQueueContainer: document.getElementById('printQueueList'),
      pendingBadge: document.getElementById('pendingCountBadge'),
      printQueueBadge: document.getElementById('printQueueCountBadge'),
      
      // Cash PIN Modal
      modalCashPin: document.getElementById('modalCashPin'),
      modalCashOrderId: document.getElementById('modalCashOrderId'),
      modalCashOrderAmount: document.getElementById('modalCashOrderAmount'),
      cashVerificationForm: document.getElementById('cashVerificationForm'),
      inputOperatorPin: document.getElementById('inputOperatorPin'),
      cashPinErrorMsg: document.getElementById('cashPinErrorMsg'),
      btnSubmitCashPin: document.getElementById('btnSubmitCashPin'),

      // Document Preview Modal
      modalDocPreview: document.getElementById('modalDocPreview'),
      previewModalOrderId: document.getElementById('previewModalOrderId'),
      operatorPreviewCanvas: document.getElementById('operatorPreviewCanvas'),
      operatorPreviewSpinner: document.getElementById('operatorPreviewSpinner'),
      btnModalPrevPage: document.getElementById('btnModalPrevPage'),
      btnModalNextPage: document.getElementById('btnModalNextPage'),
      modalPageCounter: document.getElementById('modalPageCounter'),
      specFileName: document.getElementById('specFileName'),
      specPageRange: document.getElementById('specPageRange'),
      specColorMode: document.getElementById('specColorMode'),
      specDuplex: document.getElementById('specDuplex'),
      specCopies: document.getElementById('specCopies'),
      specSheets: document.getElementById('specSheets'),
      specPaper: document.getElementById('specPaper'),
      specTotalAmount: document.getElementById('specTotalAmount'),
      btnModalTriggerPrint: document.getElementById('btnModalTriggerPrint'),
      btnModalDownloadDoc: document.getElementById('btnModalDownloadDoc')
    };
  }

  bindGlobalModalEvents() {
    // Window-level modal helpers
    window.closeCashPinModal = () => this.closeCashModal();
    window.closeDocPreviewModal = () => this.closePreviewModal();

    // Cash Form Submission
    if (this.dom.cashVerificationForm) {
      this.dom.cashVerificationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitCashPinVerification();
      });
    }

    // Modal Document Pagination
    if (this.dom.btnModalPrevPage) {
      this.dom.btnModalPrevPage.addEventListener('click', () => this.navigatePreviewPage(-1));
    }
    if (this.dom.btnModalNextPage) {
      this.dom.btnModalNextPage.addEventListener('click', () => this.navigatePreviewPage(1));
    }

    // Modal Direct Print Dispatch
    if (this.dom.btnModalTriggerPrint) {
      this.dom.btnModalTriggerPrint.addEventListener('click', () => {
        if (this.activePreviewOrder) {
          this.triggerPrintJob(this.activePreviewOrder.orderId);
        }
      });
    }

    // Modal Signed Document Download
    if (this.dom.btnModalDownloadDoc) {
      this.dom.btnModalDownloadDoc.addEventListener('click', () => {
        if (this.activePreviewOrder && this.activePreviewOrder.downloadUrl) {
          window.open(this.activePreviewOrder.downloadUrl, '_blank');
        }
      });
    }
  }

  /**
   * Renders the two columns: Column 1 (Verification Needed) and Column 2 (Ready to Print)
   * @param {Object} lists
   * @param {Array} lists.pendingOrders
   * @param {Array} lists.printQueue
   */
  renderQueueLists({ pendingOrders = [], printQueue = [] }) {
    // Update column badge counters
    if (this.dom.pendingBadge) {
      this.dom.pendingBadge.textContent = `${pendingOrders.length} Pending`;
    }
    if (this.dom.printQueueBadge) {
      this.dom.printQueueBadge.textContent = `${printQueue.length} Ready`;
    }

    // 1. Render Column 1: Pending Verification
    if (pendingOrders.length === 0) {
      this.dom.pendingContainer.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
          </svg>
          <h4>No Pending Verifications</h4>
          <p class="text-xs text-muted">Customer orders awaiting UPI check or cash receipt will appear here.</p>
        </div>
      `;
    } else {
      this.dom.pendingContainer.innerHTML = '';
      pendingOrders.forEach(order => {
        this.dom.pendingContainer.appendChild(this.createPendingOrderCard(order));
      });
    }

    // 2. Render Column 2: Ready to Print
    if (printQueue.length === 0) {
      this.dom.printQueueContainer.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          <h4>Print Spooler Idle</h4>
          <p class="text-xs text-muted">Confirmed orders ready for background or manual print will appear here.</p>
        </div>
      `;
    } else {
      this.dom.printQueueContainer.innerHTML = '';
      printQueue.forEach(order => {
        this.dom.printQueueContainer.appendChild(this.createPrintQueueCard(order));
      });
    }
  }

  /**
   * Generates DOM Card for Pending Verification Orders
   */
  createPendingOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card urgent-attention';

    const isUpi = order.paymentMethod === 'UPI';
    const isCash = order.paymentMethod === 'CASH';
    const quote = order.quoteSnapshot || {};

    const modePill = isUpi
      ? '<span class="badge badge-info">📱 UPI Verification</span>'
      : '<span class="badge badge-warning">💵 Cash at Counter</span>';

    card.innerHTML = `
      <div class="card-top-row">
        <div>
          <span class="order-id-tag text-mono">${order.orderId}</span>
          ${modePill}
        </div>
        <span class="order-timestamp">${formatIST(order.createdAt || Date.now())}</span>
      </div>

      <div class="card-doc-info">
        <span>📄</span>
        <span class="doc-name text-truncate" title="${quote.documentName || 'Document'}">
          ${quote.documentName || 'Document'}
        </span>
        <span class="text-xs text-muted">(${formatBytes(quote.documentSize || 0)})</span>
      </div>

      <div class="card-specs-pills">
        <span class="spec-pill">${quote.isColor ? '🎨 Colour' : '⬛ B&W'}</span>
        <span class="spec-pill">${quote.isDuplex ? 'Double Sided' : 'Single Sided'}</span>
        <span class="spec-pill">${quote.copies || 1} Copies</span>
        <span class="spec-pill">${quote.totalPhysicalSheets || 1} Sheets</span>
        <span class="spec-pill text-mono">${quote.paperSize || 'A4'}</span>
      </div>

      <div class="card-billing-row">
        <div>
          <span class="text-xs text-muted">Amount Due:</span>
          <div class="card-amount">${formatINR(quote.totalAmount || 0)}</div>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-outline btn-sm action-inspect">🔍 Inspect</button>
          ${
            isCash
              ? `<button type="button" class="btn btn-primary btn-sm action-confirm-cash">💵 Receive Cash (PIN)</button>`
              : `<button type="button" class="btn btn-success btn-sm action-confirm-upi">✔ Verify UPI</button>`
          }
          <button type="button" class="btn btn-danger btn-sm action-reject" title="Reject Payment">✖</button>
        </div>
      </div>
    `;

    // Wire Card Actions
    card.querySelector('.action-inspect').addEventListener('click', () => this.openPreviewModal(order));

    if (isCash) {
      card.querySelector('.action-confirm-cash').addEventListener('click', () => this.openCashModal(order));
    } else {
      card.querySelector('.action-confirm-upi').addEventListener('click', () => this.verifyUpiPayment(order.orderId));
    }

    card.querySelector('.action-reject').addEventListener('click', () => this.rejectOrderPayment(order.orderId));

    return card;
  }

  /**
   * Generates DOM Card for Orders in Print Queue
   */
  createPrintQueueCard(order) {
    const card = document.createElement('div');
    const isPrinting = order.status === ORDER_STATES.PRINTING;
    card.className = `order-card ${isPrinting ? 'printing-pulse' : 'printable-active'}`;

    const quote = order.quoteSnapshot || {};
    const meta = STATE_METADATA[order.status] || STATE_METADATA[ORDER_STATES.PRINT_QUEUED];

    card.innerHTML = `
      <div class="card-top-row">
        <div>
          <span class="order-id-tag text-mono">${order.orderId}</span>
          <span class="badge badge-${meta.theme}">${meta.label}</span>
        </div>
        <span class="order-timestamp">${formatIST(order.updatedAt || Date.now())}</span>
      </div>

      <div class="card-doc-info">
        <span>🖨️</span>
        <span class="doc-name text-truncate" title="${quote.documentName || 'Document'}">
          ${quote.documentName || 'Document'}
        </span>
      </div>

      <div class="card-specs-pills">
        <span class="spec-pill">${quote.isColor ? 'Colour' : 'B&W'}</span>
        <span class="spec-pill">${quote.isDuplex ? 'Duplex' : 'Single'}</span>
        <span class="spec-pill">${quote.totalPhysicalSheets || 1} Sheets</span>
        <span class="spec-pill">${quote.copies || 1} Copies</span>
      </div>

      <div class="card-billing-row">
        <div>
          <span class="text-xs text-muted">Paid (${order.paymentMethod}):</span>
          <div class="card-amount" style="font-size: 1.1rem; color: var(--success-solid);">
            ${formatINR(quote.totalAmount || 0)}
          </div>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-outline btn-sm action-inspect">🔍 View</button>
          <button type="button" class="btn btn-primary btn-sm action-print-now">
            ${isPrinting ? '⚡ Printing...' : '🖨️ Print Now'}
          </button>
          <button type="button" class="btn btn-success btn-sm action-mark-printed" title="Mark as Finished">✔ Done</button>
        </div>
      </div>
    `;

    // Wire Print Actions
    card.querySelector('.action-inspect').addEventListener('click', () => this.openPreviewModal(order));
    card.querySelector('.action-print-now').addEventListener('click', () => this.triggerPrintJob(order.orderId));
    card.querySelector('.action-mark-printed').addEventListener('click', () => this.markOrderPrinted(order.orderId));

    return card;
  }

  /**
   * Cash PIN Modal Management
   */
  openCashModal(order) {
    this.activeCashOrder = order;
    this.dom.modalCashOrderId.textContent = order.orderId;
    this.dom.modalCashOrderAmount.textContent = formatINR(order.quoteSnapshot?.totalAmount || 0);
    this.dom.inputOperatorPin.value = '';
    this.dom.cashPinErrorMsg.classList.add('hidden');
    this.dom.modalCashPin.classList.add('open');
    setTimeout(() => this.dom.inputOperatorPin.focus(), 50);
  }

  closeCashModal() {
    this.activeCashOrder = null;
    this.dom.modalCashPin.classList.remove('open');
  }

  async submitCashPinVerification() {
    if (!this.activeCashOrder) return;

    const pin = (this.dom.inputOperatorPin.value || '').trim();
    if (!/^\d{4,6}$/.test(pin)) {
      this.dom.cashPinErrorMsg.textContent = 'Please enter a valid 4 to 6 digit numerical PIN.';
      this.dom.cashPinErrorMsg.classList.remove('hidden');
      return;
    }

    this.dom.btnSubmitCashPin.disabled = true;
    this.dom.btnSubmitCashPin.textContent = 'Verifying PIN...';
    this.dom.cashPinErrorMsg.classList.add('hidden');

    try {
      const res = await fetch('/api/create-order?action=confirmCash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: this.shopId,
          orderId: this.activeCashOrder.orderId,
          operatorPin: pin
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Incorrect PIN or verification failure.');
      }

      this.closeCashModal();
      this.onOrderStateChanged();
    } catch (err) {
      this.dom.cashPinErrorMsg.textContent = err.message;
      this.dom.cashPinErrorMsg.classList.remove('hidden');
      this.dom.inputOperatorPin.select();
    } finally {
      this.dom.btnSubmitCashPin.disabled = false;
      this.dom.btnSubmitCashPin.textContent = '✔ Confirm Cash & Queue Print';
    }
  }

  /**
   * Confirms incoming UPI payment directly from operator dashboard
   */
  async verifyUpiPayment(orderId) {
    if (!confirm(`Confirm UPI payment verification for Order ${orderId}?`)) return;

    try {
      const res = await fetch('/api/create-order?action=verifyPayment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: this.shopId,
          orderId
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Verification update failed.');
      }

      this.onOrderStateChanged();
    } catch (err) {
      alert(`Error verifying UPI payment: ${err.message}`);
    }
  }

  /**
   * Rejects payment (customer entered invalid UPI or did not pay)
   */
  async rejectOrderPayment(orderId) {
    const reason = prompt(`Enter rejection reason for Order ${orderId} (e.g. Payment not received):`);
    if (!reason) return;

    try {
      const res = await fetch('/api/create-order?action=rejectPayment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: this.shopId,
          orderId,
          reason
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Rejection update failed.');
      }

      this.onOrderStateChanged();
    } catch (err) {
      alert(`Error rejecting payment: ${err.message}`);
    }
  }

  /**
   * Dispatches manual print job instruction to Windows Agent
   */
  async triggerPrintJob(orderId) {
    try {
      const res = await fetch('/api/create-order?action=triggerPrint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: this.shopId,
          orderId
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to dispatch print command to agent.');
      }

      this.onOrderStateChanged();
    } catch (err) {
      alert(`Print trigger error: ${err.message}`);
    }
  }

  /**
   * Marks order completed and archived
   */
  async markOrderPrinted(orderId) {
    try {
      const res = await fetch('/api/create-order?action=markPrinted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: this.shopId,
          orderId
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update order status.');
      }

      this.onOrderStateChanged();
    } catch (err) {
      alert(`Error updating order: ${err.message}`);
    }
  }

  /**
   * Document Inspection Modal Management
   */
  async openPreviewModal(order) {
    this.activePreviewOrder = order;
    const quote = order.quoteSnapshot || {};

    this.dom.previewModalOrderId.textContent = order.orderId;
    this.dom.specFileName.textContent = quote.documentName || 'Document';
    this.dom.specPageRange.textContent = quote.selectedPagesList ? quote.selectedPagesList.join(', ') : 'All';
    this.dom.specColorMode.textContent = quote.isColor ? 'Colour' : 'Black & White';
    this.dom.specDuplex.textContent = quote.isDuplex ? 'Duplex (Both sides)' : 'Single Sided';
    this.dom.specCopies.textContent = quote.copies || 1;
    this.dom.specSheets.textContent = `${quote.totalPhysicalSheets || 1} physical sheets`;
    this.dom.specPaper.textContent = quote.paperSize || 'A4';
    this.dom.specTotalAmount.textContent = formatINR(quote.totalAmount || 0);

    this.dom.modalDocPreview.classList.add('open');

    // Load file preview via signed URL or base64 preview buffer
    if (order.downloadUrl) {
      await this.loadPreviewDocument(order.downloadUrl, quote.fileType);
    }
  }

  closePreviewModal() {
    this.activePreviewOrder = null;
    this.previewPdfDoc = null;
    this.dom.modalDocPreview.classList.remove('open');
  }

  async loadPreviewDocument(url, fileType) {
    const canvas = this.dom.operatorPreviewCanvas;
    const ctx = canvas.getContext('2d');
    const spinner = this.dom.operatorPreviewSpinner;

    spinner.classList.remove('hidden');

    try {
      if (fileType === 'IMAGE') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);
          spinner.classList.add('hidden');
          this.dom.modalPageCounter.textContent = 'Image (1 / 1)';
          this.dom.btnModalPrevPage.disabled = true;
          this.dom.btnModalNextPage.disabled = true;
        };
        img.src = url;
      } else if (window.pdfjsLib) {
        const loadingTask = window.pdfjsLib.getDocument(url);
        this.previewPdfDoc = await loadingTask.promise;
        this.previewTotalPages = this.previewPdfDoc.numPages;
        this.previewCurrentPage = 1;
        await this.renderModalPdfPage(1);
        spinner.classList.add('hidden');
      }
    } catch (err) {
      console.error('[OperatorQueue] Document preview failed:', err);
      spinner.classList.add('hidden');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  async renderModalPdfPage(pageNum) {
    if (!this.previewPdfDoc) return;
    this.previewCurrentPage = pageNum;

    const page = await this.previewPdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });

    const canvas = this.dom.operatorPreviewCanvas;
    const ctx = canvas.getContext('2d');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    this.dom.modalPageCounter.textContent = `Page ${pageNum} / ${this.previewTotalPages}`;
    this.dom.btnModalPrevPage.disabled = pageNum <= 1;
    this.dom.btnModalNextPage.disabled = pageNum >= this.previewTotalPages;
  }

  navigatePreviewPage(delta) {
    const target = this.previewCurrentPage + delta;
    if (target >= 1 && target <= this.previewTotalPages) {
      this.renderModalPdfPage(target);
    }
  }
}