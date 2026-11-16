// assets/js/admin/caja.js
// Caja (punto de venta de mostrador). Requiere sistema-core.js.
// Precios en $, total automático en Bs con la tasa BCV configurada.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('caja.js: falta sistema-core.js'); return; }

  var IVA = 0.16;
  var MAX_LINES = 60;
  var METHODS = [
    { k: 'efectivo_usd', label: 'Efectivo $', cur: 'USD' },
    { k: 'zelle', label: 'Zelle $', cur: 'USD' },
    { k: 'efectivo_bs', label: 'Efectivo Bs', cur: 'VES' },
    { k: 'pago_movil', label: 'Pago móvil Bs', cur: 'VES' },
    { k: 'punto', label: 'Punto de venta Bs', cur: 'VES' },
    { k: 'transferencia', label: 'Transferencia Bs', cur: 'VES' }
  ];
  var cart = [];
  var rate = 0;
  var settings = { ivaEnabled: true, companyName: 'AKIRA MOTORS' };
  var busy = false;
  var root = null;
  var todaySales = [];

  function $(id) { return document.getElementById(id); }

  function html() {
    var pay = METHODS.map(function (m) {
      return '<div class="form-group"><label>' + m.label + '</label>' +
        '<input type="number" min="0" step="0.01" data-pay="' + m.k +
        '" placeholder="0.00"></div>';
    }).join('');
    return '' +
      '<h2 class="section-title">Caja</h2>' +
      '<div class="aks-grid"><div>' +
      '<div class="admin-card"><h3>Productos</h3>' +
      '<input type="text" id="aksK-search" class="aks-search" ' +
      'placeholder="Código o nombre (Enter agrega el primero)" ' +
      'autocomplete="off"><div id="aksK-results" class="aks-results"></div>' +
      '<div class="aks-wrap"><table class="aks-table"><thead><tr>' +
      '<th>Producto</th><th>Cant.</th><th>Precio $</th><th>Subtotal</th>' +
      '<th></th></tr></thead><tbody id="aksK-body"></tbody></table></div>' +
      '<div id="aksK-empty" class="aks-muted" style="padding:.8rem 0">' +
      'Ticket vacío.</div></div>' +
      '<div class="admin-card"><h3>Cliente (opcional)</h3>' +
      '<div class="form-row-3"><div class="form-group"><label>Nombre</label>' +
      '<input type="text" id="aksK-cname" maxlength="80"></div>' +
      '<div class="form-group"><label>Teléfono</label>' +
      '<input type="tel" id="aksK-cphone" maxlength="11" ' +
      'placeholder="0412XXXXXXX"></div>' +
      '<div class="form-group"><label>Descuento general %</label>' +
      '<input type="number" id="aksK-disc" min="0" max="100" step="0.5" ' +
      'value="0"></div></div></div></div>' +

      '<div><div class="aks-total" id="aksK-totals"></div>' +
      '<div class="admin-card"><h3>Pago</h3>' + pay +
      '<div id="aksK-paysum" class="aks-muted"></div>' +
      '<div class="aks-inline" style="margin-top:.8rem">' +
      '<button class="btn btn-primary" id="aksK-charge">Cobrar</button>' +
      '<button class="btn btn-secondary" id="aksK-clear">Vaciar</button>' +
      '</div></div></div></div>' +

      '<div class="admin-card"><h3>Ventas de hoy</h3>' +
      '<div id="aksK-summary" class="aks-muted"></div>' +
      '<div id="aksK-list"></div></div>';
  }

  // ---------------- cálculos ----------------
  function calc() {
    var sub = 0;
    cart.forEach(function (l) { sub += l.qty * l.unitPrice; });
    sub = AKS.r2(sub);
    var pct = Math.min(100, Math.max(0, AKS.num($('aksK-disc').value)));
    var disc = AKS.r2(sub * pct / 100);
    var base = AKS.r2(sub - disc);
    var iva = settings.ivaEnabled ? AKS.r2(base * IVA) : 0;
    var total = AKS.r2(base + iva);
    return { sub: sub, pct: pct, disc: disc, iva: iva, total: total,
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

  function renderTotals() {
    var t = calc();
    var p = payments();
    $('aksK-totals').innerHTML =
      '<div class="aks-row"><span>Subtotal</span><span>' + AKS.usd(t.sub) +
      '</span></div>' +
      (t.disc ? '<div class="aks-row"><span>Descuento ' + t.pct +
        '%</span><span>-' + AKS.usd(t.disc) + '</span></div>' : '') +
      (settings.ivaEnabled ? '<div class="aks-row"><span>IVA 16%</span>' +
        '<span>' + AKS.usd(t.iva) + '</span></div>' : '') +
      '<div class="aks-row"><span>TOTAL $</span><span class="big">' +
      AKS.usd(t.total) + '</span></div>' +
      '<div class="aks-row"><span>TOTAL Bs (tasa ' + rate.toFixed(2) +
      ')</span><span class="big">' + AKS.bs(t.totalBs) + '</span></div>';
    var diff = AKS.r2(p.paidUsd - t.total);
    var s = 'Recibido: ' + AKS.usd(p.paidUsd) + ' (' +
      AKS.bs(p.paidUsd * rate) + ') · ';
    if (!cart.length) s += 'agrega productos';
    else if (diff >= 0) {
      s += '<span class="aks-ok">Vuelto: ' + AKS.usd(diff) + ' / ' +
        AKS.bs(diff * rate) + '</span>';
    } else {
      s += '<span class="aks-bad">Falta: ' + AKS.usd(-diff) + ' / ' +
        AKS.bs(-diff * rate) + '</span>';
    }
    $('aksK-paysum').innerHTML = s;
    cart.forEach(function (l, i) {
      var c = $('aksK-line-' + i);
      if (c) c.textContent = AKS.usd(AKS.r2(l.qty * l.unitPrice));
    });
  }

  function renderCart() {
    var h = '';
    cart.forEach(function (l, i) {
      h += '<tr data-i="' + i + '"><td><strong>' + AKS.esc(l.name) +
        '</strong><br><span class="aks-muted">' + AKS.esc(l.code) +
        ' · stock ' + l.stock + '</span></td>' +
        '<td><input type="number" class="qty" min="1" step="1" data-f="qty" ' +
        'value="' + l.qty + '"></td>' +
        '<td><input type="number" min="0" step="0.01" data-f="price" ' +
        'value="' + l.unitPrice + '">' +
        (l.override ? '<br><span class="aks-muted">editado</span>' : '') +
        '</td><td id="aksK-line-' + i + '"></td>' +
        '<td><button class="btn btn-danger btn-small" data-act="rm">X' +
        '</button></td></tr>';
    });
    $('aksK-body').innerHTML = h;
    $('aksK-empty').style.display = cart.length ? 'none' : 'block';
    renderTotals();
  }

  function addProduct(p) {
    var ex = cart.filter(function (l) { return l.productId === p.id; })[0];
    if (ex) { ex.qty += 1; }
    else {
      if (cart.length >= MAX_LINES) { alert('Máximo ' + MAX_LINES + ' líneas.'); return; }
      var price = AKS.effectivePrice(p);
      cart.push({ productId: p.id, code: p.code, name: p.name,
        stock: p.stock, qty: 1, unitPrice: price, basePrice: price,
        override: false });
    }
    renderCart();
  }

  function showResults(q) {
    var box = $('aksK-results');
    var found = AKS.searchProducts(q, 8);
    if (!q.trim()) { box.innerHTML = ''; return found; }
    box.innerHTML = found.length ? found.map(function (p) {
      return '<div class="aks-result" data-id="' + AKS.esc(p.id) + '"><div>' +
        '<strong>' + AKS.esc(p.name) + '</strong><small>' + AKS.esc(p.code) +
        ' · ' + AKS.esc(p.brand) + ' · stock ' + p.stock + '</small></div>' +
        '<div><strong>' + AKS.usd(AKS.effectivePrice(p)) + '</strong><br>' +
        '<small>' + AKS.bs(AKS.effectivePrice(p) * rate) + '</small></div>' +
        '</div>';
    }).join('') : '<div class="aks-muted">Sin resultados.</div>';
    return found;
  }

  // ---------------- cobrar ----------------
  async function charge() {
    if (busy) return;
    if (!cart.length) { alert('El ticket está vacío'); return; }
    for (var i = 0; i < cart.length; i++) {
      var l = cart[i];
      if (!(Number.isInteger(l.qty) && l.qty >= 1)) {
        alert('Cantidad inválida: ' + l.name); return;
      }
      if (!(l.unitPrice > 0)) { alert('Precio inválido: ' + l.name); return; }
      if (l.qty > l.stock &&
          !confirm('"' + l.name + '" tiene stock ' + l.stock +
            ' y vas a vender ' + l.qty + '. El sistema lo bloqueará si ' +
            'el stock real es menor. ¿Continuar?')) return;
    }
    var shown = rate;
    busy = true;
    var btn = $('aksK-charge');
    btn.disabled = true;
    btn.textContent = 'Procesando...';
    try {
      rate = await AKS.getRate(true);
      if (rate !== shown) {
        renderTotals();
        alert('La tasa BCV cambió de ' + shown + ' a ' + rate +
          '. Revisa el total en Bs y cobra de nuevo.');
        return;
      }
      var t = calc();
      var p = payments();
      if (p.paidUsd + 0.005 < t.total) {
        alert('El pago no cubre el total. Falta ' +
          AKS.usd(t.total - p.paidUsd));
        return;
      }
      var phone = $('aksK-cphone').value.trim();
      if (phone && !/^04\d{9}$/.test(phone)) {
        alert('Teléfono: formato 0412XXXXXXX'); return;
      }
      var db = AKS.db();
      var saleRef = db.collection('sales').doc();
      var counterRef = db.collection('settings').doc('adminSettings');
      var nowIso = new Date().toISOString();
      var user = AKS.userLabel();
      var result = null;

      await db.runTransaction(async function (tx) {
        var counterSnap = await tx.get(counterRef);
        var prodSnaps = [], costSnaps = [];
        for (var a = 0; a < cart.length; a++) {
          prodSnaps.push(await tx.get(
            db.collection('products').doc(cart[a].productId)));
        }
        for (var b = 0; b < cart.length; b++) {
          costSnaps.push(await tx.get(
            db.collection('productCosts').doc(cart[b].productId)));
        }
        var qtyByProd = {};
        for (var c = 0; c < cart.length; c++) {
          if (!prodSnaps[c].exists) {
            throw new Error('"' + cart[c].name + '" ya no existe.');
          }
          qtyByProd[cart[c].productId] = (qtyByProd[cart[c].productId] || 0) +
            cart[c].qty;
        }
        for (var d = 0; d < cart.length; d++) {
          var st = Number(prodSnaps[d].data().stock) || 0;
          if (qtyByProd[cart[d].productId] > st) {
            throw new Error('Stock insuficiente de "' + cart[d].name +
              '": quedan ' + st + '.');
          }
        }
        var n = (counterSnap.exists
          ? (Number(counterSnap.data().saleCounter) || 0) : 0) + 1;
        var number = 'V-' + String(n).padStart(6, '0');

        var lines = [], costTotal = 0;
        for (var k = 0; k < cart.length; k++) {
          var x = cart[k];
          var before = Number(prodSnaps[k].data().stock) || 0;
          var after = before - x.qty;
          // si hay dos líneas del mismo producto, el stock final se acumula
          tx.update(db.collection('products').doc(x.productId), {
            stock: after, updatedAt: nowIso });
          var cost = costSnaps[k].exists
            ? (Number(costSnaps[k].data().costPrice) || 0) : 0;
          costTotal += cost * x.qty;
          AKS.movement(tx, { productId: x.productId, code: x.code,
            name: x.name, type: 'venta', qty: -x.qty, stockBefore: before,
            stockAfter: after, refType: 'sale', refId: saleRef.id });
          lines.push({ productId: x.productId, code: x.code, name: x.name,
            qty: x.qty, unitPrice: x.unitPrice, basePrice: x.basePrice,
            priceOverride: !!x.override, unitCost: cost,
            lineTotal: AKS.r2(x.qty * x.unitPrice) });
        }
        // Gastos: el costo del IVA no es ganancia; ganancia = base - costo
        var profit = AKS.r2(t.sub - t.disc - costTotal);
        tx.set(counterRef, { saleCounter: n }, { merge: true });
        result = {
          saleNumber: number, items: lines,
          subtotal: t.sub, discountPct: t.pct, discount: t.disc,
          iva: t.iva, totalUsd: t.total, rate: rate,
          totalBs: t.totalBs, costUsd: AKS.r2(costTotal),
          profitUsd: profit, payments: p.list, paidUsd: p.paidUsd,
          changeUsd: AKS.r2(Math.max(0, p.paidUsd - t.total)),
          customerName: $('aksK-cname').value.trim(),
          customerPhone: phone, channel: 'mostrador',
          dateKey: AKS.dateKey(), status: 'completed',
          seller: user, createdAt: nowIso
        };
        tx.set(saleRef, result);
      });

      printReceipt(result);
      cart = [];
      root.querySelectorAll('[data-pay]').forEach(function (e) {
        e.value = '';
      });
      $('aksK-cname').value = '';
      $('aksK-cphone').value = '';
      $('aksK-disc').value = '0';
      AKS.refreshAdminProducts();
      await AKS.loadProducts(true);
      renderCart();
      await loadToday();
    } catch (e) {
      console.error('Error al cobrar:', e);
      alert('No se pudo registrar la venta: ' + e.message);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = 'Cobrar';
    }
  }

  // ---------------- recibo ----------------
  function printReceipt(s) {
    var w = window.open('', '_blank', 'width=380,height=640');
    if (!w) { alert('Permite ventanas emergentes para imprimir el recibo.'); return; }
    var rows = (s.items || []).map(function (x) {
      return '<tr><td>' + AKS.esc(x.qty) + ' x ' + AKS.esc(x.name) +
        '</td><td style="text-align:right">' + AKS.usd(x.lineTotal) +
        '</td></tr>';
    }).join('');
    var pays = (s.payments || []).map(function (p) {
      var m = METHODS.filter(function (z) { return z.k === p.method; })[0];
      return '<div>' + AKS.esc(m ? m.label : p.method) + ': ' +
        (p.currency === 'USD' ? AKS.usd(p.amount) : AKS.bs(p.amount)) +
        '</div>';
    }).join('');
    w.document.write('<!doctype html><html><head><meta charset="utf-8">' +
      '<title>' + AKS.esc(s.saleNumber) + '</title><style>' +
      'body{font:13px monospace;margin:10px;max-width:340px}' +
      'table{width:100%}hr{border:0;border-top:1px dashed #000}' +
      '</style></head><body><h3 style="text-align:center;margin:0">' +
      AKS.esc(settings.companyName) + '</h3>' +
      '<div style="text-align:center">Recibo interno · NO es factura fiscal' +
      '</div><hr><div>' + AKS.esc(s.saleNumber) + ' · ' +
      AKS.esc(AKS.fmtDateTime(s.createdAt)) + '</div>' +
      (s.customerName ? '<div>Cliente: ' + AKS.esc(s.customerName) +
        '</div>' : '') + '<hr><table>' + rows + '</table><hr>' +
      '<table><tr><td>Subtotal</td><td style="text-align:right">' +
      AKS.usd(s.subtotal) + '</td></tr>' +
      (s.discount ? '<tr><td>Descuento</td><td style="text-align:right">-' +
        AKS.usd(s.discount) + '</td></tr>' : '') +
      (s.iva ? '<tr><td>IVA 16%</td><td style="text-align:right">' +
        AKS.usd(s.iva) + '</td></tr>' : '') +
      '<tr><td><strong>TOTAL $</strong></td><td style="text-align:right">' +
      '<strong>' + AKS.usd(s.totalUsd) + '</strong></td></tr>' +
      '<tr><td><strong>TOTAL Bs</strong></td><td style="text-align:right">' +
      '<strong>' + AKS.bs(s.totalBs) + '</strong></td></tr></table>' +
      '<div>Tasa BCV: ' + s.rate.toFixed(2) + '</div><hr>' + pays +
      (s.changeUsd ? '<div>Vuelto: ' + AKS.usd(s.changeUsd) + '</div>' : '') +
      '<hr><div style="text-align:center">¡Gracias por su compra!</div>' +
      '<script>window.onload=function(){window.print()}<\/script>' +
      '</body></html>');
    w.document.close();
  }

  // ---------------- ventas de hoy / anular ----------------
  async function loadToday() {
    var box = $('aksK-list');
    try {
      var snap = await AKS.db().collection('sales')
        .where('dateKey', '==', AKS.dateKey()).get();
      todaySales = [];
      snap.forEach(function (d) {
        var s = d.data(); s._id = d.id; todaySales.push(s);
      });
      todaySales.sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
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
        todaySales.filter(function (s) { return s.status === 'completed'; })
          .length + ' ventas';
      Object.keys(byM).forEach(function (k) {
        var m = METHODS.filter(function (z) { return z.k === k; })[0];
        sum += '<br>' + AKS.esc(m ? m.label : k) + ': ' +
          (byM[k].cur === 'USD' ? AKS.usd(byM[k].amt) : AKS.bs(byM[k].amt));
      });
      $('aksK-summary').innerHTML = sum;
      if (!todaySales.length) { box.innerHTML = '<div class="aks-muted">Sin ventas hoy.</div>'; return; }
      box.innerHTML = '<div class="aks-wrap"><table class="aks-table"><thead>' +
        '<tr><th>N°</th><th>Hora</th><th>Total</th><th>Estado</th><th></th>' +
        '</tr></thead><tbody>' + todaySales.map(function (s, i) {
          var ok = s.status === 'completed';
          return '<tr><td>' + AKS.esc(s.saleNumber) + '</td><td>' +
            AKS.esc(AKS.fmtDateTime(s.createdAt)) + '</td><td>' +
            AKS.usd(s.totalUsd) + '<br><span class="aks-muted">' +
            AKS.bs(s.totalBs) + '</span></td><td>' +
            (ok ? '<span class="aks-ok">Completada</span>'
              : '<span class="aks-bad">Anulada</span>') + '</td><td>' +
            '<button class="btn btn-secondary btn-small" data-act="print" ' +
            'data-i="' + i + '">Recibo</button> ' +
            (ok ? '<button class="btn btn-danger btn-small" data-act="void" ' +
              'data-i="' + i + '">Anular</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } catch (e) {
      console.error(e);
      box.innerHTML = '<span class="aks-bad">No se pudo cargar: ' +
        AKS.esc(e.message) + '</span>';
    }
  }

  async function voidSale(s) {
    var reason = prompt('Motivo de la anulación de ' + s.saleNumber + ':');
    if (!reason || !reason.trim()) return;
    var db = AKS.db();
    try {
      await db.runTransaction(async function (tx) {
        var ref = db.collection('sales').doc(s._id);
        var cur = await tx.get(ref);
        if (!cur.exists || cur.data().status !== 'completed') {
          throw new Error('La venta ya no está activa.');
        }
        var snaps = [];
        for (var i = 0; i < s.items.length; i++) {
          snaps.push(await tx.get(
            db.collection('products').doc(s.items[i].productId)));
        }
        var added = {};
        for (var k = 0; k < s.items.length; k++) {
          var it = s.items[k];
          if (!snaps[k].exists) continue; // producto borrado: no hay stock que devolver
          var base = Number(snaps[k].data().stock) || 0;
          var before = base + (added[it.productId] || 0);
          var after = before + it.qty;
          added[it.productId] = (added[it.productId] || 0) + it.qty;
          tx.update(db.collection('products').doc(it.productId), {
            stock: after, updatedAt: new Date().toISOString() });
          AKS.movement(tx, { productId: it.productId, code: it.code,
            name: it.name, type: 'anulacion_venta', qty: it.qty,
            stockBefore: before, stockAfter: after,
            refType: 'sale', refId: s._id });
        }
        tx.update(ref, { status: 'voided', voidReason: reason.trim(),
          voidedBy: AKS.userLabel(), voidedAt: new Date().toISOString() });
      });
      AKS.refreshAdminProducts();
      await AKS.loadProducts(true);
      await loadToday();
    } catch (e) {
      console.error(e);
      alert('No se pudo anular: ' + e.message);
    }
  }

  // ---------------- eventos ----------------
  function bind() {
    root.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t.id === 'aksK-search') { showResults(t.value); return; }
      var f = t.getAttribute('data-f');
      if (f) {
        var i = parseInt(t.closest('tr').getAttribute('data-i'), 10);
        var l = cart[i];
        if (!l) return;
        if (f === 'qty') l.qty = parseInt(t.value, 10) || 0;
        else { l.unitPrice = AKS.num(t.value); l.override = l.unitPrice !== l.basePrice; }
      }
      renderTotals();
    });
    root.addEventListener('keydown', function (ev) {
      if (ev.target.id === 'aksK-search' && ev.key === 'Enter') {
        ev.preventDefault();
        var found = AKS.searchProducts(ev.target.value, 1);
        if (found.length) {
          addProduct(found[0]);
          ev.target.value = '';
          $('aksK-results').innerHTML = '';
        }
      }
    });
    root.addEventListener('click', function (ev) {
      var t = ev.target;
      var res = t.closest && t.closest('.aks-result');
      if (res && res.parentNode.id === 'aksK-results') {
        var p = AKS.products.filter(function (x) {
          return x.id === res.getAttribute('data-id');
        })[0];
        if (p) { addProduct(p); $('aksK-search').value = ''; $('aksK-results').innerHTML = ''; $('aksK-search').focus(); }
        return;
      }
      var act = t.getAttribute && t.getAttribute('data-act');
      if (act === 'rm') {
        cart.splice(parseInt(t.closest('tr').getAttribute('data-i'), 10), 1);
        renderCart();
      } else if (act === 'print') {
        printReceipt(todaySales[parseInt(t.getAttribute('data-i'), 10)]);
      } else if (act === 'void') {
        voidSale(todaySales[parseInt(t.getAttribute('data-i'), 10)]);
      } else if (t.id === 'aksK-charge') charge();
      else if (t.id === 'aksK-clear') {
        if (!cart.length || confirm('¿Vaciar el ticket?')) { cart = []; renderCart(); }
      }
    });
  }

  async function open() {
    try {
      await AKS.loadProducts(true);
      rate = await AKS.getRate(true);
      settings = await AKS.getSettings(true);
    } catch (e) { alert(e.message); return; }
    renderCart();
    loadToday();
    var s = $('aksK-search'); if (s) s.focus();
  }

  AKS.init(function () {
    root = AKS.addSection('caja', html());
    if (!root) return;
    bind();
    AKS.addMenuItem('Caja (POS)', 'caja', open, 'caja');
  });

  AKS.caja = { open: open, charge: charge, addProduct: addProduct,
    getCart: function () { return cart; } };
})();
