// assets/js/admin/caja.js
// Caja (punto de venta de mostrador): cuadrícula de productos a la
// izquierda, factura a la derecha, tickets A/B/C en paralelo.
// Precios en $, total automático en Bs con la tasa BCV. Sin IVA.
// Requiere sistema-core.js.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('caja.js: falta sistema-core.js'); return; }

  var MAX_LINES = 60;
  var MAX_TICKETS = 6;
  var GRID_LIMIT = 60;
  var METHODS = [
    { k: 'efectivo_usd', label: 'Efectivo $', cur: 'USD' },
    { k: 'zelle', label: 'Zelle $', cur: 'USD' },
    { k: 'efectivo_bs', label: 'Efectivo Bs', cur: 'VES' },
    { k: 'pago_movil', label: 'Pago móvil Bs', cur: 'VES' },
    { k: 'punto', label: 'Punto de venta Bs', cur: 'VES' },
    { k: 'transferencia', label: 'Transferencia Bs', cur: 'VES' }
  ];

  var tickets = [newTicket('A')];
  var cur = 0;
  var rate = 0;
  var settings = { companyName: 'AKIRA MOTORS' };
  var busy = false;
  var root = null;
  var todaySales = [];
  var mode = 'search';
  var favs = {};
  try { favs = JSON.parse(localStorage.getItem('aks_favs') || '{}') || {}; }
  catch (e) { favs = {}; }

  function newTicket(name) {
    return { name: name, cart: [], disc: '', cname: '', cphone: '', cdoc: '', clientId: '' };
  }
  function T() { return tickets[cur]; }
  function $(id) { return document.getElementById(id); }

  // ------------------------------------------------------------
  // Estilos propios de la caja
  // ------------------------------------------------------------
  var CSS =
    '.kpos{display:grid;grid-template-columns:44px minmax(0,1fr) 400px;' +
    'gap:0;background:#fff;border-radius:12px;overflow:hidden;' +
    'box-shadow:0 2px 12px rgba(0,0,0,.08);min-height:640px}' +
    '@media(max-width:1100px){.kpos{grid-template-columns:44px minmax(0,1fr)}' +
    '.kpos-right{grid-column:1 / -1;border-left:0!important;' +
    'border-top:1px solid #e5e5e5}}' +
    '.kpos-tabs{background:#fff;padding:.8rem .4rem;display:flex;' +
    'flex-direction:column;gap:.6rem;align-items:center}' +
    '.kpos-tab{width:30px;height:30px;border-radius:50%;border:0;' +
    'color:#fff;font-weight:700;cursor:pointer;opacity:.55;font-size:.85rem}' +
    '.kpos-tab.on{opacity:1;box-shadow:0 0 0 3px rgba(255,107,26,.35)}' +
    '.kpos-tab.add{background:#eee;color:#555;opacity:1}' +
    '.kpos-left{background:#eef2f6;padding:.8rem;min-width:0}' +
    '.kpos-bar{display:flex;gap:.6rem;align-items:center;margin-bottom:.8rem}' +
    '.kpos-search{display:flex;flex:1;background:#fff;border-radius:8px;' +
    'overflow:hidden;border:1px solid #dfe5ec;min-width:0}' +
    '.kpos-mode{border:0;background:#f1f1f1;padding:.55rem .8rem;' +
    'cursor:pointer;font-size:.8rem;font-weight:700;color:#444}' +
    '.kpos-mode.on{background:#111;color:#fff}' +
    '.kpos-search input{flex:1;border:0;padding:.65rem .8rem;font-size:1rem;' +
    'outline:none;min-width:0}' +
    '.kpos-new{border:1px solid #FF6B1A;background:#fff;color:#FF6B1A;' +
    'border-radius:8px;padding:.55rem .9rem;font-weight:700;cursor:pointer;' +
    'white-space:nowrap}' +
    '.kpos-grid{display:grid;grid-template-columns:' +
    'repeat(auto-fill,minmax(150px,1fr));gap:.8rem;max-height:600px;' +
    'overflow-y:auto;padding:.2rem}' +
    '.kpos-card{position:relative;background:#fff;border-radius:10px;' +
    'padding:1.6rem .6rem .7rem;text-align:center;cursor:pointer;' +
    'box-shadow:0 1px 4px rgba(0,0,0,.08);border:2px solid transparent;' +
    'display:flex;flex-direction:column;align-items:center;gap:.25rem}' +
    '.kpos-card:hover{border-color:#FF6B1A}' +
    '.kpos-card.off{opacity:.45}' +
    '.kpos-code{position:absolute;top:0;left:0;background:#f1f6f5;' +
    'color:#0f8f7e;font-size:.68rem;padding:.15rem .5rem;' +
    'border-radius:10px 0 8px 0;max-width:70%;overflow:hidden;' +
    'text-overflow:ellipsis;white-space:nowrap}' +
    '.kpos-star{position:absolute;top:0;right:0;width:26px;height:26px;' +
    'border:0;border-radius:0 10px 0 8px;background:#e8f6f3;color:#0f8f7e;' +
    'cursor:pointer;font-size:.95rem;line-height:1}' +
    '.kpos-star.on{background:#FF6B1A;color:#fff}' +
    '.kpos-img{width:84px;height:84px;object-fit:contain;border-radius:6px;' +
    'background:#fafafa;display:flex;align-items:center;' +
    'justify-content:center;color:#bbb;font-size:1.6rem;overflow:hidden}' +
    '.kpos-img img{width:100%;height:100%;object-fit:contain}' +
    '.kpos-inv{color:#0f8f7e;font-size:.72rem}' +
    '.kpos-inv.low{color:#dc3545}' +
    '.kpos-name{font-size:.85rem;color:#333;line-height:1.2;' +
    'max-height:2.4em;overflow:hidden}' +
    '.kpos-price{font-weight:800;color:#111}' +
    '.kpos-price small{display:block;font-weight:400;color:#888;font-size:.7rem}' +
    '.kpos-right{border-left:1px solid #e5e5e5;display:flex;' +
    'flex-direction:column;min-width:0;background:#fff}' +
    '.kpos-head{display:flex;justify-content:space-between;' +
    'align-items:center;padding:1rem 1.2rem .4rem}' +
    '.kpos-head h3{margin:0;font-size:1.15rem}' +
    '.kpos-fields{padding:.6rem 1.2rem;border-bottom:1px solid #eee;' +
    'display:grid;grid-template-columns:1fr 1fr;gap:.5rem}' +
    '.kpos-fields input{width:100%;padding:.5rem;border:1px solid #ddd;' +
    'border-radius:6px;font-size:.9rem}' +
    '.kpos-fields .full{grid-column:1 / -1}' +
    '.kpos-fields label{font-size:.72rem;color:#666;display:block}' +
    '.kpos-lines{flex:1;overflow-y:auto;padding:.4rem 1.2rem;' +
    'min-height:200px;max-height:380px}' +
    '.kpos-empty{text-align:center;color:#6b7280;padding:3rem 1rem}' +
    '.kpos-empty .ico{font-size:2.4rem;color:#9aa3ad}' +
    '.kpos-line{display:grid;grid-template-columns:1fr auto;gap:.3rem;' +
    'padding:.6rem 0;border-bottom:1px solid #f0f0f0;font-size:.88rem}' +
    '.kpos-line .ctl{display:flex;gap:.3rem;align-items:center;' +
    'margin-top:.3rem}' +
    '.kpos-line input{width:70px;padding:.3rem;border:1px solid #ddd;' +
    'border-radius:6px}' +
    '.kpos-line .qty{width:50px}' +
    '.kpos-line .rm{border:0;background:none;color:#dc3545;cursor:pointer;' +
    'font-size:1.1rem}' +
    '.kpos-tot{padding:.6rem 1.2rem;border-top:1px solid #eee;font-size:.9rem}' +
    '.kpos-tot .r{display:flex;justify-content:space-between;padding:.12rem 0}' +
    '.kpos-foot{padding:.8rem 1.2rem 1rem}' +
    '.kpos-sell{width:100%;display:flex;justify-content:space-between;' +
    'align-items:center;border:0;border-radius:8px;padding:.9rem 1rem;' +
    'background:#FF6B1A;color:#fff;font-weight:800;font-size:1.05rem;' +
    'cursor:pointer}' +
    '.kpos-sell:disabled{background:#c9ced6;cursor:not-allowed}' +
    '.kpos-sell small{display:block;font-weight:500;font-size:.75rem;' +
    'text-align:right}' +
    '.kpos-sub{display:flex;justify-content:space-between;margin-top:.5rem;' +
    'font-size:.82rem;color:#555}' +
    '.kpos-sub a{color:#0f8f7e;cursor:pointer}' +
    '.kpos-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);' +
    'z-index:5000;display:none;align-items:center;justify-content:center;' +
    'padding:1rem}' +
    '.kpos-modal.on{display:flex}' +
    '.kpos-box{background:#fff;border-radius:14px;padding:1.2rem;' +
    'width:100%;max-width:460px;max-height:92vh;overflow-y:auto}' +
    '.kpos-box h3{margin:0 0 .6rem}' +
    '.kpos-pay{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}' +
    '.kpos-pay label{font-size:.78rem;color:#555;display:block}' +
    '.kpos-pay input{width:100%;padding:.55rem;border:1px solid #ddd;' +
    'border-radius:6px}';

  function injectCss() {
    if ($('aks-caja-style')) return;
    var st = document.createElement('style');
    st.id = 'aks-caja-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function html() {
    var pay = METHODS.map(function (m) {
      return '<div><label>' + m.label + '</label>' +
        '<input type="number" min="0" step="0.01" data-pay="' + m.k +
        '" placeholder="0.00"></div>';
    }).join('');
    return '<h2 class="section-title">Caja</h2>' +
      '<div class="kpos">' +
      '<div class="kpos-tabs" id="aksK-tabs"></div>' +
      '<div class="kpos-left">' +
      '<div class="kpos-bar"><div class="kpos-search">' +
      '<button class="kpos-mode on" data-mode="search" title="Buscar por nombre">Buscar</button>' +
      '<button class="kpos-mode" data-mode="barcode" title="Lector de código de barras: Enter agrega el código exacto">||| Código</button>' +
      '<input type="text" id="aksK-search" placeholder="Buscar productos" ' +
      'autocomplete="off"></div>' +
      '<button class="kpos-new" id="aksK-new">+ Nuevo producto</button></div>' +
      '<div class="kpos-grid" id="aksK-grid"></div>' +
      '<div class="aks-muted" id="aksK-more" style="margin-top:.5rem"></div></div>' +
      '<div class="kpos-right">' +
      '<div class="kpos-head"><h3>Factura <span class="aks-muted" id="aksK-tname"></span></h3>' +
      '<div class="aks-muted" id="aksK-rate"></div></div>' +
      '<div class="kpos-fields">' +
      '<div class="full"><label>Cliente (escribe para buscar o registrar)</label>' +
      '<input type="text" id="aksK-cname" maxlength="80" placeholder="Consumidor final" ' +
      'autocomplete="off"><div id="aksK-cres" class="aks-results"></div></div>' +
      '<div><label>RIF / Cédula</label><input type="text" id="aksK-cdoc" maxlength="20" ' +
      'placeholder="V-12345678"></div>' +
      '<div><label>Teléfono</label><input type="tel" id="aksK-cphone" maxlength="11" ' +
      'placeholder="0412XXXXXXX"></div>' +
      '<div><label>Descuento %</label><input type="number" id="aksK-disc" ' +
      'min="0" max="100" step="0.5" placeholder="0"></div></div>' +
      '<div class="kpos-lines" id="aksK-lines"></div>' +
      '<div class="kpos-tot" id="aksK-tot"></div>' +
      '<div class="kpos-foot"><button class="kpos-sell" id="aksK-sell" disabled>' +
      '<span>Vender</span><span id="aksK-sellamt">$0.00</span></button>' +
      '<div class="kpos-sub"><span id="aksK-count">0 productos</span>' +
      '<a id="aksK-cancel">Cancelar</a></div></div></div></div>' +

      '<div class="kpos-modal" id="aksK-paymodal"><div class="kpos-box">' +
      '<h3>Cobrar</h3><div id="aksK-paytotals" class="aks-total"></div>' +
      '<div class="kpos-pay">' + pay + '</div>' +
      '<div id="aksK-paysum" style="margin:.7rem 0"></div>' +
      '<div class="aks-inline"><button class="btn btn-primary" id="aksK-charge">' +
      'Confirmar venta</button>' +
      '<button class="btn btn-secondary" id="aksK-payback">Volver</button></div>' +
      '</div></div>' +

      '<div class="admin-card" style="margin-top:1rem"><h3>Ventas de hoy</h3>' +
      '<div id="aksK-summary" class="aks-muted"></div>' +
      '<div id="aksK-list"></div></div>';
  }

  // ------------------------------------------------------------
  // Cálculos (sin IVA)
  // ------------------------------------------------------------
  function calc() {
    var sub = 0;
    T().cart.forEach(function (l) { sub += l.qty * l.unitPrice; });
    sub = AKS.r2(sub);
    var pct = Math.min(100, Math.max(0, AKS.num(T().disc)));
    var disc = AKS.r2(sub * pct / 100);
    var total = AKS.r2(sub - disc);
    return { sub: sub, pct: pct, disc: disc, total: total,
      totalBs: AKS.r2(total * rate) };
  }

  function payments() {
    var out = [], paidUsd = 0;
    METHODS.forEach(function (m) {
      var el = root.querySelector('[data-pay="' + m.k + '"]');
      var v = AKS.num(el.value);
      if (v > 0) {
        var usd = m.cur === 'USD' ? v : v / rate;
        out.push({ method: m.k, currency: m.cur, amount: AKS.r2(v),
          amountUsd: AKS.r2(usd) });
        paidUsd += usd;
      }
    });
    return { list: out, paidUsd: AKS.r2(paidUsd) };
  }

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  var TAB_COLORS = ['#1fa37a', '#9cb62b', '#0b5563', '#7a4fd1', '#d1624f', '#2f6fd1'];

  function renderTabs() {
    var h = tickets.map(function (t, i) {
      return '<button class="kpos-tab' + (i === cur ? ' on' : '') +
        '" data-tab="' + i + '" style="background:' + TAB_COLORS[i % 6] +
        '" title="Factura ' + t.name + '">' + t.name + '</button>';
    }).join('');
    if (tickets.length < MAX_TICKETS) {
      h += '<button class="kpos-tab add" data-tab="add" title="Nueva factura">+</button>';
    }
    $('aksK-tabs').innerHTML = h;
  }

  function renderGrid() {
    var q = $('aksK-search').value;
    var list;
    if (q.trim() && mode === 'search') list = AKS.searchProducts(q, 200);
    else if (q.trim()) list = AKS.searchProducts(q, 12);
    else list = AKS.products.slice();
    if (!q.trim()) {
      list.sort(function (a, b) {
        return (favs[b.id] ? 1 : 0) - (favs[a.id] ? 1 : 0) ||
          a.name.localeCompare(b.name, 'es');
      });
    }
    var total = list.length;
    list = list.slice(0, GRID_LIMIT);
    $('aksK-grid').innerHTML = list.length ? list.map(function (p) {
      var price = AKS.effectivePrice(p);
      var off = p.stock <= 0;
      return '<div class="kpos-card' + (off ? ' off' : '') + '" data-id="' +
        AKS.esc(p.id) + '"><span class="kpos-code">' + AKS.esc(p.code) + '</span>' +
        '<button class="kpos-star' + (favs[p.id] ? ' on' : '') +
        '" data-fav="' + AKS.esc(p.id) + '" title="Favorito">' +
        (favs[p.id] ? '★' : '☆') + '</button>' +
        '<div class="kpos-img">' + (p.thumb && /^(data:image|https:)/.test(p.thumb)
          ? '<img alt="" src="' + AKS.esc(p.thumb) + '">' : '&#9881;') + '</div>' +
        '<div class="kpos-inv' + (p.stock <= p.minStock ? ' low' : '') + '">Inv. ' + p.stock + '</div>' +
        '<div class="kpos-name">' + AKS.esc(p.name) + '</div>' +
        '<div class="kpos-price">' + AKS.usd(price) +
        '<small>' + AKS.bs(price * rate) + '</small></div></div>';
    }).join('') : '<div class="aks-muted" style="grid-column:1/-1;padding:2rem;text-align:center">' +
      'Sin productos' + (q ? ' para "' + AKS.esc(q) + '"' : '') + '</div>';
    $('aksK-more').textContent = total > GRID_LIMIT
      ? 'Mostrando ' + GRID_LIMIT + ' de ' + total + ' productos. Escribe para filtrar.' : '';
  }

  function renderTicket() {
    var t = T();
    $('aksK-tname').textContent = '(' + t.name + ')';
    $('aksK-rate').textContent = rate ? 'Tasa BCV ' + rate.toFixed(2) : '';
    if ($('aksK-cname') !== document.activeElement) $('aksK-cname').value = t.cname;
    if ($('aksK-cdoc') !== document.activeElement) $('aksK-cdoc').value = t.cdoc;
    if ($('aksK-cphone') !== document.activeElement) $('aksK-cphone').value = t.cphone;
    if ($('aksK-disc') !== document.activeElement) $('aksK-disc').value = t.disc;
    var box = $('aksK-lines');
    if (!t.cart.length) {
      box.innerHTML = '<div class="kpos-empty"><div class="ico">&#128722;</div>' +
        'Aquí vas a ver los productos que elijas para la venta</div>';
    } else {
      box.innerHTML = t.cart.map(function (l, i) {
        return '<div class="kpos-line" data-i="' + i + '"><div><strong>' +
          AKS.esc(l.name) + '</strong><div class="aks-muted">' + AKS.esc(l.code) +
          ' · stock ' + l.stock + (l.override ? ' · precio editado' : '') + '</div>' +
          '<div class="ctl"><input type="number" class="qty" min="1" step="1" ' +
          'data-f="qty" value="' + l.qty + '"> x $ <input type="number" min="0" ' +
          'step="0.01" data-f="price" value="' + l.unitPrice + '"></div></div>' +
          '<div style="text-align:right"><button class="rm" data-act="rm" title="Quitar">&times;</button>' +
          '<div id="aksK-line-' + i + '"><strong></strong></div></div></div>';
      }).join('');
    }
    renderTotals();
  }

  function renderTotals() {
    var t = calc(), n = 0;
    T().cart.forEach(function (l, i) {
      n += l.qty;
      var c = $('aksK-line-' + i);
      if (c) c.firstChild.textContent = AKS.usd(AKS.r2(l.qty * l.unitPrice));
    });
    $('aksK-tot').innerHTML = T().cart.length
      ? '<div class="r"><span>Subtotal</span><span>' + AKS.usd(t.sub) + '</span></div>' +
        (t.disc ? '<div class="r"><span>Descuento ' + t.pct + '%</span><span>-' +
          AKS.usd(t.disc) + '</span></div>' : '') +
        '<div class="r"><strong>Total Bs</strong><strong>' + AKS.bs(t.totalBs) +
        '</strong></div>' : '';
    $('aksK-sellamt').innerHTML = AKS.usd(t.total) +
      (T().cart.length ? '<small>' + AKS.bs(t.totalBs) + '</small>' : '');
    $('aksK-sell').disabled = !T().cart.length || busy;
    $('aksK-count').textContent = n + (n === 1 ? ' producto' : ' productos');
    if ($('aksK-paymodal').classList.contains('on')) renderPaySummary();
  }

  function showClients(q) {
    var box = $('aksK-cres');
    var found = (AKS.clientes && q.trim().length >= 2) ? AKS.clientes.search(q, 6) : [];
    box.innerHTML = found.map(function (c) {
      return '<div class="aks-result" data-client="' + AKS.esc(c.id) + '"><div><strong>' +
        AKS.esc(c.name) + '</strong><small>' + AKS.esc(c.doc) + (c.phone ? ' · ' + AKS.esc(c.phone) : '') +
        '</small></div></div>';
    }).join('');
  }

  function renderAll() { renderTabs(); renderGrid(); renderTicket(); }

  // ------------------------------------------------------------
  // Agregar productos
  // ------------------------------------------------------------
  function addProduct(p) {
    if (p.stock <= 0) { alert('"' + p.name + '" no tiene existencia.'); return; }
    var cart = T().cart;
    var ex = cart.filter(function (l) { return l.productId === p.id; })[0];
    if (ex) { ex.qty += 1; }
    else {
      if (cart.length >= MAX_LINES) { alert('Máximo ' + MAX_LINES + ' líneas.'); return; }
      var price = AKS.effectivePrice(p);
      cart.push({ productId: p.id, code: p.code, name: p.name, stock: p.stock,
        qty: 1, unitPrice: price, basePrice: price, override: false });
    }
    renderTicket();
  }

  // ------------------------------------------------------------
  // Cobro
  // ------------------------------------------------------------
  function validateTicket() {
    var cart = T().cart;
    if (!cart.length) { alert('El ticket está vacío'); return false; }
    for (var i = 0; i < cart.length; i++) {
      var l = cart[i];
      if (!(Number.isInteger(l.qty) && l.qty >= 1)) { alert('Cantidad inválida: ' + l.name); return false; }
      if (!(l.unitPrice > 0)) { alert('Precio inválido: ' + l.name); return false; }
      if (l.qty > l.stock && !confirm('"' + l.name + '" tiene stock ' + l.stock +
        ' y vas a vender ' + l.qty + '. El sistema lo bloqueará si el stock real ' +
        'es menor. ¿Continuar?')) return false;
    }
    var phone = T().cphone.trim();
    if (phone && !/^04\d{9}$/.test(phone)) { alert('Teléfono: formato 0412XXXXXXX'); return false; }
    return true;
  }

  function renderPaySummary() {
    var t = calc(), p = payments();
    $('aksK-paytotals').innerHTML =
      '<div class="aks-row"><span>TOTAL $</span><span class="big">' + AKS.usd(t.total) + '</span></div>' +
      '<div class="aks-row"><span>TOTAL Bs (tasa ' + rate.toFixed(2) + ')</span>' +
      '<span class="big">' + AKS.bs(t.totalBs) + '</span></div>';
    var diff = AKS.r2(p.paidUsd - t.total);
    $('aksK-paysum').innerHTML = 'Recibido: ' + AKS.usd(p.paidUsd) + ' (' +
      AKS.bs(p.paidUsd * rate) + ') · ' + (diff >= 0
        ? '<span class="aks-ok">Vuelto: ' + AKS.usd(diff) + ' / ' + AKS.bs(diff * rate) + '</span>'
        : '<span class="aks-bad">Falta: ' + AKS.usd(-diff) + ' / ' + AKS.bs(-diff * rate) + '</span>');
  }

  async function openPay() {
    if (!validateTicket()) return;
    try { rate = await AKS.getRate(true); } catch (e) { alert(e.message); return; }
    root.querySelectorAll('[data-pay]').forEach(function (e) { e.value = ''; });
    renderTicket();
    renderPaySummary();
    $('aksK-paymodal').classList.add('on');
  }

  async function charge() {
    if (busy) return;
    if (!validateTicket()) return;
    var shown = rate;
    busy = true;
    var btn = $('aksK-charge');
    btn.disabled = true;
    btn.textContent = 'Procesando...';
    try {
      rate = await AKS.getRate(true);
      if (rate !== shown) {
        renderTicket(); renderPaySummary();
        alert('La tasa BCV cambió de ' + shown + ' a ' + rate +
          '. Revisa el total en Bs y confirma de nuevo.');
        return;
      }
      var tk = T(), cart = tk.cart;
      var t = calc(), p = payments();
      if (p.paidUsd + 0.005 < t.total) {
        alert('El pago no cubre el total. Falta ' + AKS.usd(t.total - p.paidUsd));
        return;
      }
      var clientId = tk.clientId || '';
      if (!clientId && AKS.clientes) {
        try {
          clientId = await AKS.clientes.ensure({ name: tk.cname, doc: tk.cdoc, phone: tk.cphone }) || '';
        } catch (e) { console.error('cliente:', e); }
      }
      var db = AKS.db();
      var clientRef = clientId ? db.collection('clients').doc(clientId) : null;
      var saleRef = db.collection('sales').doc();
      var counterRef = db.collection('settings').doc('adminSettings');
      var nowIso = new Date().toISOString();
      var user = AKS.userLabel();
      var result = null;

      await db.runTransaction(async function (tx) {
        var counterSnap = await tx.get(counterRef);
        var clientSnap = clientRef ? await tx.get(clientRef) : null;
        var prodSnaps = [], costSnaps = [];
        for (var a = 0; a < cart.length; a++) {
          prodSnaps.push(await tx.get(db.collection('products').doc(cart[a].productId)));
        }
        for (var b = 0; b < cart.length; b++) {
          costSnaps.push(await tx.get(db.collection('productCosts').doc(cart[b].productId)));
        }
        var qtyByProd = {};
        for (var c = 0; c < cart.length; c++) {
          if (!prodSnaps[c].exists) throw new Error('"' + cart[c].name + '" ya no existe.');
          qtyByProd[cart[c].productId] = (qtyByProd[cart[c].productId] || 0) + cart[c].qty;
        }
        for (var d = 0; d < cart.length; d++) {
          var st = Number(prodSnaps[d].data().stock) || 0;
          if (qtyByProd[cart[d].productId] > st) {
            throw new Error('Stock insuficiente de "' + cart[d].name + '": quedan ' + st + '.');
          }
        }
        var n = (counterSnap.exists ? (Number(counterSnap.data().saleCounter) || 0) : 0) + 1;
        var number = 'V-' + String(n).padStart(6, '0');
        var lines = [], costTotal = 0;
        for (var k = 0; k < cart.length; k++) {
          var x = cart[k];
          var before = Number(prodSnaps[k].data().stock) || 0;
          var after = before - x.qty;
          tx.update(db.collection('products').doc(x.productId), { stock: after, updatedAt: nowIso });
          var cost = costSnaps[k].exists ? (Number(costSnaps[k].data().costPrice) || 0) : 0;
          costTotal += cost * x.qty;
          AKS.movement(tx, { productId: x.productId, code: x.code, name: x.name,
            type: 'venta', qty: -x.qty, stockBefore: before, stockAfter: after,
            refType: 'sale', refId: saleRef.id });
          lines.push({ productId: x.productId, code: x.code, name: x.name, qty: x.qty,
            unitPrice: x.unitPrice, basePrice: x.basePrice, priceOverride: !!x.override,
            unitCost: cost, lineTotal: AKS.r2(x.qty * x.unitPrice) });
        }
        var profit = AKS.r2(t.sub - t.disc - costTotal);
        tx.set(counterRef, { saleCounter: n }, { merge: true });
        result = {
          saleNumber: number, items: lines, subtotal: t.sub, discountPct: t.pct,
          discount: t.disc, iva: 0, totalUsd: t.total, rate: rate, totalBs: t.totalBs,
          costUsd: AKS.r2(costTotal), profitUsd: profit, payments: p.list,
          paidUsd: p.paidUsd, changeUsd: AKS.r2(Math.max(0, p.paidUsd - t.total)),
          customerName: tk.cname.trim(), customerPhone: tk.cphone.trim(),
          customerDoc: tk.cdoc.trim(), clientId: (clientSnap && clientSnap.exists) ? clientId : '',
          channel: 'mostrador', dateKey: AKS.dateKey(),
          status: 'completed', seller: user, createdAt: nowIso
        };
        tx.set(saleRef, result);
        if (clientSnap && clientSnap.exists) {
          var cd = clientSnap.data();
          tx.update(clientRef, { purchases: (Number(cd.purchases) || 0) + 1,
            totalSpentUsd: AKS.r2((Number(cd.totalSpentUsd) || 0) + t.total),
            lastPurchaseAt: nowIso });
        }
      });
      if (AKS.clientes) AKS.clientes.load(true).catch(function () {});

      printReceipt(result);
      tickets[cur] = newTicket(tk.name);
      $('aksK-paymodal').classList.remove('on');
      await AKS.loadProducts(true);
      AKS.refreshAdminProducts();
      renderAll();
      await loadToday();
    } catch (e) {
      console.error('Error al cobrar:', e);
      alert('No se pudo registrar la venta: ' + e.message);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = 'Confirmar venta';
      renderTotals();
    }
  }

  // ------------------------------------------------------------
  // Factura interna (impresión)
  // ------------------------------------------------------------
  function printReceipt(s) {
    var w = window.open('', '_blank', 'width=380,height=640');
    if (!w) { alert('Permite ventanas emergentes para imprimir la factura.'); return; }
    var rows = (s.items || []).map(function (x) {
      return '<tr><td>' + AKS.esc(x.qty) + ' x ' + AKS.esc(x.name) +
        '</td><td style="text-align:right">' + AKS.usd(x.lineTotal) + '</td></tr>';
    }).join('');
    var pays = (s.payments || []).map(function (p) {
      var m = METHODS.filter(function (z) { return z.k === p.method; })[0];
      return '<div>' + AKS.esc(m ? m.label : p.method) + ': ' +
        (p.currency === 'USD' ? AKS.usd(p.amount) : AKS.bs(p.amount)) + '</div>';
    }).join('');
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Factura ' +
      AKS.esc(s.saleNumber) + '</title><style>body{font:13px monospace;margin:10px;' +
      'max-width:340px}table{width:100%}hr{border:0;border-top:1px dashed #000}</style>' +
      '</head><body><h3 style="text-align:center;margin:0">' + AKS.esc(settings.companyName) +
      '</h3><div style="text-align:center"><strong>FACTURA INTERNA N° ' +
      AKS.esc(s.saleNumber) + '</strong><br>Documento de control · no es factura fiscal</div>' +
      '<hr><div>' + AKS.esc(AKS.fmtDateTime(s.createdAt)) + '</div>' +
      (s.customerName ? '<div>Cliente: ' + AKS.esc(s.customerName) + '</div>' : '') +
      (s.customerDoc ? '<div>RIF/C.I.: ' + AKS.esc(s.customerDoc) + '</div>' : '') +
      '<hr><table>' + rows + '</table><hr><table>' +
      '<tr><td>Subtotal</td><td style="text-align:right">' + AKS.usd(s.subtotal) + '</td></tr>' +
      (s.discount ? '<tr><td>Descuento</td><td style="text-align:right">-' + AKS.usd(s.discount) + '</td></tr>' : '') +
      '<tr><td><strong>TOTAL $</strong></td><td style="text-align:right"><strong>' +
      AKS.usd(s.totalUsd) + '</strong></td></tr><tr><td><strong>TOTAL Bs</strong></td>' +
      '<td style="text-align:right"><strong>' + AKS.bs(s.totalBs) + '</strong></td></tr></table>' +
      '<div>Tasa BCV: ' + s.rate.toFixed(2) + '</div><hr>' + pays +
      (s.changeUsd ? '<div>Vuelto: ' + AKS.usd(s.changeUsd) + '</div>' : '') +
      '<hr><div style="text-align:center">¡Gracias por su compra!</div>' +
      '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  }

  // ------------------------------------------------------------
  // Ventas de hoy / anular
  // ------------------------------------------------------------
  async function loadToday() {
    var box = $('aksK-list');
    try {
      var snap = await AKS.db().collection('sales').where('dateKey', '==', AKS.dateKey()).get();
      todaySales = [];
      snap.forEach(function (d) { var s = d.data(); s._id = d.id; todaySales.push(s); });
      todaySales.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      var tot = 0, byM = {};
      todaySales.forEach(function (s) {
        if (s.status !== 'completed') return;
        tot += s.totalUsd;
        (s.payments || []).forEach(function (p) {
          byM[p.method] = byM[p.method] || { amt: 0, cur: p.currency };
          byM[p.method].amt += p.amount;
        });
      });
      var sum = 'Total hoy: <strong>' + AKS.usd(tot) + '</strong> · ' +
        todaySales.filter(function (s) { return s.status === 'completed'; }).length + ' ventas';
      Object.keys(byM).forEach(function (k) {
        var m = METHODS.filter(function (z) { return z.k === k; })[0];
        sum += '<br>' + AKS.esc(m ? m.label : k) + ': ' +
          (byM[k].cur === 'USD' ? AKS.usd(byM[k].amt) : AKS.bs(byM[k].amt));
      });
      $('aksK-summary').innerHTML = sum;
      if (!todaySales.length) { box.innerHTML = '<div class="aks-muted">Sin ventas hoy.</div>'; return; }
      box.innerHTML = '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>N°</th>' +
        '<th>Hora</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>' +
        todaySales.map(function (s, i) {
          var ok = s.status === 'completed';
          return '<tr><td>' + AKS.esc(s.saleNumber) + '</td><td>' + AKS.esc(AKS.fmtDateTime(s.createdAt)) +
            '</td><td>' + AKS.usd(s.totalUsd) + '<br><span class="aks-muted">' + AKS.bs(s.totalBs) +
            '</span></td><td>' + (ok ? '<span class="aks-ok">Completada</span>' : '<span class="aks-bad">Anulada</span>') +
            '</td><td><button class="btn btn-secondary btn-small" data-act="print" data-i="' + i +
            '">Factura</button> ' + (ok ? '<button class="btn btn-danger btn-small" data-act="void" data-i="' +
            i + '">Anular</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } catch (e) {
      console.error(e);
      box.innerHTML = '<span class="aks-bad">No se pudo cargar: ' + AKS.esc(e.message) + '</span>';
    }
  }

  async function voidSale(s, done) {
    var reason = prompt('Motivo de la anulación de ' + s.saleNumber + ':');
    if (!reason || !reason.trim()) return;
    var db = AKS.db();
    try {
      await db.runTransaction(async function (tx) {
        var ref = db.collection('sales').doc(s._id);
        var curS = await tx.get(ref);
        if (!curS.exists || curS.data().status !== 'completed') throw new Error('La venta ya no está activa.');
        var snaps = [];
        for (var i = 0; i < s.items.length; i++) {
          snaps.push(await tx.get(db.collection('products').doc(s.items[i].productId)));
        }
        var cRef = s.clientId ? db.collection('clients').doc(s.clientId) : null;
        var cSnap = cRef ? await tx.get(cRef) : null;
        var added = {};
        for (var k = 0; k < s.items.length; k++) {
          var it = s.items[k];
          if (!snaps[k].exists) continue;
          var base = Number(snaps[k].data().stock) || 0;
          var before = base + (added[it.productId] || 0);
          var after = before + it.qty;
          added[it.productId] = (added[it.productId] || 0) + it.qty;
          tx.update(db.collection('products').doc(it.productId), { stock: after, updatedAt: new Date().toISOString() });
          AKS.movement(tx, { productId: it.productId, code: it.code, name: it.name,
            type: 'anulacion_venta', qty: it.qty, stockBefore: before, stockAfter: after,
            refType: 'sale', refId: s._id });
        }
        tx.update(ref, { status: 'voided', voidReason: reason.trim(), voidedBy: AKS.userLabel(),
          voidedAt: new Date().toISOString() });
        if (cSnap && cSnap.exists) {
          var cc = cSnap.data();
          tx.update(cRef, { purchases: Math.max(0, (Number(cc.purchases) || 0) - 1),
            totalSpentUsd: Math.max(0, AKS.r2((Number(cc.totalSpentUsd) || 0) - s.totalUsd)) });
        }
      });
      if (AKS.clientes) AKS.clientes.load(true).catch(function () {});
      AKS.refreshAdminProducts();
      await AKS.loadProducts(true);
      renderGrid();
      await loadToday();
      if (typeof done === 'function') await done();
    } catch (e) {
      console.error(e);
      alert('No se pudo anular: ' + e.message);
    }
  }

  // ------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------
  function bind() {
    root.addEventListener('input', function (ev) {
      var t = ev.target, tk = T();
      if (t.id === 'aksK-search') { if (mode === 'search') renderGrid(); return; }
      if (t.id === 'aksK-cname') { tk.cname = t.value; tk.clientId = ''; showClients(t.value); return; }
      if (t.id === 'aksK-cdoc') { tk.cdoc = t.value; tk.clientId = ''; showClients(t.value); return; }
      if (t.id === 'aksK-cphone') { tk.cphone = t.value; return; }
      if (t.id === 'aksK-disc') { tk.disc = t.value; renderTotals(); return; }
      if (t.hasAttribute('data-pay')) { renderPaySummary(); return; }
      var f = t.getAttribute('data-f');
      if (f) {
        var i = parseInt(t.closest('.kpos-line').getAttribute('data-i'), 10);
        var l = tk.cart[i];
        if (!l) return;
        if (f === 'qty') l.qty = parseInt(t.value, 10) || 0;
        else { l.unitPrice = AKS.num(t.value); l.override = l.unitPrice !== l.basePrice; }
        renderTotals();
      }
    });
    root.addEventListener('keydown', function (ev) {
      if (ev.target.id !== 'aksK-search' || ev.key !== 'Enter') return;
      ev.preventDefault();
      var q = ev.target.value.trim();
      if (!q) return;
      var nq = AKS.norm(q);
      var exact = AKS.products.filter(function (p) { return AKS.norm(p.code) === nq; })[0];
      var p = exact || (mode === 'search' ? AKS.searchProducts(q, 1)[0] : null);
      if (p) { addProduct(p); ev.target.value = ''; renderGrid(); }
      else if (mode === 'barcode') { alert('No existe un producto con el código "' + q + '"'); ev.target.select(); }
    });
    root.addEventListener('click', function (ev) {
      var t = ev.target;
      var fav = t.getAttribute && t.getAttribute('data-fav');
      if (fav) {
        favs[fav] = !favs[fav];
        if (!favs[fav]) delete favs[fav];
        try { localStorage.setItem('aks_favs', JSON.stringify(favs)); } catch (e) { /* ignorar */ }
        renderGrid();
        return;
      }
      var tab = t.getAttribute && t.getAttribute('data-tab');
      if (tab) {
        if (tab === 'add') {
          tickets.push(newTicket(String.fromCharCode(65 + tickets.length)));
          cur = tickets.length - 1;
        } else cur = parseInt(tab, 10);
        renderAll();
        return;
      }
      var md = t.getAttribute && t.getAttribute('data-mode');
      if (md) {
        mode = md;
        root.querySelectorAll('.kpos-mode').forEach(function (b) {
          b.classList.toggle('on', b.getAttribute('data-mode') === mode);
        });
        $('aksK-search').placeholder = mode === 'barcode' ? 'Escanea el código y pulsa Enter' : 'Buscar productos';
        $('aksK-search').value = '';
        renderGrid();
        $('aksK-search').focus();
        return;
      }
      var cres = t.closest && t.closest('[data-client]');
      if (cres && AKS.clientes) {
        var c = AKS.clientes.getList().filter(function (x) { return x.id === cres.getAttribute('data-client'); })[0];
        if (c) {
          var tk2 = T();
          tk2.cname = c.name; tk2.cdoc = c.doc; tk2.cphone = c.phone || ''; tk2.clientId = c.id;
          $('aksK-cres').innerHTML = '';
          renderTicket();
        }
        return;
      }
      var card = t.closest && t.closest('.kpos-card');
      if (card) {
        var p = AKS.products.filter(function (x) { return x.id === card.getAttribute('data-id'); })[0];
        if (p) addProduct(p);
        return;
      }
      var act = t.getAttribute && t.getAttribute('data-act');
      if (act === 'rm') {
        T().cart.splice(parseInt(t.closest('.kpos-line').getAttribute('data-i'), 10), 1);
        renderTicket();
      } else if (act === 'print') {
        printReceipt(todaySales[parseInt(t.getAttribute('data-i'), 10)]);
      } else if (act === 'void') {
        voidSale(todaySales[parseInt(t.getAttribute('data-i'), 10)]);
      } else if (t.id === 'aksK-sell' || (t.closest && t.closest('#aksK-sell'))) {
        openPay();
      } else if (t.id === 'aksK-charge') charge();
      else if (t.id === 'aksK-payback') $('aksK-paymodal').classList.remove('on');
      else if (t.id === 'aksK-cancel') {
        if (!T().cart.length || confirm('¿Cancelar esta factura y vaciar los productos?')) {
          tickets[cur] = newTicket(T().name);
          renderTicket();
        }
      } else if (t.id === 'aksK-new') {
        if (typeof window.showSection === 'function') window.showSection('products');
        if (typeof window.openAddProductModal === 'function') window.openAddProductModal();
      }
    });
  }

  async function open() {
    try {
      await AKS.loadProducts(true);
      rate = await AKS.getRate(true);
      settings = await AKS.getSettings(true);
      if (AKS.clientes) await AKS.clientes.load(true);
    } catch (e) { alert(e.message); return; }
    renderAll();
    loadToday();
    var s = $('aksK-search'); if (s) s.focus();
  }

  AKS.init(function () {
    injectCss();
    root = AKS.addSection('caja', html());
    if (!root) return;
    bind();
    renderTabs();
    AKS.addMenuItem('Caja (POS)', 'caja', open, 'caja');
  });

  AKS.caja = { printReceipt: printReceipt, voidSale: voidSale, open: open, charge: charge, addProduct: addProduct, openPay: openPay,
    getCart: function () { return T().cart; } };
})();
