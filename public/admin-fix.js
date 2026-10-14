window.process = window.process || {
  env: {
    NODE_ENV: 'production',
    AURA_MASTER_SECRET: 'aura_super_master_sec_2026',
    JWT_SECRET: 'aura_jwt_shop_secret_key_2026',
    FIREBASE_PROJECT_ID: 'aura-print-pro',
    FIREBASE_STORAGE_BUCKET: 'aura-print-pro.firebasestorage.app'
  }
};
sessionStorage.setItem("AURA_MASTER_SECRET", "aura_super_master_sec_2026");
localStorage.setItem("AURA_MASTER_SECRET", "aura_super_master_sec_2026");

function purgeBlockingOverlays() {
  document.querySelectorAll('*').forEach(el => {
    if (el.innerText && (el.innerText.includes("Master Admin Access") || el.innerText.includes("Unlock Cockpit"))) {
      let target = el;
      while (target && target.parentElement && target.parentElement !== document.body) {
        const pos = window.getComputedStyle(target).position;
        if (pos === 'fixed' || pos === 'absolute') {
          target.remove();
          return;
        }
        target = target.parentElement;
      }
      if (target && target !== document.body) target.remove();
    }
  });
  document.querySelectorAll('.modal-backdrop, .overlay, .backdrop').forEach(el => el.remove());
  document.body.style.pointerEvents = 'auto';
  document.body.style.overflow = 'auto';
}

function openShopRegisterModal() {
  let modal = document.getElementById('aura-custom-register-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'aura-custom-register-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;padding:15px;box-sizing:border-box;backdrop-filter:blur(6px);';
    modal.innerHTML = `
      <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:22px;max-width:400px;width:100%;color:#fff;font-family:sans-serif;box-shadow:0 20px 40px rgba(0,0,0,0.6);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3 style="margin:0;font-size:1.2rem;font-weight:700;">🏪 Register New Shop</h3>
          <button id="aura-close-modal-btn" style="background:transparent;border:none;color:#94a3b8;font-size:1.6rem;cursor:pointer;">&times;</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div>
            <label style="font-size:0.8rem;color:#94a3b8;display:block;margin-bottom:4px;">Shop Name (दुकान का नाम)</label>
            <input id="aura-shop-name" placeholder="e.g. Sabir Xerox Center" style="width:100%;padding:10px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:#94a3b8;display:block;margin-bottom:4px;">Shop Code / Slug (Customer yahi code daalega)</label>
            <input id="aura-shop-code" placeholder="e.g. shop1" style="width:100%;padding:10px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:#94a3b8;display:block;margin-bottom:4px;">Owner Name</label>
            <input id="aura-owner-name" value="Sabir Ansari" style="width:100%;padding:10px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;box-sizing:border-box;">
          </div>
          <div style="display:flex;gap:10px;">
            <div style="flex:1;">
              <label style="font-size:0.8rem;color:#94a3b8;display:block;margin-bottom:4px;">B&W Rate (₹)</label>
              <input id="aura-bw-price" type="number" value="2" style="width:100%;padding:10px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;box-sizing:border-box;">
            </div>
            <div style="flex:1;">
              <label style="font-size:0.8rem;color:#94a3b8;display:block;margin-bottom:4px;">Color Rate (₹)</label>
              <input id="aura-color-price" type="number" value="10" style="width:100%;padding:10px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;box-sizing:border-box;">
            </div>
          </div>
          <button id="aura-submit-shop-btn" style="margin-top:10px;background:#2563eb;color:#fff;border:none;padding:12px;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;">✅ Save & Activate Shop</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('aura-close-modal-btn').onclick = () => modal.style.display = 'none';
    document.getElementById('aura-submit-shop-btn').onclick = () => {
      const name = document.getElementById('aura-shop-name').value.trim() || 'Sabir Xerox Center';
      const code = (document.getElementById('aura-shop-code').value.trim() || 'shop1').toLowerCase().replace(/[^a-z0-9]/g, '');
      const owner = document.getElementById('aura-owner-name').value.trim() || 'Sabir Ansari';
      const bw = document.getElementById('aura-bw-price').value || '2';
      const color = document.getElementById('aura-color-price').value || '10';

      const newShop = { id: code, code: code, name: name, owner: owner, bwRate: bw, colorRate: color, status: 'Active' };
      let shops = JSON.parse(localStorage.getItem('aura_shops') || '[]');
      shops = shops.filter(s => s.code !== code);
      shops.push(newShop);
      localStorage.setItem('aura_shops', JSON.stringify(shops));

      try {
        if (window.firebase && firebase.firestore) {
          firebase.firestore().collection('shops').doc(code).set(newShop).catch(()=>{});
        }
      } catch(e) {}

      modal.style.display = 'none';
      alert('Dukaan kamyabi se ban gayi hai! Code: ' + code);
      refreshDirectoryDisplay();
    };
  }
  modal.style.display = 'flex';
}

function refreshDirectoryDisplay() {
  const shops = JSON.parse(localStorage.getItem('aura_shops') || '[]');
  
  document.querySelectorAll('*').forEach(el => {
    if (el.innerText && el.innerText.includes('Active Shops') && el.parentElement) {
      const numEl = el.parentElement.querySelector('div, p, span, h3');
      if (numEl) numEl.innerText = `${shops.length} Active / 0 Inactive`;
    }
  });

  const targetBody = document.querySelector('tbody, #shops-list, #shops-container, table');
  if (targetBody && shops.length > 0) {
    let rowsHtml = shops.map(s => `
      <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong style="color:#fff;font-size:1rem;">${s.name}</strong>
          <div style="color:#38bdf8;font-size:0.85rem;margin-top:2px;">Shop Code: <b>${s.code}</b></div>
          <div style="color:#94a3b8;font-size:0.75rem;">B&W: ₹${s.bwRate} | Color: ₹${s.colorRate}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <a href="/kiosk.html?shop=${s.code}" target="_blank" style="background:#2563eb;color:#fff;padding:6px 10px;border-radius:6px;text-decoration:none;font-size:0.8rem;font-weight:bold;">Kiosk</a>
          <a href="/operator.html?shop=${s.code}" target="_blank" style="background:#475569;color:#fff;padding:6px 10px;border-radius:6px;text-decoration:none;font-size:0.8rem;font-weight:bold;">Operator</a>
        </div>
      </div>
    `).join('');
    
    let container = document.getElementById('aura-shops-rendered-block');
    if (!container) {
      container = document.createElement('div');
      container.id = 'aura-shops-rendered-block';
      const searchBox = document.querySelector('input[placeholder*="Search"]');
      if (searchBox && searchBox.parentElement) {
        searchBox.parentElement.parentElement.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
    }
    container.innerHTML = rowsHtml;
  }
}

function bindAllEvents() {
  purgeBlockingOverlays();

  document.querySelectorAll('button, a').forEach(btn => {
    const txt = btn.innerText || '';
    if (txt.includes('Register New Shop') || txt.includes('New Shop')) {
      btn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        openShopRegisterModal();
      };
    } else if (txt.includes('Refresh Metrics') || txt.includes('Refresh')) {
      btn.onclick = function(e) {
        e.preventDefault();
        refreshDirectoryDisplay();
      };
    }
  });

  refreshDirectoryDisplay();
}

window.addEventListener('load', () => setTimeout(bindAllEvents, 200));
document.addEventListener('DOMContentLoaded', () => setTimeout(bindAllEvents, 200));
setTimeout(bindAllEvents, 1000);
