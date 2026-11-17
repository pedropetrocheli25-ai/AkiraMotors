// assets/js/admin/sistema-core.js
// Base compartida del sistema interno (Compras, Caja POS, Ventas).
// Script CLÁSICO (no módulo). Se carga en admin.html DESPUÉS del
// script principal y ANTES de compras.js, caja.js y ventas.js.
// Usa el SDK "compat" de Firebase ya cargado por admin.html.
(function () {
  'use strict';

  var AKS = window.AKS = window.AKS || {};

  // ----------------------------------------------------------
  // Utilidades
  // ----------------------------------------------------------
  function db() { return firebase.firestore(); }
  AKS.db = db;

  AKS.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  AKS.num = function (v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  };

  AKS.r2 = function (n) {
    return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
  };

  AKS.usd = function (n) {
    return '$' + (Number(n) || 0).toFixed(2);
  };

  AKS.bs = function (n) {
    return 'Bs. ' + (Number(n) || 0).toLocaleString('es-VE', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  AKS.dateKey = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) +
      '-' + pad(d.getDate());
  };

  AKS.fmtDateTime = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' +
      d.getFullYear() + ' ' + pad(d.getHours()) + ':' +
      pad(d.getMinutes());
  };

  AKS.fmtDate = function (key) {
    if (!key) return '';
    var p = String(key).split('-');
    if (p.length !== 3) return String(key);
    return p[2] + '/' + p[1] + '/' + p[0];
  };

  AKS.userLabel = function () {
    var u = firebase.auth().currentUser;
    return u ? (u.email || u.uid) : '';
  };

  AKS.norm = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim();
  };

  // ----------------------------------------------------------
  // Tasa BCV y ajustes (con caché corta)
  // ----------------------------------------------------------
  var rateCache = { value: 0, at: 0 };
  AKS.getRate = async function (force) {
    if (!force && rateCache.value &&
        Date.now() - rateCache.at < 60000) {
      return rateCache.value;
    }
    var snap = await db().collection('settings').doc('bcvRate').get();
    var v = snap.exists ? Number(snap.data().value) : 0;
    if (!(v > 0)) {
      throw new Error('Configura primero la tasa BCV en Configuración.');
    }
    rateCache = { value: v, at: Date.now() };
    return v;
  };

  var settingsCache = { data: null, at: 0 };
  AKS.getSettings = async function (force) {
    if (!force && settingsCache.data &&
        Date.now() - settingsCache.at < 60000) {
      return settingsCache.data;
    }
    var out = { ivaEnabled: true, companyName: 'AKIRA MOTORS' };
    try {
      var a = await db().collection('settings').doc('appSettings').get();
      if (a.exists && a.data().ivaEnabled === false) {
        out.ivaEnabled = false;
      }
    } catch (e) { console.error('appSettings:', e); }
    try {
      var s = await db().collection('settings').doc('siteConfig').get();
      if (s.exists && s.data().companyName) {
        out.companyName = s.data().companyName;
      }
    } catch (e) { console.error('siteConfig:', e); }
    settingsCache = { data: out, at: Date.now() };
    return out;
  };

  // ----------------------------------------------------------
  // Productos (copia liviana, sin imágenes)
  // ----------------------------------------------------------
  AKS.products = [];
  AKS.loadProducts = async function (force) {
    if (!force && AKS.products.length) return AKS.products;
    var snap = await db().collection('products').get();
    var list = [];
    snap.forEach(function (d) {
      var p = d.data();
      var attrs = p.attributes || {};
      list.push({
        id: d.id,
        code: p.code || '',
        name: p.name || '',
        brand: p.brand || '',
        category: p.category || '',
        partNumber: attrs.partNumber || '',
        searchTerms: p.searchTerms || '',
        price: Number(p.price) || 0,
        discount: Number(p.discount) || 0,
        stock: Number(p.stock) || 0,
        minStock: (p.minStock === null || p.minStock === undefined || isNaN(Number(p.minStock))) ? 4 : Number(p.minStock),
        thumb: (typeof p.thumbnail === 'string' && p.thumbnail.length < 200000)
          ? p.thumbnail : ''
      });
    });
    list.sort(function (a, b) {
      return a.name.localeCompare(b.name, 'es');
    });
    AKS.products = list;
    return list;
  };

  // Precio efectivo (igual que la tienda): precio - descuento %
  AKS.effectivePrice = function (p) {
    var price = Number(p.price) || 0;
    var d = Number(p.discount) || 0;
    if (d > 0) price = price - (price * d / 100);
    return AKS.r2(price);
  };

  AKS.searchProducts = function (q, limit) {
    var nq = AKS.norm(q);
    if (!nq) return [];
    var tokens = nq.split(/\s+/).filter(Boolean);
    var res = [];
    AKS.products.forEach(function (p) {
      var code = AKS.norm(p.code);
      var hay = AKS.norm([
        p.code, p.name, p.brand, p.partNumber,
        p.searchTerms, p.category
      ].join(' '));
      var ok = tokens.every(function (t) { return hay.indexOf(t) !== -1; });
      if (!ok) return;
      var score = 3;
      if (code === nq) score = 0;
      else if (code.indexOf(nq) === 0) score = 1;
      else if (AKS.norm(p.name).indexOf(nq) === 0) score = 2;
      res.push({ p: p, score: score });
    });
    res.sort(function (a, b) {
      return a.score - b.score ||
        a.p.name.localeCompare(b.p.name, 'es');
    });
    return res.slice(0, limit || 12).map(function (x) { return x.p; });
  };

  // ----------------------------------------------------------
  // Kárdex: movimiento de stock (se usa dentro de transacciones)
  // ----------------------------------------------------------
  AKS.movement = function (tx, m) {
    tx.set(db().collection('stockMovements').doc(), {
      productId: m.productId,
      code: m.code || '',
      name: m.name || '',
      type: m.type,
      qty: m.qty,
      stockBefore: m.stockBefore,
      stockAfter: m.stockAfter,
      refType: m.refType || '',
      refId: m.refId || '',
      user: AKS.userLabel(),
      createdAt: new Date().toISOString()
    });
  };

  // ----------------------------------------------------------
  // Estilos
  // ----------------------------------------------------------
  var css =
    '.aks-grid{display:grid;grid-template-columns:1.1fr 1fr;' +
    'gap:1rem;align-items:start}' +
    '@media(max-width:980px){.aks-grid{grid-template-columns:1fr}}' +
    '.aks-search{width:100%;padding:.9rem;border:2px solid #ddd;' +
    'border-radius:10px;font-size:1.05rem}' +
    '.aks-search:focus{outline:none;border-color:var(--naranja)}' +
    '.aks-results{margin-top:.6rem;max-height:340px;overflow-y:auto}' +
    '.aks-result{display:flex;justify-content:space-between;' +
    'gap:.6rem;padding:.7rem;border:1px solid #eee;' +
    'border-radius:8px;margin-bottom:.4rem;cursor:pointer;' +
    'background:#fff;align-items:center}' +
    '.aks-result:hover{border-color:var(--naranja);background:#fff8f3}' +
    '.aks-result.off{opacity:.45;cursor:not-allowed}' +
    '.aks-result small{color:#777;display:block}' +
    '.aks-table{width:100%;border-collapse:collapse;font-size:.88rem}' +
    '.aks-table th{background:#f5f5f5;text-align:left;' +
    'padding:.5rem;font-size:.78rem;color:#555}' +
    '.aks-table td{padding:.5rem;border-bottom:1px solid #eee;' +
    'vertical-align:middle}' +
    '.aks-table input{width:90px;padding:.4rem;border:1px solid #ddd;' +
    'border-radius:6px;font-size:.9rem}' +
    '.aks-table input.qty{width:64px}' +
    '.aks-wrap{overflow-x:auto}' +
    '.aks-total{background:#111;color:#fff;border-radius:12px;' +
    'padding:1rem;margin:.8rem 0}' +
    '.aks-total .big{font-size:2rem;font-weight:800;' +
    'color:var(--naranja);line-height:1.1}' +
    '.aks-total .sub{font-size:1.15rem;color:#ddd}' +
    '.aks-row{display:flex;justify-content:space-between;' +
    'padding:.25rem 0;gap:1rem}' +
    '.aks-muted{color:#777;font-size:.82rem}' +
    '.aks-ok{color:#198754;font-weight:700}' +
    '.aks-bad{color:#dc3545;font-weight:700}' +
    '.aks-kpis{display:grid;grid-template-columns:' +
    'repeat(auto-fit,minmax(170px,1fr));gap:.8rem;margin-bottom:1rem}' +
    '.aks-kpi{background:#fff;border-radius:12px;padding:1rem;' +
    'box-shadow:0 2px 8px rgba(0,0,0,.05)}' +
    '.aks-kpi .v{font-size:1.5rem;font-weight:800;color:var(--naranja)}' +
    '.aks-kpi .l{font-size:.8rem;color:#666}' +
    '.aks-kpi .s{font-size:.78rem;color:#888;margin-top:.2rem}' +
    '.aks-bar{height:14px;background:#eee;border-radius:7px;' +
    'overflow:hidden}' +
    '.aks-bar i{display:block;height:100%;background:var(--naranja)}' +
    '.aks-inline{display:flex;gap:.5rem;flex-wrap:wrap;' +
    'align-items:flex-end}' +
    '.aks-inline .form-group{margin:0}' +
    '.aks-pill{display:inline-block;padding:.15rem .6rem;' +
    'border-radius:10px;font-size:.72rem;font-weight:700;' +
    'background:#eee;color:#444}' +
    '.aks-pill.void{background:#f8d7da;color:#721c24}' +
    '.aks-pill.ok{background:#d4edda;color:#155724}' +
    '.aks-detail{background:#fafafa;border-radius:8px;' +
    'padding:.7rem;margin-top:.5rem;font-size:.85rem}';

  function injectStyle() {
    if (document.getElementById('aks-style')) return;
    var st = document.createElement('style');
    st.id = 'aks-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ----------------------------------------------------------
  // Secciones y menú del admin
  // ----------------------------------------------------------
  AKS.addSection = function (id, html) {
    var host = document.querySelector('.admin-content');
    if (!host) return null;
    var existing = document.getElementById('section-' + id);
    if (existing) { existing.innerHTML = html; return existing; }
    var div = document.createElement('div');
    div.className = 'admin-section';
    div.id = 'section-' + id;
    div.innerHTML = html;
    host.appendChild(div);
    return div;
  };

  AKS.addMenuItem = function (label, sectionId, onOpen, group) {
    var menu = document.querySelector('.admin-menu');
    if (!menu) return null;
    var item = document.createElement('div');
    item.className = 'admin-menu-item';
    item.setAttribute('data-aks', sectionId);
    item.innerHTML = '<span>' + AKS.esc(label) + '</span>';
    item.addEventListener('click', function (ev) {
      if (typeof window.showSection === 'function') {
        window.showSection(sectionId, ev);
      }
      if (typeof onOpen === 'function') {
        try { onOpen(); }
        catch (e) { console.error('Error abriendo ' + sectionId, e); }
      }
    });
    // Dentro de su grupo (después de sus opciones), si el grupo existe
    var head = group ? menu.querySelector(
      '.admin-menu-group[data-g="' + group + '"]') : null;
    if (head) {
      var nxt = head.nextElementSibling;
      while (nxt && !nxt.classList.contains('admin-menu-group') &&
             (nxt.getAttribute('onclick') || '')
               .indexOf('logoutAdmin') === -1) {
        nxt = nxt.nextElementSibling;
      }
      menu.insertBefore(item, nxt);
      return item;
    }
    // Antes del botón "Salir", si existe; si no, al final
    var logout = null;
    var items = menu.querySelectorAll('.admin-menu-item');
    for (var i = 0; i < items.length; i++) {
      var oc = items[i].getAttribute('onclick') || '';
      if (oc.indexOf('logoutAdmin') !== -1) { logout = items[i]; }
    }
    if (logout) menu.insertBefore(item, logout);
    else menu.appendChild(item);
    return item;
  };

  AKS.init = function (fn) {
    function run() {
      injectStyle();
      try { fn(); }
      catch (e) { console.error('Error iniciando módulo:', e); }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  };

  // Después de cambiar productos, refrescar también las listas del admin
  AKS.refreshAdminProducts = function () {
    AKS.loadProducts(true).catch(function (e) { console.error(e); });
    if (typeof window.loadProducts === 'function') {
      try { window.loadProducts(); } catch (e) { /* ignorar */ }
    }
  };
})();
