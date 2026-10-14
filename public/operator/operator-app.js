/**
 * AURA PRINT PRO — MASTER OPERATOR DASHBOARD CONTROLLER
 * Owner: Sabir Ansari
 * 
 * Features:
 * - Shop profile & subscription state resolution (?shop=...)
 * - Real-time polling synchronization loop (3-second interval)
 * - Hardware telemetry tracker (Windows Agent heartbeat & printer status)
 * - Audio chime synthesizer & notification player on incoming orders
 * - Navigation tab coordinator (Queue, Sales Register, Settings)
 * - Wires OperatorQueueManager, OperatorReportsManager & OperatorSettingsManager
 */

import { formatINR } from '/src/shared/formatters.js';
import { OperatorQueueManager } from './operator-queue.js';
import { OperatorReportsManager } from './operator-reports.js';
import { OperatorSettingsManager } from './operator-settings.js';

class OperatorDashboardApp {
  constructor() {
    this.shopId = this.resolveShopId();
    this.shopData = null;
    this.activeTab = 'QUEUE'; // 'QUEUE', 'HISTORY', 'SETTINGS'

    // Polling & sync state
    this.pollTimer = null;
    this.isPolling = false;
    this.lastKnownOrderIds = new Set();
    this.isAudioEnabled = true;

    // Sub-module managers
    this.queueManager = null;
    this.reportsManager = null;
    this.settingsManager = null;

    this.cacheDom();
    this.init();
  }

  resolveShopId() {
    const params = new URLSearchParams(window.location.search);
    const shop = params.get('shop') || localStorage.getItem('aura_operator_shop') || 'demo';
    localStorage.setItem('aura_operator_shop', shop.toLowerCase().trim());
    return shop.toLowerCase().trim();
  }

  cacheDom() {
    this.dom = {
      shopNameTitle: document.getElementById('shopNameTitle'),
      shopSlugText: document.getElementById('shopSlugText'),
      viewKioskLink: document.getElementById('viewKioskLink'),
      subscriptionTierBadge: document.getElementById('subscriptionTierBadge'),
      agentStatusCard: document.getElementById('agentStatusCard'),
      agentStatusText: document.getElementById('agentStatusText'),
      printerStatusCard: document.getElementById('printerStatusCard'),
      printerNameText: document.getElementById('printerNameText'),
      btnAudioToggle: document.getElementById('btnAudioToggle'),
      audioIcon: document.getElementById('audioIcon'),
      audioIncomingOrder: document.getElementById('audioIncomingOrder'),
      operatorBannerAlert: document.getElementById('operatorBannerAlert'),
      operatorBannerText: document.getElementById('operatorBannerText'),
      metricActiveQueueCount: document.getElementById('metricActiveQueueCount'),
      metricTodayTotalRevenue: document.getElementById('metricTodayTotalRevenue'),
      metricTodayOrderCount: document.getElementById('metricTodayOrderCount'),
      metricTodayUpiRevenue: document.getElementById('metricTodayUpiRevenue'),
      metricTodayUpiCount: document.getElementById('metricTodayUpiCount'),
      metricTodayCashRevenue: document.getElementById('metricTodayCashRevenue'),
      metricTodayCashCount: document.getElementById('metricTodayCashCount'),
      tabBtnQueue: document.getElementById('tabBtnQueue'),
      tabBtnHistory: document.getElementById('tabBtnHistory'),
      tabBtnSettings: document.getElementById('tabBtnSettings'),
      tabContentQueue: document.getElementById('tabContentQueue'),
      tabContentHistory: document.getElementById('tabContentHistory'),
      tabContentSettings: document.getElementById('tabContentSettings'),
      queueBadgeCount: document.getElementById('queueBadgeCount')
    };
  }

  async init() {
    this.bindGlobalEvents();
    this.setupAudioContext();

    // Initialize Sub-module Managers
    this.queueManager = new OperatorQueueManager({
      shopId: this.shopId,
      onOrderStateChanged: () => this.syncDashboardData(true)
    });

    this.reportsManager = new OperatorReportsManager({
      shopId: this.shopId
    });

    this.settingsManager = new OperatorSettingsManager({
      shopId: this.shopId,
      onSettingsSaved: (updatedShop) => {
        this.shopData = updatedShop;
        this.renderShopHeader();
      }
    });

    // Initial Data Fetch
    await this.loadInitialShopProfile();
    await this.syncDashboardData(false);

    // Start background polling loop (3-second interval)
    this.startPollingLoop();
  }

  bindGlobalEvents() {
    // Audio alert toggle
    if (this.dom.btnAudioToggle) {
      this.dom.btnAudioToggle.addEventListener('click', () => {
        this.isAudioEnabled = !this.isAudioEnabled;
        if (this.isAudioEnabled) {
          this.dom.btnAudioToggle.classList.remove('btn-outline');
          this.dom.btnAudioToggle.classList.add('btn-secondary');
          this.dom.audioIcon.textContent = '🔔';
          this.dom.btnAudioToggle.innerHTML = '<span id="audioIcon">🔔</span> Sound ON';
          this.playOrderChime(); // Audio cue
        } else {
          this.dom.btnAudioToggle.classList.remove('btn-secondary');
          this.dom.btnAudioToggle.classList.add('btn-outline');
          this.dom.btnAudioToggle.innerHTML = '<span id="audioIcon">🔕</span> Sound MUTED';
        }
      });
    }

    // Expose global tab switcher to window for onclick attributes
    window.switchOperatorTab = (tabKey) => this.switchTab(tabKey);
  }

  setupAudioContext() {
    // Web Audio synthesizer fallback in case audio asset is blocked or missing
    this.audioCtx = null;
    const unlockAudio = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext && !this.audioCtx) {
          this.audioCtx = new AudioContext();
        }
      } catch {
        // Ignored
      }
      window.removeEventListener('click', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
  }

  playOrderChime() {
    if (!this.isAudioEnabled) return;

    // Try HTML5 Audio element first
    const audioElem = this.dom.audioIncomingOrder;
    if (audioElem && audioElem.play) {
      audioElem.currentTime = 0;
      audioElem.play().catch(() => {
        this.synthesizeChimeBeep();
      });
    } else {
      this.synthesizeChimeBeep();
    }
  }

  synthesizeChimeBeep() {
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      // Pleasant double-bell ping (880Hz then 1320Hz)
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.12);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch {
      // Audio autoplay policy blocked
    }
  }

  async loadInitialShopProfile() {
    try {
      const res = await fetch(`/api/create-order?action=getShop&shopId=${encodeURIComponent(this.shopId)}`);
      if (res.ok) {
        const data = await res.json();
        this.shopData = data.shop;
      } else {
        // Fallback for new / demo shop initialization
        this.shopData = {
          shopId: this.shopId,
          shopName: `${this.shopId.toUpperCase()} Printing Hub`,
          upiId: 'sabirprint@okaxis',
          subscriptionTier: 'GROWTH',
          rates: {
            bwSingle: 2,
            bwDuplex: 3,
            colorSingle: 10,
            colorDuplex: 16,
            passportSheet4x6: 30,
            passportSheetA4: 50
          }
        };
      }
    } catch {
      this.shopData = {
        shopId: this.shopId,
        shopName: 'AURA Print Pro Counter',
        upiId: 'sabirprint@okaxis',
        subscriptionTier: 'GROWTH'
      };
    }

    this.renderShopHeader();
    this.settingsManager.populateForm(this.shopData);
  }

  renderShopHeader() {
    if (!this.shopData) return;

    if (this.dom.shopNameTitle) {
      this.dom.shopNameTitle.textContent = this.shopData.shopName || 'Shop Operator';
    }
    if (this.dom.shopSlugText) {
      this.dom.shopSlugText.textContent = this.shopData.shopId || this.shopId;
    }
    if (this.dom.subscriptionTierBadge) {
      this.dom.subscriptionTierBadge.textContent = (this.shopData.subscriptionTier || 'GROWTH').toUpperCase();
    }
    if (this.dom.viewKioskLink) {
      this.dom.viewKioskLink.href = `/kiosk.html?shop=${encodeURIComponent(this.shopId)}`;
    }
  }

  startPollingLoop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (!document.hidden) {
        this.syncDashboardData(false);
      }
    }, 3000);
  }

  /**
   * Primary polling and data synchronization cycle.
   * Fetches pending verifications, print queue items, telemetry, and metrics.
   * 
   * @param {boolean} forceSoundMute - true during user actions to prevent self-chime
   */
  async syncDashboardData(forceSoundMute = false) {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const res = await fetch(`/api/create-order?action=operatorSync&shopId=${encodeURIComponent(this.shopId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      
      // 1. Process Hardware & Windows Agent Telemetry
      this.renderTelemetry(data.telemetry || {});

      // 2. Detect New Incoming Orders for Audio Chime
      const incomingPending = data.pendingOrders || [];
      const incomingPrintable = data.printQueue || [];
      const currentIds = new Set([
        ...incomingPending.map(o => o.orderId),
        ...incomingPrintable.map(o => o.orderId)
      ]);

      if (!forceSoundMute && this.lastKnownOrderIds.size > 0) {
        let hasNew = false;
        currentIds.forEach(id => {
          if (!this.lastKnownOrderIds.has(id)) {
            hasNew = true;
          }
        });
        if (hasNew) {
          this.playOrderChime();
        }
      }
      this.lastKnownOrderIds = currentIds;

      // 3. Delegate to Queue Manager
      this.queueManager.renderQueueLists({
        pendingOrders: incomingPending,
        printQueue: incomingPrintable
      });

      // 4. Update Header Badge Count
      const totalActive = incomingPending.length + incomingPrintable.length;
      if (this.dom.queueBadgeCount) {
        this.dom.queueBadgeCount.textContent = totalActive;
      }
      if (this.dom.metricActiveQueueCount) {
        this.dom.metricActiveQueueCount.textContent = totalActive;
      }

      // 5. Update Metrics Cards
      this.renderDailyMetrics(data.metrics || {});

      // 6. If history tab is active, refresh table
      if (this.activeTab === 'HISTORY') {
        this.reportsManager.refreshHistoryData();
      }

    } catch (err) {
      console.warn('[OperatorApp] Sync warning:', err.message);
      this.renderAgentOffline();
    } finally {
      this.isPolling = false;
    }
  }

  renderTelemetry(telemetry) {
    const isAgentOnline = Boolean(telemetry.isAgentOnline);
    const printerName = telemetry.activePrinterName || 'Windows Spooler';

    if (this.dom.agentStatusCard) {
      this.dom.agentStatusCard.className = `telemetry-item ${isAgentOnline ? 'status-online' : 'status-offline'}`;
    }
    if (this.dom.agentStatusText) {
      this.dom.agentStatusText.textContent = isAgentOnline ? 'Online (Connected)' : 'Offline (Disconnected)';
    }

    if (this.dom.printerNameText) {
      this.dom.printerNameText.textContent = printerName;
    }
  }

  renderAgentOffline() {
    if (this.dom.agentStatusCard) {
      this.dom.agentStatusCard.className = 'telemetry-item status-offline';
    }
    if (this.dom.agentStatusText) {
      this.dom.agentStatusText.textContent = 'Disconnected';
    }
  }

  renderDailyMetrics(metrics) {
    const totalRev = Number(metrics.todayTotalRevenue || 0);
    const completedCount = Number(metrics.todayCompletedOrders || 0);
    const upiRev = Number(metrics.todayUpiRevenue || 0);
    const upiCount = Number(metrics.todayUpiCount || 0);
    const cashRev = Number(metrics.todayCashRevenue || 0);
    const cashCount = Number(metrics.todayCashCount || 0);

    if (this.dom.metricTodayTotalRevenue) this.dom.metricTodayTotalRevenue.textContent = formatINR(totalRev);
    if (this.dom.metricTodayOrderCount) this.dom.metricTodayOrderCount.textContent = `${completedCount} Completed`;

    if (this.dom.metricTodayUpiRevenue) this.dom.metricTodayUpiRevenue.textContent = formatINR(upiRev);
    if (this.dom.metricTodayUpiCount) this.dom.metricTodayUpiCount.textContent = `${upiCount} Received`;

    if (this.dom.metricTodayCashRevenue) this.dom.metricTodayCashRevenue.textContent = formatINR(cashRev);
    if (this.dom.metricTodayCashCount) this.dom.metricTodayCashCount.textContent = `${cashCount} Collected`;
  }

  switchTab(tabKey) {
    this.activeTab = tabKey;

    const tabs = [
      { key: 'QUEUE', btn: this.dom.tabBtnQueue, content: this.dom.tabContentQueue },
      { key: 'HISTORY', btn: this.dom.tabBtnHistory, content: this.dom.tabContentHistory },
      { key: 'SETTINGS', btn: this.dom.tabBtnSettings, content: this.dom.tabContentSettings }
    ];

    tabs.forEach(t => {
      if (t.key === tabKey) {
        t.btn.classList.add('active');
        t.content.classList.remove('hidden');
      } else {
        t.btn.classList.remove('active');
        t.content.classList.add('hidden');
      }
    });

    if (tabKey === 'HISTORY') {
      this.reportsManager.loadHistory();
    }
  }
}

// Bootstrap Operator Dashboard
document.addEventListener('DOMContentLoaded', () => {
  window.AuraOperatorApp = new OperatorDashboardApp();
});
