/**
 * AURA PRINT PRO — OPERATOR DAILY SALES & ORDER HISTORY REGISTER
 * Owner: Sabir Ansari
 * 
 * Features:
 * - Historical order fetching from backend serverless endpoints
 * - Client-side search by Order ID or Document Name
 * - Multi-criteria filter engine (Payment Mode: ALL/UPI/CASH; Status: ALL/PRINTED/etc.)
 * - Client-side pagination with active range calculations
 * - GST-compliant / accounting CSV export generator with formula sanitization
 * - IST timestamp and Indian currency formatting
 */

import { formatINR, formatIST, formatBytes } from '/src/shared/formatters.js';
import { STATE_METADATA } from '/src/shared/order-states.js';

export class OperatorReportsManager {
  /**
   * @param {Object} options
   * @param {string} options.shopId
   */
  constructor({ shopId }) {
    this.shopId = shopId;
    this.allOrders = [];
    this.filteredOrders = [];
    this.currentPage = 1;
    this.pageSize = 15;
    this.isLoading = false;

    // Filter state
    this.searchQuery = '';
    this.paymentFilter = 'ALL';
    this.statusFilter = 'ALL';

    this.cacheDom();
    this.bindEvents();
  }

  cacheDom() {
    this.dom = {
      btnExportCsv: document.getElementById('btnExportCsv'),
      btnRefreshHistory: document.getElementById('btnRefreshHistory'),
      searchOrderInput: document.getElementById('searchOrderInput'),
      filterPaymentMode: document.getElementById('filterPaymentMode'),
      filterStatus: document.getElementById('filterStatus'),
      historyTableBody: document.getElementById('historyTableBody'),
      historyRecordCountText: document.getElementById('historyRecordCountText'),
      btnPrevHistoryPage: document.getElementById('btnPrevHistoryPage'),
      btnNextHistoryPage: document.getElementById('btnNextHistoryPage'),
      historyPageNumText: document.getElementById('historyPageNumText')
    };
  }

  bindEvents() {
    // Refresh button
    if (this.dom.btnRefreshHistory) {
      this.dom.btnRefreshHistory.addEventListener('click', () => this.loadHistory());
    }

    // CSV Export button
    if (this.dom.btnExportCsv) {
      this.dom.btnExportCsv.addEventListener('click', () => this.exportCsvRegister());
    }

    // Debounced Search Input
    let searchDebounceTimer = null;
    if (this.dom.searchOrderInput) {
      this.dom.searchOrderInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          this.searchQuery = (e.target.value || '').trim().toLowerCase();
          this.currentPage = 1;
          this.applyFiltersAndRender();
        }, 250);
      });
    }

    // Payment Filter Dropdown
    if (this.dom.filterPaymentMode) {
      this.dom.filterPaymentMode.addEventListener('change', (e) => {
        this.paymentFilter = e.target.value;
        this.currentPage = 1;
        this.applyFiltersAndRender();
      });
    }

    // Status Filter Dropdown
    if (this.dom.filterStatus) {
      this.dom.filterStatus.addEventListener('change', (e) => {
        this.statusFilter = e.target.value;
        this.currentPage = 1;
        this.applyFiltersAndRender();
      });
    }

    // Pagination Controls
    if (this.dom.btnPrevHistoryPage) {
      this.dom.btnPrevHistoryPage.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.renderTable();
        }
      });
    }

    if (this.dom.btnNextHistoryPage) {
      this.dom.btnNextHistoryPage.addEventListener('click', () => {
        const totalPages = Math.ceil(this.filteredOrders.length / this.pageSize) || 1;
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.renderTable();
        }
      });
    }
  }

  /**
   * Fetches full order register data from Netlify serverless endpoint
   */
  async loadHistory() {
    if (this.isLoading) return;
    this.isLoading = true;

    if (this.dom.historyTableBody) {
      this.dom.historyTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center text-muted" style="padding: 2.5rem 1rem;">
            <div class="spinner" style="margin-bottom: 0.5rem; color: var(--primary-600);"></div>
            <p class="text-xs">Loading sales register records...</p>
          </td>
        </tr>
      `;
    }

    try {
      const res = await fetch(`/api/create-order?action=getOrderHistory&shopId=${encodeURIComponent(this.shopId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      this.allOrders = Array.isArray(data.orders) ? data.orders : [];
      this.applyFiltersAndRender();
    } catch (err) {
      console.error('[OperatorReports] Load history failed:', err);
      if (this.dom.historyTableBody) {
        this.dom.historyTableBody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center text-muted" style="padding: 2rem 1rem;">
              <span class="text-danger" style="font-weight: 600;">Failed to load order history.</span>
              <p class="text-xs" style="margin-top: 0.25rem;">${err.message || 'Network error'}</p>
            </td>
          </tr>
        `;
      }
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Silent background refresh invoked by master polling loop
   */
  async refreshHistoryData() {
    if (this.isLoading) return;
    try {
      const res = await fetch(`/api/create-order?action=getOrderHistory&shopId=${encodeURIComponent(this.shopId)}`);
      if (!res.ok) return;

      const data = await res.json();
      this.allOrders = Array.isArray(data.orders) ? data.orders : [];
      this.applyFiltersAndRender(false);
    } catch {
      // Ignored during passive background refresh
    }
  }

  /**
   * Evaluates search terms and filter dropdown selections
   * @param {boolean} resetPage
   */
  applyFiltersAndRender(resetPage = true) {
    if (resetPage) {
      this.currentPage = 1;
    }

    this.filteredOrders = this.allOrders.filter(order => {
      // 1. Search Query (Order ID or Document Name)
      if (this.searchQuery) {
        const idMatch = (order.orderId || '').toLowerCase().includes(this.searchQuery);
        const nameMatch = (order.quoteSnapshot?.documentName || '').toLowerCase().includes(this.searchQuery);
        if (!idMatch && !nameMatch) return false;
      }

      // 2. Payment Method Filter
      if (this.paymentFilter !== 'ALL') {
        if (order.paymentMethod !== this.paymentFilter) return false;
      }

      // 3. Status Filter
      if (this.statusFilter !== 'ALL') {
        if (order.status !== this.statusFilter) return false;
      }

      return true;
    });

    this.renderTable();
  }

  /**
   * Renders rows for the current active page
   */
  renderTable() {
    if (!this.dom.historyTableBody) return;

    if (this.filteredOrders.length === 0) {
      this.dom.historyTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center text-muted" style="padding: 3rem 1rem;">
            No matching order records found.
          </td>
        </tr>
      `;
      this.updatePaginationInfo(0, 0, 0);
      return;
    }

    const totalRecords = this.filteredOrders.length;
    const totalPages = Math.ceil(totalRecords / this.pageSize) || 1;
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, totalRecords);
    const pageRecords = this.filteredOrders.slice(startIndex, endIndex);

    this.dom.historyTableBody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    pageRecords.forEach(order => {
      const quote = order.quoteSnapshot || {};
      const meta = STATE_METADATA[order.status] || { label: order.status || 'UNKNOWN', theme: 'neutral' };
      const isUpi = order.paymentMethod === 'UPI';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-mono text-bold">${order.orderId || '---'}</td>
        <td class="text-xs text-muted" style="white-space: nowrap;">${formatIST(order.createdAt || Date.now())}</td>
        <td>
          <div class="text-truncate" style="max-width: 180px; font-weight: 600;" title="${quote.documentName || 'Document'}">
            ${quote.documentName || 'Document'}
          </div>
          <span class="text-xs text-muted">(${formatBytes(quote.documentSize || 0)})</span>
        </td>
        <td class="text-xs">
          <strong>${quote.selectedPages || 1}</strong> pgs &bull; 
          <span class="text-muted">${quote.totalPhysicalSheets || 1} sheets</span>
        </td>
        <td>
          <span class="spec-pill" style="font-size: 0.65rem;">
            ${quote.isColor ? 'Colour' : 'B&W'} / ${quote.isDuplex ? 'Duplex' : 'Single'}
          </span>
        </td>
        <td>
          <span class="badge ${isUpi ? 'badge-info' : 'badge-neutral'}">
            ${isUpi ? '📱 UPI' : '💵 Cash'}
          </span>
        </td>
        <td class="text-bold" style="white-space: nowrap;">
          ${formatINR(quote.totalAmount || 0)}
        </td>
        <td>
          <span class="badge badge-${meta.theme}">${meta.label}</span>
        </td>
        <td>
          <button type="button" class="btn btn-outline btn-sm action-view-details" style="padding: 2px 6px; font-size: 0.75rem;">
            Details
          </button>
        </td>
      `;

      tr.querySelector('.action-view-details').addEventListener('click', () => {
        if (window.AuraOperatorApp?.queueManager) {
          window.AuraOperatorApp.queueManager.openPreviewModal(order);
        }
      });

      fragment.appendChild(tr);
    });

    this.dom.historyTableBody.appendChild(fragment);
    this.updatePaginationInfo(startIndex + 1, endIndex, totalRecords);
  }

  updatePaginationInfo(from, to, total) {
    const totalPages = Math.ceil(total / this.pageSize) || 1;

    if (this.dom.historyRecordCountText) {
      this.dom.historyRecordCountText.textContent = total === 0
        ? 'Showing 0 of 0 orders'
        : `Showing ${from}–${to} of ${total} orders`;
    }

    if (this.dom.historyPageNumText) {
      this.dom.historyPageNumText.textContent = `Page ${this.currentPage} of ${totalPages}`;
    }

    if (this.dom.btnPrevHistoryPage) {
      this.dom.btnPrevHistoryPage.disabled = this.currentPage <= 1;
    }

    if (this.dom.btnNextHistoryPage) {
      this.dom.btnNextHistoryPage.disabled = this.currentPage >= totalPages;
    }
  }

  /**
   * Exports filtered accounting register into a structured CSV file
   */
  exportCsvRegister() {
    if (this.filteredOrders.length === 0) {
      alert('No orders available to export in the current filtered view.');
      return;
    }

    const headers = [
      'Order ID',
      'Date & Time (IST)',
      'Document Name',
      'File Type',
      'Document Size (Bytes)',
      'Pages Selected',
      'Physical Sheets',
      'Copies',
      'Color Mode',
      'Sides',
      'Paper Size',
      'Payment Method',
      'Total Amount (INR)',
      'Order Status'
    ];

    const sanitizeCsvCell = (val) => {
      let str = String(val ?? '').trim();
      // Guard against CSV Formula Injection (=, +, -, @, \t, \r)
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const csvRows = [headers.map(sanitizeCsvCell).join(',')];

    this.filteredOrders.forEach(order => {
      const quote = order.quoteSnapshot || {};
      const row = [
        order.orderId || '',
        formatIST(order.createdAt || Date.now()),
        quote.documentName || 'Document',
        quote.fileType || 'PDF',
        quote.documentSize || 0,
        quote.selectedPages || 1,
        quote.totalPhysicalSheets || 1,
        quote.copies || 1,
        quote.isColor ? 'Colour' : 'B&W',
        quote.isDuplex ? 'Duplex' : 'Single Sided',
        quote.paperSize || 'A4',
        order.paymentMethod || 'UNKNOWN',
        (quote.totalAmount || 0).toFixed(2),
        order.status || 'UNKNOWN'
      ];
      csvRows.push(row.map(sanitizeCsvCell).join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n'); // Add UTF-8 BOM for Microsoft Excel compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const dateStamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AURA_Sales_Register_${this.shopId}_${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}
