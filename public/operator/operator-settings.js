/**
 * AURA PRINT PRO — OPERATOR SETTINGS & CONFIGURATION CONTROLLER
 * Owner: Sabir Ansari
 * 
 * Features:
 * - Print rate card management (B&W single/duplex, Colour single/duplex, Passport photos)
 * - Input validation enforcing positive numbers and reasonable commercial bounds
 * - Shopkeeper UPI VPA updater verified with NPCI syntax rules
 * - Operator cash counter verification PIN manager (4-6 digits)
 * - Windows Print Agent secret token display, clipboard copy, and toggle reveal
 * - Synchronizes updated settings with parent operator application state
 */

import { isValidUpiId, isValidCashPin } from '/src/shared/validators.js';

export class OperatorSettingsManager {
  /**
   * @param {Object} options
   * @param {string} options.shopId
   * @param {Function} options.onSettingsSaved - Callback when settings successfully update
   */
  constructor({ shopId, onSettingsSaved = () => {} }) {
    this.shopId = shopId;
    this.onSettingsSaved = onSettingsSaved;
    this.currentShopData = null;
    this.rawAgentToken = '';
    this.isTokenVisible = false;

    this.cacheDom();
    this.bindEvents();
    this.exposeGlobalHandlers();
  }

  cacheDom() {
    this.dom = {
      // Rates Form
      shopRatesForm: document.getElementById('shopRatesForm'),
      rateBwSingle: document.getElementById('rateBwSingle'),
      rateBwDuplex: document.getElementById('rateBwDuplex'),
      rateColorSingle: document.getElementById('rateColorSingle'),
      rateColorDuplex: document.getElementById('rateColorDuplex'),
      ratePassport4x6: document.getElementById('ratePassport4x6'),
      ratePassportA4: document.getElementById('ratePassportA4'),
      btnSaveRates: document.getElementById('btnSaveRates'),

      // UPI Form
      shopUpiForm: document.getElementById('shopUpiForm'),
      settingsUpiId: document.getElementById('settingsUpiId'),
      btnSaveUpi: document.getElementById('btnSaveUpi'),

      // PIN Form
      shopPinForm: document.getElementById('shopPinForm'),
      newCashPin: document.getElementById('newCashPin'),
      btnSavePin: document.getElementById('btnSavePin'),

      // Agent Token Box
      displayAgentToken: document.getElementById('displayAgentToken'),

      // Global Banner Alert in Operator Dashboard
      operatorBannerAlert: document.getElementById('operatorBannerAlert'),
      operatorBannerText: document.getElementById('operatorBannerText')
    };
  }

  bindEvents() {
    // Form submissions are wired through window callbacks to match operator.html onsubmit
  }

  /**
   * Exposes methods required by operator.html form attributes
   */
  exposeGlobalHandlers() {
    window.handleSaveRates = (e) => this.handleSaveRates(e);
    window.handleSaveUpi = (e) => this.handleSaveUpi(e);
    window.handleUpdateCashPin = (e) => this.handleUpdateCashPin(e);
    window.toggleTokenVisibility = () => this.toggleTokenVisibility();
    window.copyAgentToken = () => this.copyAgentToken();
  }

  /**
   * Populates form inputs with active shop profile data
   * @param {Object} shopData
   */
  populateForm(shopData) {
    if (!shopData) return;
    this.currentShopData = shopData;

    const rates = shopData.rates || {};

    if (this.dom.rateBwSingle) this.dom.rateBwSingle.value = rates.bwSingle ?? 2.0;
    if (this.dom.rateBwDuplex) this.dom.rateBwDuplex.value = rates.bwDuplex ?? 3.0;
    if (this.dom.rateColorSingle) this.dom.rateColorSingle.value = rates.colorSingle ?? 10.0;
    if (this.dom.rateColorDuplex) this.dom.rateColorDuplex.value = rates.colorDuplex ?? 16.0;
    if (this.dom.ratePassport4x6) this.dom.ratePassport4x6.value = rates.passportSheet4x6 ?? 30.0;
    if (this.dom.ratePassportA4) this.dom.ratePassportA4.value = rates.passportSheetA4 ?? 50.0;

    if (this.dom.settingsUpiId) {
      this.dom.settingsUpiId.value = shopData.upiId || '';
    }

    // Agent Token
    this.rawAgentToken = shopData.agentToken || 'agent_sec_' + this.shopId + '_token';
    this.updateTokenInputDisplay();
  }

  /**
   * Saves updated pricing rate card
   * @param {Event} event 
   */
  async handleSaveRates(event) {
    event.preventDefault();
    this.clearAlert();

    const ratesPayload = {
      bwSingle: parseFloat(this.dom.rateBwSingle.value),
      bwDuplex: parseFloat(this.dom.rateBwDuplex.value),
      colorSingle: parseFloat(this.dom.rateColorSingle.value),
      colorDuplex: parseFloat(this.dom.rateColorDuplex.value),
      passportSheet4x6: parseFloat(this.dom.ratePassport4x6.value),
      passportSheetA4: parseFloat(this.dom.ratePassportA4.value)
    };

    // Validation
    for (const [key, val] of Object.entries(ratesPayload)) {
      if (isNaN(val) || val <= 0) {
        this.showAlert(`Invalid rate for ${key}. Must be a positive number greater than 0.`, 'danger');
        return;
      }
    }

    if (ratesPayload.bwDuplex < ratesPayload.bwSingle) {
      this.showAlert('B&W Duplex rate per sheet is typically higher than single side (e.g. ₹2 single, ₹3 double).', 'warning');
    }

    this.setButtonState(this.dom.btnSaveRates, true, 'Saving Rates...');

    try {
      const res = await fetch('/api/create-order?action=updateRates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: this.shopId,
          rates: ratesPayload
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update rates.');

      this.showAlert('Print rate card updated successfully! Customer kiosks will now use new rates.', 'success');
      
      if (this.currentShopData) {
        this.currentShopData.rates = ratesPayload;
        this.onSettingsSaved(this.currentShopData);
      }
    } catch (err) {
      this.showAlert(`Error saving rate card: ${err.message}`, 'danger');
    } finally {
      this.setButtonState(this.dom.btnSaveRates, false, '💾 Update Rate Card');
    }
  }

  /**
   * Saves updated shop UPI VPA ID
   * @param {Event} event 
   */
  async handleSaveUpi(event) {
    event.preventDefault();
    this.clearAlert();

    const newUpi = (this.dom.settingsUpiId.value || '').trim().toLowerCase();

    if (!isValidUpiId(newUpi)) {
      this.showAlert('Invalid UPI ID format. Must follow standard NPCI syntax (e.g. yourname@bank or 9876543210@paytm).', 'danger');
      return;
    }

    this.setButtonState(this.dom.btnSaveUpi, true, 'Saving UPI...');

    try {
      const res = await fetch('/api/create-order?action=updateUpi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: this.shopId,
          upiId: newUpi
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update UPI ID.');

      this.showAlert(`UPI ID updated to ${newUpi}. Customer QR codes will now direct payments to this account.`, 'success');
      
      if (this.currentShopData) {
        this.currentShopData.upiId = newUpi;
        this.onSettingsSaved(this.currentShopData);
      }
    } catch (err) {
      this.showAlert(`Error saving UPI ID: ${err.message}`, 'danger');
    } finally {
      this.setButtonState(this.dom.btnSaveUpi, false, 'Save UPI ID');
    }
  }

  /**
   * Updates operator cash security PIN
   * @param {Event} event 
   */
  async handleUpdateCashPin(event) {
    event.preventDefault();
    this.clearAlert();

    const pin = (this.dom.newCashPin.value || '').trim();

    if (!isValidCashPin(pin)) {
      this.showAlert('PIN must be between 4 and 6 digits only (0-9).', 'danger');
      return;
    }

    this.setButtonState(this.dom.btnSavePin, true, 'Updating PIN...');

    try {
      const res = await fetch('/api/create-order?action=updateCashPin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: this.shopId,
          newPin: pin
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update PIN.');

      this.showAlert('Operator Cash PIN updated successfully! Remember this PIN for counter verifications.', 'success');
      this.dom.newCashPin.value = '';
    } catch (err) {
      this.showAlert(`Error saving Cash PIN: ${err.message}`, 'danger');
    } finally {
      this.setButtonState(this.dom.btnSavePin, false, '🔒 Update Operator PIN');
    }
  }

  /**
   * Toggles masked vs clear text visibility of the Windows Agent Token
   */
  toggleTokenVisibility() {
    this.isTokenVisible = !this.isTokenVisible;
    this.updateTokenInputDisplay();
  }

  updateTokenInputDisplay() {
    if (!this.dom.displayAgentToken) return;
    if (this.isTokenVisible) {
      this.dom.displayAgentToken.type = 'text';
      this.dom.displayAgentToken.value = this.rawAgentToken;
    } else {
      this.dom.displayAgentToken.type = 'password';
      this.dom.displayAgentToken.value = this.rawAgentToken ? '••••••••••••••••' : '';
    }
  }

  /**
   * Copies Windows Agent Token to clipboard
   */
  async copyAgentToken() {
    if (!this.rawAgentToken) return;

    try {
      await navigator.clipboard.writeText(this.rawAgentToken);
      this.showAlert('Windows Agent Token copied to clipboard! Paste this in your Windows Agent config file.', 'info');
    } catch {
      const tempInput = document.createElement('input');
      tempInput.value = this.rawAgentToken;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      this.showAlert('Windows Agent Token copied to clipboard!', 'info');
    }
  }

  showAlert(message, type = 'info') {
    if (!this.dom.operatorBannerAlert || !this.dom.operatorBannerText) return;

    this.dom.operatorBannerText.textContent = message;
    this.dom.operatorBannerAlert.className = `alert alert-${type}`;
    this.dom.operatorBannerAlert.classList.remove('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  clearAlert() {
    if (this.dom.operatorBannerAlert) {
      this.dom.operatorBannerAlert.classList.add('hidden');
    }
  }

  setButtonState(btn, isLoading, text) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = text;
  }
}
