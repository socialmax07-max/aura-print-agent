/**
 * AURA PRINT PRO — MASTER SUPER ADMIN COCKPIT CONTROLLER
 * Owner: Sabir Ansari
 * 
 * Features:
 * - Session-based master secret authentication guard
 * - Platform KPIs aggregator: Total Shops, MRR breakdown, Global Orders, Live Agents
 * - Tenant Shops Directory: search, subscription tier filter, status filter
 * - Onboarding modal: registers new shops and auto-generates agent secret tokens
 * - Tenant management modal: tier migration, daily quota hard caps, suspend/activate
 * - Instant Windows Print Agent token regeneration & revocation
 */

import { SUBSCRIPTION_TIERS } from '/src/shared/constants.js';
import { formatINR, formatIST } from '/src/shared/formatters.js';
import { isValidShopId, isValidUpiId } from '/src/shared/validators.js';

class SuperAdminCockpitApp {
  constructor() {
    this.masterKey = sessionStorage.getItem('aura_admin_master_key') || '';
    this.allShops = [];
    this.filteredShops = [];
    this.selectedShopForManage = null;

    // Filters
    this.searchQuery = '';
    this.tierFilter = 'ALL';
    this.statusFilter = 'ALL';

    this.cacheDom();
    this.bindEvents();
    this.exposeGlobalHandlers();
    this.checkAuthentication();
  }

  cacheDom() {
    this.dom = {
      // Auth Modal
      modalAdminAuth: document.getElementById('modalAdminAuth'),
      inputMasterKey: document.getElementById('inputMasterKey'),
      authErrorMsg: document.getElementById('authErrorMsg'),
      btnAuthSubmit: document.getElementById('btnAuthSubmit'),
      btnAdminLogout: document.getElementById('btnAdminLogout'),

      // Top Actions & Alert
      btnOpenCreateShopModal: document.getElementById('btnOpenCreateShopModal'),
      btnAdminRefresh: document.getElementById('btnAdminRefresh'),
      adminGlobalAlert: document.getElementById('adminGlobalAlert'),
      adminGlobalAlertText: document.getElementById('adminGlobalAlertText'),

      // Platform KPI Metric Elements
      metricTotalShops: document.getElementById('metricTotalShops'),
      metricActiveShopsSub: document.getElementById('metricActiveShopsSub'),
      metricEstMrr: document.getElementById('metricEstMrr'),
      metricPlatformDailyOrders: document.getElementById('metricPlatformDailyOrders'),
      metricConnectedAgents: document.getElementById('metricConnectedAgents'),

      // Directory Table & Filters
      adminShopSearchInput: document.getElementById('adminShopSearchInput'),
      adminTierFilter: document.getElementById('adminTierFilter'),
      adminStatusFilter: document.getElementById('adminStatusFilter'),
      adminShopsTableBody: document.getElementById('adminShopsTableBody'),
      adminDirectoryFooterText: document.getElementById('adminDirectoryFooterText'),

      // Create Shop Modal Elements
      modalCreateShop: document.getElementById('modalCreateShop'),
      newShopName: document.getElementById('newShopName'),
      newShopId: document.getElementById('newShopId'),
      newOwnerPhone: document.getElementById('newOwnerPhone'),
      newShopCity: document.getElementById('newShopCity'),
      newShopUpi: document.getElementById('newShopUpi'),
      newShopTier: document.getElementById('newShopTier'),
      btnSubmitNewShop: document.getElementById('btnSubmitNewShop'),

      // Manage Shop Modal Elements
      modalManageShop: document.getElementById('modalManageShop'),
      manageShopIdSubtitle: document.getElementById('manageShopIdSubtitle'),
      editSubscriptionTier: document.getElementById('editSubscriptionTier'),
      editDailyQuota: document.getElementById('editDailyQuota'),
      manageAgentTokenText: document.getElementById('manageAgentTokenText'),
      btnSubmitManageShop: document.getElementById('btnSubmitManageShop')
    };
  }

  bindEvents() {
    // Logout / Lock Cockpit
    if (this.dom.btnAdminLogout) {
      this.dom.btnAdminLogout.addEventListener('click', () => {
        sessionStorage.removeItem('aura_admin_master_key');
        this.masterKey = '';
        this.dom.modalAdminAuth.classList.add('open');
      });
    }

    // Refresh Action
    if (this.dom.btnAdminRefresh) {
      this.dom.btnAdminRefresh.addEventListener('click', () => this.loadPlatformData());
    }

    // Open Onboarding Modal
    if (this.dom.btnOpenCreateShopModal) {
      this.dom.btnOpenCreateShopModal.addEventListener('click', () => {
        this.dom.modalCreateShop.classList.add('open');
        this.dom.newShopName.focus();
      });
    }

    // Debounced Search Input
    let searchDebounceTimer = null;
    if (this.dom.adminShopSearchInput) {
      this.dom.adminShopSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          this.searchQuery = (e.target.value || '').trim().toLowerCase();
          this.applyFiltersAndRender();
        }, 250);
      });
    }

    // Tier Filter Dropdown
    if (this.dom.adminTierFilter) {
      this.dom.adminTierFilter.addEventListener('change', (e) => {
        this.tierFilter = e.target.value;
        this.applyFiltersAndRender();
      });
    }

    // Status Filter Dropdown
    if (this.dom.adminStatusFilter) {
      this.dom.adminStatusFilter.addEventListener('change', (e) => {
        this.statusFilter = e.target.value;
        this.applyFiltersAndRender();
      });
    }
  }

  exposeGlobalHandlers() {
    window.handleMasterAuthSubmit = (e) => this.handleMasterAuthSubmit(e);
    window.handleCreateShopSubmit = (e) => this.handleCreateShopSubmit(e);
    window.handleUpdateShopSubmit = (e) => this.handleUpdateShopSubmit(e);
    window.closeCreateShopModal = () => this.dom.modalCreateShop.classList.remove('open');
    window.closeManageShopModal = () => this.dom.modalManageShop.classList.remove('open');
    window.copyManageToken = () => this.copyManageToken();
    window.regenerateAgentTokenConfirm = () => this.regenerateAgentTokenConfirm();
  }

  checkAuthentication() {
    if (this.masterKey) {
      this.dom.modalAdminAuth.classList.remove('open');
      this.loadPlatformData();
    } else {
      this.dom.modalAdminAuth.classList.add('open');
      setTimeout(() => this.dom.inputMasterKey?.focus(), 100);
    }
  }

  async handleMasterAuthSubmit(e) {
    e.preventDefault();
    const inputKey = (this.dom.inputMasterKey.value || '').trim();

    if (!inputKey) {
      this.dom.authErrorMsg.textContent = 'Please enter the master admin key.';
      this.dom.authErrorMsg.classList.remove('hidden');
      return;
    }

    this.dom.btnAuthSubmit.disabled = true;
    this.dom.btnAuthSubmit.textContent = 'Authenticating...';
    this.dom.authErrorMsg.classList.add('hidden');

    try {
      // Test the key against the backend endpoint
      const res = await fetch('/api/create-order?action=adminVerifyKey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-master-key': inputKey
        }
      });

      if (!res.ok) {
        throw new Error('Invalid master admin secret key.');
      }

      this.masterKey = inputKey;
      sessionStorage.setItem('aura_admin_master_key', inputKey);
      this.dom.modalAdminAuth.classList.remove('open');
      this.loadPlatformData();
    } catch (err) {
      this.dom.authErrorMsg.textContent = err.message;
      this.dom.authErrorMsg.classList.remove('hidden');
      this.dom.inputMasterKey.select();
    } finally {
      this.dom.btnAuthSubmit.disabled = false;
      this.dom.btnAuthSubmit.textContent = '🔓 Unlock Cockpit';
    }
  }

  /**
   * Loads platform overview metrics and tenant shops list
   */
  async loadPlatformData() {
    this.clearAlert();

    try {
      const res = await fetch('/api/create-order?action=adminGetPlatformData', {
        headers: {
          'x-admin-master-key': this.masterKey
        }
      });

      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem('aura_admin_master_key');
        this.masterKey = '';
        this.dom.modalAdminAuth.classList.add('open');
        throw new Error('Authentication expired or unauthorized.');
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      this.allShops = Array.isArray(data.shops) ? data.shops : [];

      this.renderKpiMetrics(data.platformMetrics || {});
      this.applyFiltersAndRender();
    } catch (err) {
      console.error('[AdminCockpit] Load failed:', err);
      this.showAlert(`Failed to load platform data: ${err.message}`, 'danger');
    }
  }

  /**
   * Calculates and renders platform aggregate KPIs
   */
  renderKpiMetrics(metrics) {
    const totalShops = this.allShops.length;
    const activeShops = this.allShops.filter(s => s.isActive !== false).length;
    const inactiveShops = totalShops - activeShops;

    // Calculate Estimated MRR based on SUBSCRIPTION_TIERS pricing
    let calculatedMrr = 0;
    this.allShops.forEach(shop => {
      if (shop.isActive !== false) {
        const tierKey = (shop.subscriptionTier || 'GROWTH').toUpperCase();
        const tierConfig = SUBSCRIPTION_TIERS[tierKey];
        if (tierConfig && tierConfig.priceMonthly) {
          calculatedMrr += tierConfig.priceMonthly;
        }
      }
    });

    const dailyOrders = metrics.globalDailyOrders ?? 0;
    const connectedAgents = metrics.connectedAgentsCount ?? 0;

    if (this.dom.metricTotalShops) this.dom.metricTotalShops.textContent = totalShops;
    if (this.dom.metricActiveShopsSub) {
      this.dom.metricActiveShopsSub.textContent = `${activeShops} Active / ${inactiveShops} Suspended`;
    }
    if (this.dom.metricEstMrr) this.dom.metricEstMrr.textContent = formatINR(calculatedMrr);
    if (this.dom.metricPlatformDailyOrders) this.dom.metricPlatformDailyOrders.textContent = dailyOrders;
    if (this.dom.metricConnectedAgents) this.dom.metricConnectedAgents.textContent = connectedAgents;
  }

  applyFiltersAndRender() {
    this.filteredShops = this.allShops.filter(shop => {
      // 1. Search Query
      if (this.searchQuery) {
        const q = this.searchQuery;
        const nameMatch = (shop.shopName || '').toLowerCase().includes(q);
        const idMatch = (shop.shopId || '').toLowerCase().includes(q);
        const phoneMatch = (shop.ownerPhone || '').includes(q);
        const cityMatch = (shop.city || '').toLowerCase().includes(q);
        if (!nameMatch && !idMatch && !phoneMatch && !cityMatch) return false;
      }

      // 2. Tier Filter
      if (this.tierFilter !== 'ALL') {
        if ((shop.subscriptionTier || 'GROWTH').toUpperCase() !== this.tierFilter) {
          return false;
        }
      }

      // 3. Status Filter
      if (this.statusFilter !== 'ALL') {
        const isActive = shop.isActive !== false;
        if (this.statusFilter === 'ACTIVE' && !isActive) return false;
        if (this.statusFilter === 'INACTIVE' && isActive) return false;
      }

      return true;
    });

    this.renderDirectoryTable();
  }

  renderDirectoryTable() {
    const tbody = this.dom.adminShopsTableBody;
    if (!tbody) return;

    if (this.filteredShops.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center text-muted" style="padding: 3rem 1rem;">
            No registered tenant shops matching the selected criteria.
          </td>
        </tr>
      `;
      if (this.dom.adminDirectoryFooterText) {
        this.dom.adminDirectoryFooterText.textContent = 'Showing 0 shops';
      }
      return;
    }

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    this.filteredShops.forEach(shop => {
      const tierKey = (shop.subscriptionTier || 'GROWTH').toUpperCase();
      const tierConfig = SUBSCRIPTION_TIERS[tierKey] || SUBSCRIPTION_TIERS.GROWTH;
      const isActive = shop.isActive !== false;
      const isAgentOnline = Boolean(shop.isAgentOnline);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-mono text-bold">${shop.shopId}</td>
        <td>
          <div class="tenant-identity-cell">
            <span class="text-bold">${shop.shopName || 'Shop Name'}</span>
            <span class="tenant-city-badge">📍 ${shop.city || 'India'}</span>
          </div>
        </td>
        <td class="text-mono">${shop.ownerPhone || '---'}</td>
        <td>
          <span class="badge badge-primary">${tierConfig.name}</span>
          <div class="text-xs text-muted" style="margin-top: 2px;">₹${tierConfig.priceMonthly}/mo</div>
        </td>
        <td class="text-mono text-xs">${shop.upiId || '---'}</td>
        <td class="text-mono">${shop.dailyOrderCap || tierConfig.maxOrdersPerDay} / day</td>
        <td>
          <span class="agent-live-dot ${isAgentOnline ? 'agent-online' : 'agent-offline'}"></span>
          <span class="text-xs ${isAgentOnline ? 'text-success text-bold' : 'text-muted'}">
            ${isAgentOnline ? 'Connected' : 'Offline'}
          </span>
        </td>
        <td>
          <span class="badge ${isActive ? 'badge-success' : 'badge-danger'}">
            ${isActive ? 'ACTIVE' : 'SUSPENDED'}
          </span>
        </td>
        <td>
          <button type="button" class="btn btn-outline btn-sm action-manage-tenant" style="padding: 3px 8px;">
            ⚙️ Manage
          </button>
        </td>
      `;

      tr.querySelector('.action-manage-tenant').addEventListener('click', () => {
        this.openManageShopModal(shop);
      });

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);

    if (this.dom.adminDirectoryFooterText) {
      this.dom.adminDirectoryFooterText.textContent = `Showing ${this.filteredShops.length} of ${this.allShops.length} shops`;
    }
  }

  /**
   * Onboards a new tenant shop
   */
  async handleCreateShopSubmit(e) {
    e.preventDefault();
    this.clearAlert();

    const name = (this.dom.newShopName.value || '').trim();
    const slug = (this.dom.newShopId.value || '').trim().toLowerCase();
    const phone = (this.dom.newOwnerPhone.value || '').trim();
    const city = (this.dom.newShopCity.value || '').trim();
    const upi = (this.dom.newShopUpi.value || '').trim().toLowerCase();
    const tier = this.dom.newShopTier.value;

    if (!isValidShopId(slug)) {
      alert('Invalid Shop Slug. Must be 3-32 characters, lowercase letters, numbers, and hyphens only.');
      return;
    }

    if (!isValidUpiId(upi)) {
      alert('Invalid UPI VPA ID format.');
      return;
    }

    this.dom.btnSubmitNewShop.disabled = true;
    this.dom.btnSubmitNewShop.textContent = 'Provisioning Shop...';

    try {
      const res = await fetch('/api/create-order?action=adminCreateShop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-master-key': this.masterKey
        },
        body: JSON.stringify({
          shopId: slug,
          shopName: name,
          ownerPhone: phone,
          city,
          upiId: upi,
          subscriptionTier: tier
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Shop provisioning failed.');

      this.showAlert(`Shop "${name}" successfully registered! Windows Agent token generated.`, 'success');
      this.dom.modalCreateShop.classList.remove('open');
      this.dom.newShopName.value = '';
      this.dom.newShopId.value = '';
      this.dom.newOwnerPhone.value = '';
      this.dom.newShopCity.value = '';
      this.dom.newShopUpi.value = '';

      await this.loadPlatformData();
    } catch (err) {
      alert(`Error creating shop: ${err.message}`);
    } finally {
      this.dom.btnSubmitNewShop.disabled = false;
      this.dom.btnSubmitNewShop.textContent = '✔ Create Shop & Generate Token';
    }
  }

  /**
   * Opens the tenant shop management modal
   */
  openManageShopModal(shop) {
    this.selectedShopForManage = shop;

    this.dom.manageShopIdSubtitle.textContent = shop.shopId;
    this.dom.editSubscriptionTier.value = (shop.subscriptionTier || 'GROWTH').toUpperCase();
    this.dom.editDailyQuota.value = shop.dailyOrderCap || 150;
    this.dom.manageAgentTokenText.value = shop.agentToken || '---';

    const statusRadios = document.querySelectorAll('input[name="shopStatusRadio"]');
    statusRadios.forEach(r => {
      r.checked = (r.value === 'ACTIVE' && shop.isActive !== false) || (r.value === 'INACTIVE' && shop.isActive === false);
    });

    this.dom.modalManageShop.classList.add('open');
  }

  /**
   * Saves updated tenant shop settings (Tier, Quota, Status)
   */
  async handleUpdateShopSubmit(e) {
    e.preventDefault();
    if (!this.selectedShopForManage) return;

    const tier = this.dom.editSubscriptionTier.value;
    const dailyCap = parseInt(this.dom.editDailyQuota.value, 10);
    const activeRadio = document.querySelector('input[name="shopStatusRadio"]:checked');
    const isActive = activeRadio ? activeRadio.value === 'ACTIVE' : true;

    this.dom.btnSubmitManageShop.disabled = true;
    this.dom.btnSubmitManageShop.textContent = 'Saving...';

    try {
      const res = await fetch('/api/create-order?action=adminUpdateShop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-master-key': this.masterKey
        },
        body: JSON.stringify({
          shopId: this.selectedShopForManage.shopId,
          subscriptionTier: tier,
          dailyOrderCap: dailyCap,
          isActive
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Update failed.');

      this.showAlert(`Shop ${this.selectedShopForManage.shopId} updated successfully.`, 'success');
      this.dom.modalManageShop.classList.remove('open');
      await this.loadPlatformData();
    } catch (err) {
      alert(`Error updating shop: ${err.message}`);
    } finally {
      this.dom.btnSubmitManageShop.disabled = false;
      this.dom.btnSubmitManageShop.textContent = '💾 Save Changes';
    }
  }

  /**
   * Regenerates Windows Agent secret token for a specific tenant shop
   */
  async regenerateAgentTokenConfirm() {
    if (!this.selectedShopForManage) return;
    const shopId = this.selectedShopForManage.shopId;

    if (!confirm(`Warning: Regenerating the agent token for ${shopId} will immediately disconnect any active Windows print agent running on this token. Continue?`)) {
      return;
    }

    try {
      const res = await fetch('/api/create-order?action=adminRegenerateToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-master-key': this.masterKey
        },
        body: JSON.stringify({ shopId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Token regeneration failed.');

      this.dom.manageAgentTokenText.value = data.newToken;
      this.selectedShopForManage.agentToken = data.newToken;
      alert(`New Agent Token generated: ${data.newToken}`);
      await this.loadPlatformData();
    } catch (err) {
      alert(`Failed to regenerate token: ${err.message}`);
    }
  }

  async copyManageToken() {
    const token = this.dom.manageAgentTokenText.value;
    if (!token || token === '---') return;

    try {
      await navigator.clipboard.writeText(token);
      alert('Agent token copied to clipboard.');
    } catch {
      this.dom.manageAgentTokenText.select();
      document.execCommand('copy');
      alert('Agent token copied.');
    }
  }

  showAlert(msg, type = 'info') {
    if (!this.dom.adminGlobalAlert || !this.dom.adminGlobalAlertText) return;
    this.dom.adminGlobalAlertText.textContent = msg;
    this.dom.adminGlobalAlert.className = `alert alert-${type}`;
    this.dom.adminGlobalAlert.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  clearAlert() {
    if (this.dom.adminGlobalAlert) {
      this.dom.adminGlobalAlert.classList.add('hidden');
    }
  }
}

// Bootstrap Super Admin Cockpit
document.addEventListener('DOMContentLoaded', () => {
  window.AuraSuperAdmin = new SuperAdminCockpitApp();
});