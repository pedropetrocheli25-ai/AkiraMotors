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
    { k: 'transferencia', label: 'Transferencia Bs', cur: 'VES' },
    { k: 'usdt', label: 'USDT', cur: 'USDT' }
  ];
  var usdtRate = 0;

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
    return { name: name, cart: [], disc: '', cname: '', cphone: '', cdoc: '', clientId: '',
      paper: { on: false, dt: '', rate: '', note: '' } };
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
    '.kpos-oem{font-size:.72rem;color:#c2410c;font-weight:700;margin-top:.1rem;word-break:break-all}' +
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
    '.kpos-box{position:relative}' +
    '.kpos-paytop{position:sticky;top:-1.2rem;z-index:2;background:#fff;' +
    'margin:-1.2rem -1.2rem .6rem;padding:1.2rem 1.2rem .6rem;' +
    'border-bottom:2px solid #FF6B1A}' +
    '.kpos-pay{display:flex;flex-direction:column;gap:.55rem}' +
    '.kpos-pm{display:grid;grid-template-columns:1fr auto 1fr;gap:.4rem;align-items:end}' +
    '.kpos-pm label{grid-column:1 / -1;font-size:.78rem;color:#555;font-weight:600}' +
    '.kpos-pm input{width:100%;padding:.55rem;border:1px solid #ddd;border-radius:6px;box-sizing:border-box}' +
    '.kpos-pm .all{padding:.5rem .7rem;border:1px solid #FF6B1A;background:#fff;' +
    'color:#FF6B1A;border-radius:6px;font-weight:700;cursor:pointer}' +
    '.kpos-pm .all:hover{background:#FF6B1A;color:#fff}' +
    '@media(max-width:700px){.kpos{min-height:0}' +
    '.kpos-bar{flex-wrap:wrap}' +
    '.kpos-search{flex:1 1 100%;flex-wrap:wrap}' +
    '.kpos-search input{order:-1;flex:1 1 100%;width:100%;min-width:0;box-sizing:border-box;' +
    'font-size:16px;padding:.85rem .9rem;border-bottom:1px solid #e5e9ee}' +
    '.kpos-mode{flex:1 1 50%;padding:.7rem .4rem;font-size:.85rem}' +
    '.kpos-new{flex:1 1 100%;padding:.7rem}' +
    '.kpos-grid{grid-template-columns:repeat(2,minmax(0,1fr));max-height:70vh;gap:.6rem}' +
    '.kpos-right{min-width:0}' +
    '.kpos-jump{display:block}}' +
    '.kpos-jump{display:none;position:fixed;left:12px;right:12px;bottom:12px;z-index:900;' +
    'background:#FF6B1A;color:#fff;border:0;border-radius:12px;padding:.9rem;font-size:1rem;' +
    'font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.35)}';

  function injectCss() {
    if ($('aks-caja-style')) return;
    var st = document.createElement('style');
    st.id = 'aks-caja-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function html() {
    var pay = METHODS.map(function (m) {
      return '<div class="kpos-pm" data-row="' + m.k + '"' + (m.k === 'usdt' ? ' style="display:none"' : '') + '>' +
        '<label>' + m.label + '</label>' +
        '<input type="number" min="0" step="0.01" data-pay="' + m.k + '" data-money placeholder="Monto">' +
        '<button type="button" class="all" data-all="' + m.k + '" title="Poner todo lo que falta">Todo</button>' +
        (m.k.indexOf('efectivo') === 0 ? '<span></span>' :
          '<input type="text" maxlength="20" data-ref="' + m.k + '" placeholder="Referencia">') +
        '</div>';
    }).join('');
    return '<button type="button" id="aksK-jump" class="kpos-jump" style="visibility:hidden"></button>' +
      '<h2 class="section-title">Caja</h2>' +
      '<div class="kpos">' +
      '<div class="kpos-tabs" id="aksK-tabs"></div>' +
      '<div class="kpos-left">' +
      '<div class="kpos-bar"><div class="kpos-search">' +
      '<button class="kpos-mode on" data-mode="search" title="Buscar por nombre">Buscar</button>' +
      '<button class="kpos-mode" data-mode="barcode" title="Lector de código de barras: Enter agrega el código exacto">||| Código</button>' +
      '<input type="text" id="aksK-search" placeholder="Buscar nombre, código, OEM, marca" ' +
      'autocomplete="off"></div>' +
      '<button class="kpos-new" id="aksK-new">+ Nuevo producto</button></div>' +
      '<div class="kpos-grid" id="aksK-grid"></div>' +
      '<div class="aks-muted" id="aksK-more" style="margin-top:.5rem"></div></div>' +
      '<div class="kpos-right" id="aksK-right">' +
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
      'min="0" max="100" step="0.5" placeholder="0"></div>' +
      '<div class="full" style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">' +
      '<button type="button" class="btn btn-secondary btn-small" id="aksK-waorder">Cargar pedido de WhatsApp</button>' +
      '<label style="font-size:.85rem"><input type="checkbox" id="aksK-paper"> Venta anotada en papel</label></div>' +
      '<div class="full" id="aksK-paperbox" style="display:none;gap:.4rem;flex-wrap:wrap">' +
      '<input type="datetime-local" id="aksK-pdt" style="flex:1 1 170px">' +
      '<input type="number" id="aksK-prate" step="any" data-money placeholder="Tasa BCV de ese momento" style="flex:1 1 150px">' +
      '<input type="text" id="aksK-pnote" maxlength="20" placeholder="N° de nota (opcional)" style="flex:1 1 150px"></div></div>' +
      '<div class="kpos-lines" id="aksK-lines"></div>' +
      '<div class="kpos-tot" id="aksK-tot"></div>' +
      '<div class="kpos-foot"><button class="kpos-sell" id="aksK-sell" disabled>' +
      '<span>Vender</span><span id="aksK-sellamt">$0.00</span></button>' +
      '<div class="kpos-sub"><span id="aksK-count">0 productos</span>' +
      '<a id="aksK-cancel">Cancelar</a></div></div></div></div>' +

      '<div class="kpos-modal" id="aksK-paymodal"><div class="kpos-box">' +
      '<div class="kpos-paytop"><h3>Cobrar</h3><div id="aksK-paytotals" class="aks-total"></div>' +
      '<div id="aksK-paysum" style="margin-top:.4rem"></div></div>' +
      '<div class="kpos-pay">' + pay + '</div>' +
      '<div style="margin:.6rem 0"><label><input type="checkbox" id="aksK-credit"> Dejar el saldo pendiente (crédito)</label>' +
      '<div id="aksK-credbox" style="display:none;margin-top:.4rem;gap:.4rem;flex-wrap:wrap">' +
      '<select id="aksK-ctype"><option value="fiado">Fiado (paga después)</option>' +
      '<option value="apartado">Apartado (retira cuando termine de pagar)</option></select>' +
      '<input type="date" id="aksK-cdue" title="Fecha límite de pago (opcional)"></div></div>' +
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
    // credit = lo que el pago cubre de la factura (en $ a tasa BCV).
    // usdt: paga menos $ reales que lo que cubre: la diferencia es descuento.
    var out = [], paidUsd = 0, credit = 0, usdtDisc = 0;
    METHODS.forEach(function (m) {
      var el = root.querySelector('[data-pay="' + m.k + '"]');
      var v = AKS.r2(AKS.num(el.value));
      if (v > 0) {
        var usd = m.cur === 'USD' ? v : (m.cur === 'USDT' ? v : v / rate);
        var cov = m.cur === 'USDT' ? v * usdtRate / rate : usd;
        var rf = root.querySelector('[data-ref="' + m.k + '"]');
        var rec = { method: m.k, currency: m.cur, amount: AKS.r2(v),
          amountUsd: AKS.r2(usd), ref: rf ? rf.value.trim() : '' };
        if (m.cur === 'USDT') rec.usdtRate = usdtRate;
        out.push(rec);
        paidUsd += usd; credit += cov;
        if (m.cur === 'USDT') usdtDisc += cov - usd;
      }
    });
    return { list: out, paidUsd: AKS.r2(paidUsd), credit: AKS.r2(credit),
      usdtDisc: AKS.r2(usdtDisc) };
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
    else list = AKS.products.filter(function (p) { return p.stock > 0; });
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
        (off ? '<div class="kpos-inv low">No disponible</div>'
          : '<div class="kpos-inv' + (p.stock <= p.minStock ? ' low' : '') + '">Inv. ' + p.stock + '</div>') +
        '<div class="kpos-name">' + AKS.esc(p.name) + '</div>' +
        (p.partNumber ? '<div class="kpos-oem">OEM: ' + AKS.esc(p.partNumber) + '</div>' : '') +
        '<div class="kpos-price">' + AKS.usd(price) +
        '<small>' + AKS.bs(price * rate) + '</small></div></div>';
    }).join('') : '<div class="aks-muted" style="grid-column:1/-1;padding:2rem;text-align:center">' +
      'Sin productos' + (q ? ' para "' + AKS.esc(q) + '"' : '') + '</div>';
    $('aksK-more').textContent = total > GRID_LIMIT
      ? 'Mostrando ' + GRID_LIMIT + ' de ' + total + ' productos. Escribe para filtrar.' : '';
  }

  function oemOf(id) {
    var p = AKS.products.filter(function (x) { return x.id === id; })[0];
    return p ? p.partNumber : '';
  }

  function renderTicket() {
    setTimeout(function () { try { syncExtras(); } catch (e) { /* ignorar */ } }, 0);
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
          (oemOf(l.productId) ? ' · OEM ' + AKS.esc(oemOf(l.productId)) : '') +
          ' · stock ' + l.stock + (l.override ? ' · precio editado' : '') + '</div>' +
          '<div class="ctl"><input type="number" class="qty" min="0.001" step="any" ' +
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
        (usdtRate > 0 ? '<div class="r"><span>USDT</span><span>' + (t.totalBs / usdtRate).toFixed(2) + ' USDT</span></div>' : '') +
        '<div class="r"><strong>Total Bs</strong><strong>' + AKS.bs(t.totalBs) +
        '</strong></div>' : '';
    $('aksK-sellamt').innerHTML = AKS.usd(t.total) +
      (T().cart.length ? '<small>' + AKS.bs(t.totalBs) + '</small>' : '');
    $('aksK-sell').disabled = !T().cart.length || busy;
    var jb = $('aksK-jump');
    if (jb) {
      var rp = $('aksK-right'), seen = rp && rp.getBoundingClientRect().top < window.innerHeight * 0.45;
      jb.style.visibility = (T().cart.length && !seen) ? 'visible' : 'hidden';
      jb.textContent = 'Ver factura · ' + n + ' · ' + AKS.usd(t.total);
    }
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
    if (ex) { ex.qty = AKS.q(ex.qty + 1); }
    else {
      if (cart.length >= MAX_LINES) { alert('Máximo ' + MAX_LINES + ' líneas.'); return; }
      var price = AKS.effectivePrice(p);
      cart.push({ productId: p.id, code: p.code, name: p.name, stock: p.stock,
        qty: 1, unitPrice: price, basePrice: price, override: false, warrantyDays: Number(p.warrantyDays) || 0 });
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
      if (!(l.qty > 0)) { alert('Cantidad inválida: ' + l.name); return false; }
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
      '<span class="big">' + AKS.bs(t.totalBs) + '</span></div>' +
      (usdtRate > 0 ? '<div class="aks-row"><span>Equivale a (USDT a ' + usdtRate.toFixed(2) + ')</span>' +
        '<span class="big">' + (t.totalBs / usdtRate).toFixed(2) + ' USDT</span></div>' : '');
    var diff = AKS.r2(p.credit - t.total);
    $('aksK-paysum').innerHTML = (diff >= 0
        ? '<span class="aks-ok" style="font-size:1.05rem"><strong>Vuelto: ' + AKS.usd(diff) + ' / ' + AKS.bs(diff * rate) + '</strong></span>'
        : ($('aksK-credit') && $('aksK-credit').checked
          ? '<span class="aks-bad" style="font-size:1.05rem"><strong>Queda a crédito: ' + AKS.usd(-diff) + ' / ' + AKS.bs(-diff * rate) + '</strong></span>'
          : '<span class="aks-bad" style="font-size:1.05rem"><strong>Falta: ' + AKS.usd(-diff) + ' / ' + AKS.bs(-diff * rate) +
          (usdtRate > 0 ? ' / ' + (-diff * rate / usdtRate).toFixed(2) + ' USDT' : '') + '</strong></span>')) +
      (p.usdtDisc > 0 ? '<br><span class="aks-muted">Descuento por pagar en USDT: ' + AKS.usd(p.usdtDisc) + '</span>' : '');
  }

  async function openPay() {
    if (!validateTicket()) return;
    try { rate = await AKS.getRate(true); } catch (e) { alert(e.message); return; }
    var pp = T().paper;
    if (pp.on && AKS.num(pp.rate) > 0) rate = AKS.r2(AKS.num(pp.rate));
    root.querySelectorAll('[data-pay],[data-ref]').forEach(function (e) { e.value = ''; });
    $('aksK-credit').checked = false; $('aksK-credbox').style.display = 'none';
    try {
      var us = await AKS.db().collection('settings').doc('usdtRate').get();
      usdtRate = us.exists ? (Number(us.data().value) || 0) : 0;
    } catch (e) { usdtRate = 0; }
    var urow = root.querySelector('[data-row="usdt"]');
    if (urow) urow.style.display = usdtRate > 0 ? '' : 'none';
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
      var pap = T().paper, isPaper = !!pap.on;
      if (isPaper) {
        if (!pap.dt || !(AKS.num(pap.rate) > 0)) { alert('Indica la fecha, la hora y la tasa de la venta anotada en papel.'); return; }
        if (new Date(pap.dt).getTime() > Date.now() + 60000) { alert('La fecha de la venta anotada no puede ser futura.'); return; }
        rate = AKS.r2(AKS.num(pap.rate));
      } else {
        rate = await AKS.getRate(true);
        if (rate !== shown) {
          renderTicket(); renderPaySummary();
          alert('La tasa BCV cambió de ' + shown + ' a ' + rate +
            '. Revisa el total en Bs y confirma de nuevo.');
          return;
        }
      }
      var tk = T(), cart = tk.cart;
      var t = calc(), p = payments();
      var balance = AKS.r2(t.total - p.credit);
      var onCredit = false, ctype = 'fiado', cdue = '';
      if (balance > 0.004) {
        if (!$('aksK-credit').checked) {
          alert('El pago no cubre el total. Falta ' + AKS.usd(balance) + '. Si el cliente deja saldo pendiente, marca "Dejar el saldo pendiente (crédito)".');
          return;
        }
        var phd = String(tk.cphone || '').replace(/\D/g, '');
        if (!tk.cname.trim() || /^consumidor/i.test(tk.cname.trim()) || phd.length < 10 || !String(tk.cdoc || '').trim()) {
          alert('Para vender a crédito o apartar, escribe el nombre, la cédula/RIF y el teléfono del cliente.');
          return;
        }
        onCredit = true; ctype = $('aksK-ctype').value; cdue = $('aksK-cdue').value || '';
        if (AKS.role === 'cajero') {
          var okc = await AKS.authorizeOwner('Venta a crédito/apartado por ' + AKS.usd(balance) + '. Un dueño debe autorizar.');
          if (!okc) { return; }
        }
      }
      // Referencia de pago ya usada antes (evita que cuelen el mismo comprobante dos veces)
      var refKeys = p.list.filter(function (x) { return x.ref; }).map(function (x) { return x.method + ':' + String(x.ref).toUpperCase().replace(/\s+/g, ''); });
      for (var rk = 0; rk < refKeys.length; rk++) {
        try {
          var dup = await AKS.db().collection('sales').where('payRefs', 'array-contains', refKeys[rk]).limit(3).get();
          var hit = null;
          dup.forEach(function (d) { if (!hit && d.data().status === 'completed') hit = d.data(); });
          if (hit) {
            if (!confirm('La referencia "' + refKeys[rk].split(':')[1] + '" ya se usó en la factura ' + hit.saleNumber + ' (' + AKS.fmtDate(hit.dateKey) +
              '). ¿Es otro pago y quieres continuar?')) return;
            AKS.log('referencia_repetida', refKeys[rk] + ' ya usada en ' + hit.saleNumber);
          }
        } catch (e) { console.warn('ref:', e.message); }
      }
      // Control interno: el cajero no puede pasarse del tope de descuento ni cambiar precios sin autorización de un dueño
      var authBy = '';
      if (AKS.role === 'cajero') {
        var cap = 10;
        try {
          var as = await AKS.db().collection('settings').doc('adminSettings').get();
          if (as.exists && as.data().maxDiscountCashier !== undefined) cap = Number(as.data().maxDiscountCashier) || 0;
        } catch (e) { /* tope por defecto */ }
        var over = cart.some(function (l) { return l.override && l.unitPrice < l.basePrice; });
        if (t.pct > cap || over) {
          authBy = await AKS.authorizeOwner((t.pct > cap ? 'Descuento de ' + t.pct + '% (tope del cajero: ' + cap + '%). ' : '') +
            (over ? 'Precio modificado en la venta. ' : '') + 'Un dueño debe autorizar.');
          if (!authBy) { return; }
        }
      }
      // El descuento por pagar en USDT baja el total de la factura
      var usdtDisc = p.usdtDisc > 0 ? p.usdtDisc : 0;
      var totalFinal = AKS.r2(t.total - usdtDisc);
      var clientId = tk.clientId || '';
      if (!clientId && AKS.clientes) {
        try {
          clientId = await AKS.clientes.ensure({ name: tk.cname, doc: tk.cdoc, phone: tk.cphone }) || '';
        } catch (e) { console.error('cliente:', e); }
      }
      if (onCredit && !clientId) { alert('No se pudo registrar al cliente. Revisa nombre y teléfono para vender a crédito.'); return; }
      var db = AKS.db();
      var clientRef = clientId ? db.collection('clients').doc(clientId) : null;
      var saleRef = db.collection('sales').doc();
      var counterRef = db.collection('settings').doc('adminSettings');
      var realNow = new Date().toISOString();
      var nowIso = isPaper ? new Date(pap.dt).toISOString() : realNow;
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
          var after = AKS.q(before - x.qty);
          tx.update(db.collection('products').doc(x.productId), { stock: after, updatedAt: nowIso });
          var cost = costSnaps[k].exists ? (Number(costSnaps[k].data().costPrice) || 0) : 0;
          costTotal += cost * x.qty;
          AKS.movement(tx, { productId: x.productId, code: x.code, name: x.name,
            type: 'venta', qty: -x.qty, stockBefore: before, stockAfter: after,
            refType: 'sale', refId: saleRef.id });
          lines.push({ productId: x.productId, code: x.code, name: x.name, qty: x.qty,
            unitPrice: x.unitPrice, basePrice: x.basePrice, priceOverride: !!x.override,
            unitCost: cost, lineTotal: AKS.r2(x.qty * x.unitPrice), warrantyDays: Number(x.warrantyDays) || 0 });
        }
        var profit = AKS.r2(t.sub - t.disc - usdtDisc - costTotal);
        tx.set(counterRef, { saleCounter: n }, { merge: true });
        result = {
          saleNumber: number, items: lines, subtotal: t.sub, discountPct: t.pct,
          discount: AKS.r2(t.disc + usdtDisc), usdtDiscount: usdtDisc, iva: 0,
          totalUsd: totalFinal, rate: rate, totalBs: AKS.r2(totalFinal * rate),
          costUsd: AKS.r2(costTotal), profitUsd: profit, payments: p.list,
          paidUsd: p.paidUsd, changeUsd: onCredit ? 0 : AKS.r2(Math.max(0, p.paidUsd - totalFinal)),
          onCredit: onCredit, balanceUsd: onCredit ? balance : 0, creditType: onCredit ? ctype : '',
          payRefs: refKeys, fromPaper: isPaper, paperNote: isPaper ? String(pap.note || '') : '', enteredAt: realNow,
          customerName: tk.cname.trim(), customerPhone: tk.cphone.trim(),
          customerDoc: tk.cdoc.trim(), clientId: (clientSnap && clientSnap.exists) ? clientId : '',
          channel: 'mostrador', dateKey: AKS.dateKey(isPaper ? new Date(pap.dt) : undefined),
          status: 'completed', seller: user, createdAt: nowIso
        };
        tx.set(saleRef, result);
        if (onCredit && clientId) {
          tx.set(db.collection('receivables').doc(saleRef.id), {
            saleId: saleRef.id, saleNumber: number, clientId: clientId, clientName: tk.cname.trim(),
            clientPhone: tk.cphone.trim(), type: ctype, totalUsd: totalFinal, paidUsd: AKS.r2(totalFinal - balance),
            balanceUsd: balance, status: 'open', delivered: ctype !== 'apartado', dueDate: cdue,
            dateKey: result.dateKey, createdAt: nowIso, user: user });
        }
        if (clientSnap && clientSnap.exists) {
          var cd = clientSnap.data();
          tx.update(clientRef, { purchases: (Number(cd.purchases) || 0) + 1,
            totalSpentUsd: AKS.r2((Number(cd.totalSpentUsd) || 0) + totalFinal),
            lastPurchaseAt: nowIso });
        }
      });
      if (AKS.clientes) AKS.clientes.load(true).catch(function () {});
      var rebajados = cart.filter(function (l) { return l.override && l.unitPrice !== l.basePrice; });
      if (isPaper) AKS.log('venta_en_papel', result.saleNumber + ' anotada el ' + AKS.fmtDateTime(nowIso) + ' con tasa ' + rate, { saleNumber: result.saleNumber });
      if (onCredit) AKS.log('venta_a_credito', result.saleNumber + ' ' + ctype + ' saldo $' + balance + ' a ' + tk.cname.trim(), { saleNumber: result.saleNumber, balance: balance });
      if (t.pct > 0 || usdtDisc > 0 || rebajados.length) {
        AKS.log(authBy ? 'descuento_autorizado' : 'descuento', result.saleNumber + ': ' + (t.pct > 0 ? t.pct + '% ($' + t.disc + ') ' : '') +
          (usdtDisc > 0 ? 'USDT -$' + usdtDisc + ' ' : '') + (rebajados.length ? rebajados.length + ' precio(s) modificado(s) ' : '') +
          (authBy ? 'Autorizó: ' + authBy : ''), { saleNumber: result.saleNumber, pct: t.pct, authBy: authBy });
      }

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
  // Garantía por producto: "Garantía: Bujía 30 días (hasta 21/12/2026)"
  function warrText(s) {
    var base = new Date(s.createdAt), out = [];
    (s.items || []).forEach(function (x) {
      var d = Number(x.warrantyDays) || 0;
      if (d > 0) {
        var u = new Date(base.getTime() + d * 86400000);
        out.push('Garantía ' + x.name + ': ' + d + ' días (hasta ' + AKS.fmtDate(AKS.dateKey(u)) + ')');
      }
    });
    return out.length ? '\n' + out.join('\n') : '';
  }

  function payLine(p) {
    var m = METHODS.filter(function (z) { return z.k === p.method; })[0];
    var amt = p.currency === 'USD' ? AKS.usd(p.amount)
      : (p.currency === 'USDT' ? Number(p.amount).toFixed(2) + ' USDT' : AKS.bs(p.amount));
    return (m ? m.label : p.method) + ': ' + amt + (p.ref ? ' (ref ' + p.ref + ')' : '');
  }

  // Texto de la factura para enviar por WhatsApp
  function waText(s) {
    var name = s.customerName ? s.customerName : 'Consumidor final';
    var t = '*Factura N° ' + s.saleNumber + ' - ' + name + '*\n' + settings.companyName +
      '\n' + AKS.fmtDateTime(s.createdAt) + '\n';
    if (s.customerDoc) t += 'RIF/C.I.: ' + s.customerDoc + '\n';
    t += '\n' + (s.items || []).map(function (x) {
      return x.qty + ' x ' + x.name + ' = ' + AKS.usd(x.lineTotal);
    }).join('\n') + '\n';
    if (s.discount) t += '\nDescuento: -' + AKS.usd(s.discount);
    t += '\n*TOTAL: ' + AKS.usd(s.totalUsd) + ' / ' + AKS.bs(s.totalBs) + '*\nTasa BCV: ' + Number(s.rate).toFixed(2) + '\n\n' +
      (s.payments || []).map(payLine).join('\n') +
      (s.changeUsd ? '\nVuelto: ' + AKS.usd(s.changeUsd) : '') +
      (s.onCredit ? '\n*SALDO PENDIENTE: ' + AKS.usd(s.balanceUsd) + (s.creditType === 'apartado' ? ' (apartado)' : '') + '*' : '') +
      warrText(s) +
      '\n\nGracias por su compra. Documento de control, no es factura fiscal.';
    return t;
  }

  function waUrl(s) {
    var ph = String(s.customerPhone || '').replace(/\D/g, '');
    if (/^0\d{10}$/.test(ph)) ph = '58' + ph.slice(1);
    if (ph.length < 11) ph = '';
    return 'https://wa.me/' + ph + '?text=' + encodeURIComponent(waText(s));
  }

  // ---- Factura en PDF ----
  function pdfName(s) {
    var n = String(s.customerName || 'Consumidor final').replace(/[^A-Za-z0-9\u00C0-\u00FF]+/g, '_').replace(/^_|_$/g, '');
    return 'Factura_' + String(s.saleNumber).replace(/[^A-Za-z0-9-]/g, '') + '_' + (n || 'Cliente') + '.pdf';
  }
  function pdfBlob(s) {
    var L = [], name = s.customerName || 'Consumidor final';
    L.push({ t: settings.companyName || 'Akira Motors', b: true, s: 12 });
    L.push({ t: 'FACTURA N° ' + s.saleNumber, b: true, s: 11 });
    L.push({ t: name, b: true, s: 10 });
    L.push({ t: 'Documento de control - no es factura fiscal', s: 7 });
    L.push({ t: '---' });
    L.push({ t: AKS.fmtDateTime(s.createdAt) });
    if (s.customerDoc) L.push({ t: 'RIF/C.I.: ' + s.customerDoc });
    L.push({ t: '---' });
    (s.items || []).forEach(function (x) {
      L.push({ t: x.name, b: true });
      L.push({ t: x.qty + ' x ' + AKS.usd(x.unitPrice) + ' = ' + AKS.usd(x.lineTotal) });
    });
    L.push({ t: '---' });
    L.push({ t: 'Subtotal: ' + AKS.usd(s.subtotal) });
    if (s.discount) L.push({ t: 'Descuento: -' + AKS.usd(s.discount) + (s.usdtDiscount ? ' (incl. pago USDT)' : '') });
    L.push({ t: 'TOTAL $: ' + AKS.usd(s.totalUsd), b: true, s: 11 });
    L.push({ t: 'TOTAL Bs: ' + AKS.bs(s.totalBs), b: true, s: 11 });
    L.push({ t: 'Tasa BCV: ' + Number(s.rate).toFixed(2) });
    L.push({ t: '---' });
    (s.payments || []).forEach(function (p) { L.push({ t: payLine(p) }); });
    if (s.changeUsd) L.push({ t: 'Vuelto: ' + AKS.usd(s.changeUsd) });
    if (s.onCredit) L.push({ t: 'SALDO PENDIENTE: ' + AKS.usd(s.balanceUsd) + (s.creditType === 'apartado' ? ' (apartado)' : ''), b: true, s: 10 });
    warrText(s).split('\n').filter(Boolean).forEach(function (w) { L.push({ t: w, s: 8 }); });
    L.push({ t: '---' });
    L.push({ t: 'Gracias por su compra!' });
    return AKS.pdf.ticket(L);
  }
  function downloadPdf(s) {
    var blob = pdfBlob(s), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = pdfName(s);
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return blob;
  }

  // WhatsApp: si el dispositivo permite compartir archivos, se envía el PDF;
  // si no, se descarga el PDF y se abre WhatsApp con el texto para adjuntarlo.
  async function sendWhatsApp(s) {
    try {
      var file = new File([pdfBlob(s)], pdfName(s), { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Factura N° ' + s.saleNumber + ' - ' + (s.customerName || ''), text: waText(s) });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    downloadPdf(s);
    window.open(waUrl(s), '_blank', 'noopener');
    alert('Se descargó el PDF de la factura. Adjúntalo en el chat de WhatsApp que se abrió.');
  }

  function printReceipt(s) {
    var w = window.open('', '_blank', 'width=380,height=640');
    if (!w) { alert('Permite ventanas emergentes para imprimir la factura.'); return; }
    var rows = (s.items || []).map(function (x) {
      return '<div class="it"><div>' + AKS.esc(x.name) + '</div><div>' + AKS.esc(x.qty) + ' x ' +
        AKS.usd(x.unitPrice) + ' = <strong>' + AKS.usd(x.lineTotal) + '</strong></div></div>';
    }).join('');
    var pays = (s.payments || []).map(function (p) { return '<div>' + AKS.esc(payLine(p)) + '</div>'; }).join('');
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Factura ' +
      AKS.esc(s.saleNumber) + '</title><style>@page{margin:2mm}' +
      'body{font:12px monospace;margin:0 auto;padding:3mm;width:70mm;max-width:100%;' +
      'text-align:center;box-sizing:border-box}hr{border:0;border-top:1px dashed #000;margin:6px 0}' +
      '.it{margin:5px 0}.big{font-size:15px;font-weight:bold}' +
      '.np{margin-top:10px}.np button,.np a{display:inline-block;margin:3px;padding:7px 10px;border:1px solid #333;' +
      'background:#fff;color:#000;border-radius:6px;font:13px Arial;text-decoration:none;cursor:pointer}' +
      '@media print{.np{display:none}}</style></head><body>' +
      '<div class="big">' + AKS.esc(settings.companyName) + '</div>' +
      '<div><strong>FACTURA INTERNA N° ' + AKS.esc(s.saleNumber) + '</strong></div>' +
      '<div>Documento de control · no es factura fiscal</div><hr>' +
      '<div>' + AKS.esc(AKS.fmtDateTime(s.createdAt)) + '</div>' +
      (s.customerName ? '<div>Cliente: ' + AKS.esc(s.customerName) + '</div>' : '') +
      (s.customerDoc ? '<div>RIF/C.I.: ' + AKS.esc(s.customerDoc) + '</div>' : '') +
      '<hr>' + rows + '<hr>' +
      '<div>Subtotal: ' + AKS.usd(s.subtotal) + '</div>' +
      (s.discount ? '<div>Descuento: -' + AKS.usd(s.discount) + (s.usdtDiscount ? ' (incl. pago USDT)' : '') + '</div>' : '') +
      '<div class="big">TOTAL $: ' + AKS.usd(s.totalUsd) + '</div>' +
      '<div class="big">TOTAL Bs: ' + AKS.bs(s.totalBs) + '</div>' +
      '<div>Tasa BCV: ' + Number(s.rate).toFixed(2) + '</div><hr>' + pays +
      (s.changeUsd ? '<div>Vuelto: ' + AKS.usd(s.changeUsd) + '</div>' : '') +
      (s.onCredit ? '<div class="big">SALDO PENDIENTE: ' + AKS.usd(s.balanceUsd) + (s.creditType === 'apartado' ? ' (apartado)' : '') + '</div>' : '') +
      (warrText(s) ? '<hr><div>' + AKS.esc(warrText(s)).replace(/\n/g, '<br>') + '</div>' : '') +
      '<hr><div>¡Gracias por su compra!</div>' +
      '<div class="np"><button onclick="window.print()">Imprimir</button>' +
      '<button id="rcPdf">Descargar PDF</button><button id="rcWa">Enviar por WhatsApp</button></div>' +
      '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
    try {
      var bp = w.document.getElementById('rcPdf'), bw = w.document.getElementById('rcWa');
      if (bp) bp.onclick = function () { downloadPdf(s); };
      if (bw) bw.onclick = function () { sendWhatsApp(s); };
    } catch (e) { console.warn(e); }
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
            '">Factura</button> <button class="btn btn-secondary btn-small" data-act="pdf" data-i="' + i +
            '">PDF</button> <button class="btn btn-secondary btn-small" data-act="wa" data-i="' + i +
            '">WhatsApp</button> ' + (ok ? '<button class="btn btn-danger btn-small" data-act="void" data-i="' +
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
          var after = AKS.q(before + it.qty);
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
      AKS.log('venta_anulada', s.saleNumber + ' por $' + s.totalUsd + '. Motivo: ' + reason.trim(), { saleNumber: s.saleNumber, totalUsd: s.totalUsd });
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
  // ------------------------------------------------------------
  // Extras: venta anotada en papel, crédito y pedido pegado de WhatsApp
  // ------------------------------------------------------------
  function syncExtras() {
    var pp = T().paper, on = $('aksK-paper');
    if (!on) return;
    on.checked = !!pp.on;
    $('aksK-paperbox').style.display = pp.on ? 'flex' : 'none';
    if ($('aksK-pdt').value !== pp.dt) $('aksK-pdt').value = pp.dt;
    if ($('aksK-prate').value !== String(pp.rate)) $('aksK-prate').value = pp.rate;
    if ($('aksK-pnote').value !== pp.note) $('aksK-pnote').value = pp.note;
  }

  function nowLocalInput() {
    var d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  async function applyRate() {
    var pp = T().paper;
    if (pp.on && AKS.num(pp.rate) > 0) rate = AKS.r2(AKS.num(pp.rate));
    else { try { rate = await AKS.getRate(false); } catch (e) { /* mantener */ } }
    renderTicket();
  }

  function parseWaOrder(text) {
    var items = [];
    String(text || '').split(/\r?\n/).forEach(function (ln) {
      ln = ln.trim();
      var m = ln.match(/^[-•*]\s*(.+?)\s+x\s*(\d+(?:[.,]\d+)?)\s*(?:=.*)?$/i);
      if (m) { items.push({ q: m[1], qty: AKS.q(parseFloat(m[2].replace(',', '.'))) }); return; }
      var s = ln.match(/^(.+?)\s*\(C[oó]digo\s+(.+?)\)\s*$/i);
      if (s) items.push({ q: s[2], name: s[1], qty: 1 });
    });
    return items;
  }

  function loadWaOrder() {
    var m = document.createElement('div');
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem';
    m.innerHTML = '<div style="background:#fff;border-radius:12px;padding:1.1rem;max-width:460px;width:100%;font-family:Arial,sans-serif">' +
      '<h3 style="margin:0 0 .4rem">Pedido de WhatsApp</h3>' +
      '<p style="margin:0 0 .6rem;color:#555;font-size:.9rem">Pega aquí el mensaje que te llegó de la tienda ("Hola, quisiera pedir estos repuestos...").</p>' +
      '<textarea id="aksWaT" rows="8" style="width:100%;box-sizing:border-box;font-size:16px"></textarea>' +
      '<div style="display:flex;gap:.5rem;margin-top:.6rem"><button id="aksWaX" style="flex:1;padding:.7rem">Cancelar</button>' +
      '<button id="aksWaO" style="flex:1;padding:.7rem;background:#FF6B1A;color:#fff;border:0;font-weight:700">Cargar a la factura</button></div></div>';
    document.body.appendChild(m);
    m.querySelector('#aksWaX').onclick = function () { m.remove(); };
    m.querySelector('#aksWaO').onclick = function () {
      var items = parseWaOrder(m.querySelector('#aksWaT').value);
      if (!items.length) { alert('No encontré productos en ese mensaje.'); return; }
      var miss = [], added = 0;
      items.forEach(function (it) {
        var nq = AKS.norm(it.q);
        var p = AKS.products.filter(function (x) { return AKS.norm(x.name) === nq || AKS.norm(x.code) === nq; })[0] ||
          AKS.searchProducts(it.q, 1)[0];
        if (!p) { miss.push(it.q); return; }
        if (p.stock < it.qty) { miss.push(p.name + ' (solo hay ' + p.stock + ')'); return; }
        addProduct(p);
        var l = T().cart.filter(function (z) { return z.productId === p.id; })[0];
        if (l) l.qty = AKS.q(it.qty);
        added++;
      });
      renderTicket();
      m.remove();
      if (miss.length) alert('Cargados: ' + added + '.\nNo se pudieron cargar:\n- ' + miss.join('\n- '));
    };
  }

  function bindExtras() {
    root.addEventListener('change', function (ev) {
      var t = ev.target, pp = T().paper;
      if (t.id === 'aksK-paper') {
        pp.on = t.checked;
        if (pp.on && !pp.dt) pp.dt = nowLocalInput();
        if (pp.on && !pp.rate) pp.rate = rate ? String(rate) : '';
        if (!pp.on) { pp.dt = ''; pp.rate = ''; pp.note = ''; }
        syncExtras(); applyRate();
      } else if (t.id === 'aksK-pdt') { pp.dt = t.value; }
      else if (t.id === 'aksK-prate') { pp.rate = t.value; applyRate(); }
      else if (t.id === 'aksK-pnote') { pp.note = t.value; }
      else if (t.id === 'aksK-credit') {
        $('aksK-credbox').style.display = t.checked ? 'flex' : 'none';
        renderPaySummary();
      }
    });
    root.addEventListener('input', function (ev) {
      var t = ev.target, pp = T().paper;
      if (t.id === 'aksK-pdt') pp.dt = t.value;
      else if (t.id === 'aksK-prate') pp.rate = t.value;
      else if (t.id === 'aksK-pnote') pp.note = t.value;
    });
    root.addEventListener('click', function (ev) {
      if (ev.target.id === 'aksK-waorder') loadWaOrder();
    });
  }

  function bind() {
    bindExtras();
    window.addEventListener('scroll', function () { if (root && root.offsetParent) renderTotals(); }, { passive: true });
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
        if (f === 'qty') l.qty = AKS.q(parseFloat(String(t.value).replace(',', '.')));
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
      var exact = AKS.products.filter(function (p) {
        return AKS.norm(p.code) === nq || String(p.altCodes || '').split(',').some(function (c) { return AKS.norm(c) === nq; });
      })[0];
      var p = exact || (mode === 'search' ? AKS.searchProducts(q, 1)[0] : null);
      if (p) { addProduct(p); ev.target.value = ''; renderGrid(); }
      else if (mode === 'barcode') { alert('No existe un producto con el código "' + q + '"'); ev.target.select(); }
    });
    root.addEventListener('click', function (ev) {
      var t = ev.target;
      var all = t.getAttribute && t.getAttribute('data-all');
      if (all) {
        var inp = root.querySelector('[data-pay="' + all + '"]');
        inp.value = '';
        var rem = Math.max(0, calc().total - payments().credit), mm = METHODS.filter(function (z) { return z.k === all; })[0];
        var v = mm.cur === 'USD' ? rem : (mm.cur === 'USDT' ? rem * rate / usdtRate : rem * rate);
        inp.value = rem > 0 ? AKS.r2(v) : '';
        renderPaySummary();
        return;
      }
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
        $('aksK-search').placeholder = mode === 'barcode' ? 'Escanea el código y pulsa Enter' : 'Buscar nombre, código, OEM, marca';
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
      } else if (act === 'pdf') {
        downloadPdf(todaySales[parseInt(t.getAttribute('data-i'), 10)]);
      } else if (act === 'wa') {
        sendWhatsApp(todaySales[parseInt(t.getAttribute('data-i'), 10)]);
      } else if (act === 'void') {
        voidSale(todaySales[parseInt(t.getAttribute('data-i'), 10)]);
      } else if (t.id === 'aksK-jump') {
        var rr = $('aksK-right'); if (rr) rr.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    try {
      var ao = await AKS.db().collection('cashOpenings').where('dateKey', '==', AKS.dateKey()).get();
      var hasOpen = false; ao.forEach(function () { hasOpen = true; });
      if (!hasOpen) AKS.alertBar('apertura', '<strong>Falta la apertura de caja de hoy.</strong> Regístrala en "Apertura y cierre de caja" para que el cierre cuadre con el fondo inicial.');
    } catch (e) { /* ignorar */ }
    try {
      var us0 = await AKS.db().collection('settings').doc('usdtRate').get();
      usdtRate = us0.exists ? (Number(us0.data().value) || 0) : 0;
    } catch (e) { usdtRate = 0; }
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

  AKS.caja = { downloadPdf: downloadPdf, pdfBlob: pdfBlob, printReceipt: printReceipt, sendWhatsApp: sendWhatsApp, voidSale: voidSale, open: open, charge: charge, addProduct: addProduct, openPay: openPay,
    getCart: function () { return T().cart; } };
})();
