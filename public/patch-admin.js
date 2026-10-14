window.process = {
  env: {
    NODE_ENV: 'production',
    AURA_MASTER_SECRET: 'aura_super_master_sec_2026',
    JWT_SECRET: 'aura_jwt_shop_secret_key_2026',
    FIREBASE_PROJECT_ID: 'aura-print-pro',
    FIREBASE_STORAGE_BUCKET: 'aura-print-pro.firebasestorage.app'
  }
};
localStorage.setItem('AURA_MASTER_SECRET', 'aura_super_master_sec_2026');
sessionStorage.setItem('AURA_MASTER_SECRET', 'aura_super_master_sec_2026');

document.addEventListener('DOMContentLoaded', () => {
  // Master modal ko bina container delete kiye smoothly hide karna
  document.querySelectorAll('div, section').forEach(el => {
    if (el.innerText && el.innerText.includes('Master Admin Access') && el.querySelector('button') && !el.querySelector('table')) {
      el.style.display = 'none';
    }
  });

  // 4 metrics ko modern dashboard grid cards me convert karna
  document.querySelectorAll('div, section').forEach(el => {
    if (el.innerText && el.innerText.includes('Active Shops') && el.innerText.includes('Est. SaaS MRR')) {
      el.style.display = 'grid';
      el.style.gridTemplateColumns = 'repeat(auto-fit, minmax(150px, 1fr))';
      el.style.gap = '12px';
      el.style.margin = '16px 0';
      Array.from(el.children).forEach(child => {
        child.style.background = '#ffffff';
        child.style.border = '1px solid #e2e8f0';
        child.style.borderRadius = '12px';
        child.style.padding = '14px';
        child.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
      });
    }
  });

  // Shop registration popup
  function openRegisterModal() {
    let modal = document.getElementById('aura-shop-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-shop-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.75);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
      modal.innerHTML = `
        <div style="background:#ffffff;border-radius:16px;padding:24px;max-width:400px;width:100%;box-shadow:0 20px 40px rgba(0,0,0,0.25);font-family:sans-serif;color:#0f172a;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;font-size:1.2rem;font-weight:700;">🏪 Register New Shop</h3>
            <button id="aura-close-x" style="background:none;border:none;font-size:1.6rem;color:#64748b;cursor:pointer;">&times;</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">Shop Name (दुकान का नाम)</label>
              <input id="aura-inp-name" placeholder="e.g. Sabir Xerox Center" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">Shop Code (Customer yahi code daalega)</label>
              <input id="aura-inp-code" placeholder="e.g. shop1" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
            </div>
            <div style="display:flex;gap:10px;">
              <div style="flex:1;">
                <label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">B&W Rate (₹)</label>
                <input id="aura-inp-bw" type="number" value="2" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
              </div>
              <div style="flex:1;">
                <label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">Color Rate (₹)</label>
                <input id="aura-inp-color" type="number" value="10" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
              </div>
            </div>
            <button id="aura-inp-submit" style="margin-top:10px;background:#2563eb;color:#ffffff;border:none;padding:12px;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;">✅ Save & Activate Shop</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('aura-close-x').onclick = () => modal.style.display = 'none';
      document.getElementById('aura-inp-submit').onclick = () => {
        const name = document.getElementById('aura-inp-name').value.trim() || 'Sabir Xerox Center';
        const code = (document.getElementById('aura-inp-code').value.trim() || 'shop1').toLowerCase().replace(/[^a-z0-9]/g, '');
        const bw = document.getElementById('aura-inp-bw').value || '2';
        const color = document.getElementById('aura-inp-color').value || '10';

        let list = JSON.parse(localStorage.getItem('aura_shops') || '[]');
        list = list.filter(s => s.code !== code);
        list.push({ code, name, bw, color, status: 'Active' });
        localStorage.setItem('aura_shops', JSON.stringify(list));

        modal.style.display = 'none';
        renderShops();
        alert('Dukaan kamyabi se ban gayi! Code: ' + code);
      };
    }
    modal.style.display = 'flex';
  }

  function renderShops() {
    const list = JSON.parse(localStorage.getItem('aura_shops') || '[]');
    let container = document.getElementById('aura-injected-shops');
    if (!container) {
      container = document.createElement('div');
      container.id = 'aura-injected-shops';
      container.style.marginTop = '16px';
      const searchBox = document.querySelector('input[placeholder*="Search"]');
      if (searchBox && searchBox.closest('div')) {
        searchBox.closest('div').parentElement.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
    }
    if (list.length === 0) {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:#64748b;font-size:0.9rem;">Koi dukaan add nahi hai. Upar "+ Register New Shop" par tap karein.</div>';
      return;
    }
    container.innerHTML = list.map(s => `
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div>
          <div style="font-weight:700;color:#0f172a;font-size:1rem;">${s.name}</div>
          <div style="font-size:0.85rem;color:#2563eb;font-weight:600;margin-top:2px;">Code: ${s.code}</div>
          <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">B&W: ₹${s.bw} | Color: ₹${s.color}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <a href="/kiosk.html?shop=${s.code}" target="_blank" style="background:#2563eb;color:#ffffff;padding:8px 12px;border-radius:8px;text-decoration:none;font-size:0.85rem;font-weight:600;">Kiosk</a>
          <a href="/operator.html?shop=${s.code}" target="_blank" style="background:#0f172a;color:#ffffff;padding:8px 12px;border-radius:8px;text-decoration:none;font-size:0.85rem;font-weight:600;">Operator</a>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('*').forEach(el => {
      if (el.innerText && el.innerText.includes('Active Shops') && el.parentElement) {
        const c = el.parentElement.querySelector('h2, h3, div, p');
        if (c) c.innerText = `${list.length} Active / 0 Inactive`;
      }
    });
  }

  // Buttons ko bind karna
  document.querySelectorAll('button, a').forEach(btn => {
    const txt = btn.innerText || '';
    if (txt.includes('Register New Shop') || txt.includes('New Shop')) {
      btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openRegisterModal(); };
    }
    if (txt.includes('Refresh Metrics')) {
      btn.onclick = (e) => { e.preventDefault(); renderShops(); };
    }
  });

  renderShops();
});
